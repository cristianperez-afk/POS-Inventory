import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessModule, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, paginateQuery, PaginatedResult } from '../common/dto/pagination.dto';
import { CreateSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateSaleDto,
    businessId: string,
    module: BusinessModule,
    cashierId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const itemIds = dto.items.map((i) => i.inventoryItemId);

      // Lock inventory rows before reading quantities
      await tx.$queryRaw`
        SELECT id FROM "InventoryItem"
        WHERE id = ANY(${itemIds}::uuid[])
        FOR UPDATE
      `;

      const inventoryItems = await tx.inventoryItem.findMany({
        where: { id: { in: itemIds }, businessId },
      });

      const itemMap = new Map(inventoryItems.map((item) => [item.id, item]));

      for (const saleItem of dto.items) {
        const item = itemMap.get(saleItem.inventoryItemId);
        if (!item) {
          throw new NotFoundException(`Inventory item ${saleItem.inventoryItemId} not found`);
        }
        if (item.quantity < saleItem.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${item.name}" (available: ${item.quantity}, required: ${saleItem.quantity})`,
          );
        }
      }

      const subtotal = dto.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
      const discount = dto.discount ?? 0;
      const tax = dto.tax ?? 0;
      const total = subtotal - discount + tax;
      const change = Math.max(0, dto.amountPaid - total);
      const transactionNumber = `TXN-${Date.now()}`;

      let sale;
      try {
        sale = await tx.sale.create({
          data: {
            transactionNumber,
            locationId: dto.locationId,
            cashierId,
            subtotal,
            discount,
            tax,
            total,
            paymentMethod: dto.paymentMethod,
            amountPaid: dto.amountPaid,
            change,
            customer: dto.customer,
            businessId,
            module,
            items: {
              create: dto.items.map((i) => {
                const item = itemMap.get(i.inventoryItemId)!;
                return {
                  inventoryItemId: i.inventoryItemId,
                  name: item.name,
                  quantity: i.quantity,
                  unitPrice: i.unitPrice,
                  totalPrice: i.quantity * i.unitPrice,
                };
              }),
            },
          },
          include: this.saleInclude,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException(`Transaction number "${transactionNumber}" already exists`);
        }
        throw error;
      }

      for (const saleItem of dto.items) {
        const item = itemMap.get(saleItem.inventoryItemId)!;
        const previousQuantity = item.quantity;
        const newQuantity = previousQuantity - saleItem.quantity;

        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { quantity: newQuantity },
        });

        await tx.stockMovement.create({
          data: {
            type: 'SALE',
            quantity: saleItem.quantity,
            previousQuantity,
            newQuantity,
            unit: item.unit,
            reason: 'Point of sale',
            referenceType: 'SALE',
            referenceId: sale.id,
            notes: `Sale ${transactionNumber}`,
            itemId: item.id,
            locationId: dto.locationId,
            businessId,
            module,
            createdById: cashierId,
          },
        });

        // Update local map so subsequent items use correct quantities
        itemMap.set(item.id, { ...item, quantity: newQuantity });
      }

      if (dto.kitchenOrderId) {
        const kitchenOrder = await tx.kitchenOrder.findFirst({
          where: { id: dto.kitchenOrderId, businessId },
        });
        if (!kitchenOrder) {
          throw new NotFoundException(`Kitchen order #${dto.kitchenOrderId} not found`);
        }
        await tx.kitchenOrder.update({
          where: { id: dto.kitchenOrderId },
          data: { saleId: sale.id },
        });
        sale = await tx.sale.findUnique({ where: { id: sale.id }, include: this.saleInclude }) as any;
      }

      return sale;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async findAll(
    businessId: string,
    module: BusinessModule,
    locationId?: string,
    status?: string,
    dateFrom?: string,
    dateTo?: string,
    page = 1,
    limit = 50,
  ): Promise<PaginatedResult<any>> {
    const where: Prisma.SaleWhereInput = {
      businessId,
      module,
      ...(locationId ? { locationId } : {}),
      ...(status ? { status: status as any } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: this.saleInclude,
        orderBy: { createdAt: 'desc' },
        ...paginateQuery(page, limit),
      }),
      this.prisma.sale.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async findOne(id: string, businessId: string, module: BusinessModule) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, businessId, module },
      include: this.saleInclude,
    });
    if (!sale) throw new NotFoundException(`Sale #${id} not found`);
    return sale;
  }

  async refund(
    id: string,
    refundReason: string,
    businessId: string,
    module: BusinessModule,
    refundedById?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id, businessId, module },
        include: { items: true },
      });
      if (!sale) throw new NotFoundException(`Sale #${id} not found`);
      if (sale.status !== 'COMPLETED') {
        throw new BadRequestException('Only COMPLETED sales can be refunded');
      }

      const itemIds = sale.items.map((i) => i.inventoryItemId);
      await tx.$queryRaw`
        SELECT id FROM "InventoryItem"
        WHERE id = ANY(${itemIds}::uuid[])
        FOR UPDATE
      `;

      for (const saleItem of sale.items) {
        const item = await tx.inventoryItem.findUnique({ where: { id: saleItem.inventoryItemId } });
        if (!item) continue;

        const previousQuantity = item.quantity;
        const newQuantity = previousQuantity + saleItem.quantity;

        await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: newQuantity } });

        await tx.stockMovement.create({
          data: {
            type: 'VOID_RESTOCK',
            quantity: saleItem.quantity,
            previousQuantity,
            newQuantity,
            unit: item.unit,
            reason: refundReason,
            referenceType: 'SALE',
            referenceId: sale.id,
            notes: `Refund for sale ${sale.transactionNumber}`,
            itemId: item.id,
            locationId: sale.locationId,
            businessId,
            module: sale.module,
            createdById: refundedById,
          },
        });
      }

      const result = await tx.sale.updateMany({
        where: { id, businessId, module, status: 'COMPLETED' },
        data: { status: 'REFUNDED', refundReason },
      });
      if (result.count === 0) {
        throw new NotFoundException(`Sale #${id} not found`);
      }
      return tx.sale.findFirstOrThrow({
        where: { id, businessId, module },
        include: this.saleInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private readonly saleInclude = {
    location: true,
    cashier: { select: { id: true, name: true } },
    items: { include: { inventoryItem: true } },
    kitchenOrder: { select: { id: true, receiptNo: true, status: true } },
  };
}
