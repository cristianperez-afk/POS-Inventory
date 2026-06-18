import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessModule, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, paginateQuery, PaginatedResult } from '../common/dto/pagination.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateTransferDto,
    businessId: string,
    module: BusinessModule,
    createdById?: string,
  ) {
    if (dto.fromLocationId === dto.toLocationId) {
      throw new BadRequestException('Source and destination locations must be different');
    }
    const locations = await this.prisma.location.count({
      where: {
        businessId,
        id: { in: [dto.fromLocationId, dto.toLocationId] },
      },
    });
    if (locations !== 2) {
      throw new BadRequestException(
        'Source or destination location is unavailable for this business',
      );
    }

    const itemIds = [...new Set(dto.items.map((item) => item.inventoryItemId))];
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        businessId,
        locationId: dto.fromLocationId,
        id: { in: itemIds },
        itemType:
          module === BusinessModule.RESTAURANT
            ? { in: ['INGREDIENT', 'MENU_ITEM', 'SUPPLY'] }
            : { in: ['RETAIL_ITEM', 'BUNDLE'] },
      },
      select: { id: true },
    });
    if (items.length !== itemIds.length) {
      throw new BadRequestException(
        'One or more transfer items are unavailable at the source location',
      );
    }
    const transferNumber = `TRF-${Date.now()}`;
    try {
      return await this.prisma.transfer.create({
        data: {
          transferNumber,
          fromLocationId: dto.fromLocationId,
          toLocationId: dto.toLocationId,
          notes: dto.notes,
          businessId,
          module,
          createdById,
          items: {
            create: dto.items.map((item) => ({
              inventoryItemId: item.inventoryItemId,
              quantity: item.quantity,
            })),
          },
        },
        include: this.transferInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Transfer number "${transferNumber}" already exists`);
      }
      throw error;
    }
  }

  async findAll(
    businessId: string,
    module: BusinessModule,
    status?: string,
    fromLocationId?: string,
    toLocationId?: string,
    page = 1,
    limit = 50,
  ): Promise<PaginatedResult<any>> {
    const where: Prisma.TransferWhereInput = {
      businessId,
      module,
      ...(status ? { status: status as any } : {}),
      ...(fromLocationId ? { fromLocationId } : {}),
      ...(toLocationId ? { toLocationId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.transfer.findMany({
        where,
        include: this.transferInclude,
        orderBy: { createdAt: 'desc' },
        ...paginateQuery(page, limit),
      }),
      this.prisma.transfer.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async findOne(
    id: string,
    businessId: string,
    module: BusinessModule,
  ) {
    const transfer = await this.prisma.transfer.findFirst({
      where: { id, businessId, module },
      include: this.transferInclude,
    });
    if (!transfer) throw new NotFoundException(`Transfer #${id} not found`);
    return transfer;
  }

  async dispatch(
    id: string,
    businessId: string,
    module: BusinessModule,
  ) {
    const transfer = await this.findOne(id, businessId, module);
    if (transfer.status !== 'PENDING') {
      throw new BadRequestException('Only PENDING transfers can be dispatched');
    }
    const result = await this.prisma.transfer.updateMany({
      where: { id, businessId, module, status: 'PENDING' },
      data: { status: 'IN_TRANSIT' },
    });
    if (result.count === 0) {
      await this.findOne(id, businessId, module);
      throw new BadRequestException(
        'Only PENDING transfers can be dispatched',
      );
    }
    return this.findOne(id, businessId, module);
  }

  async complete(
    id: string,
    businessId: string,
    module: BusinessModule,
    completedById?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findFirst({
        where: { id, businessId, module },
        include: { items: true },
      });
      if (!transfer) throw new NotFoundException(`Transfer #${id} not found`);
      if (transfer.status !== 'IN_TRANSIT') {
        throw new BadRequestException('Only IN_TRANSIT transfers can be completed');
      }

      // Lock all inventory rows involved before reading quantities
      const itemIds = transfer.items.map((i) => i.inventoryItemId);
      await tx.$queryRaw`
        SELECT id FROM "InventoryItem"
        WHERE id = ANY(${itemIds}::uuid[])
        FOR UPDATE
      `;

      for (const transferItem of transfer.items) {
        const item = await tx.inventoryItem.findUnique({
          where: { id: transferItem.inventoryItemId },
        });
        if (!item) continue;

        if (item.quantity < transferItem.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${item.name}" (available: ${item.quantity}, required: ${transferItem.quantity})`,
          );
        }

        const previousQuantity = item.quantity;
        const newQuantity = previousQuantity - transferItem.quantity;

        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { quantity: newQuantity },
        });

        await tx.stockMovement.create({
          data: {
            type: 'TRANSFER_OUT',
            quantity: transferItem.quantity,
            previousQuantity,
            newQuantity,
            unit: item.unit,
            reason: 'Stock transfer out',
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            notes: `Transfer ${transfer.transferNumber} out`,
            itemId: item.id,
            locationId: transfer.fromLocationId,
            businessId,
            module,
            createdById: completedById,
          },
        });

        // A SKU is unique across the business, so destination copies are stored
        // without one while the source item exists. Match that copy on later
        // transfers instead of creating another destination row.
        let destItem = await tx.inventoryItem.findFirst({
          where: {
            businessId,
            locationId: transfer.toLocationId,
            OR: [
              ...(item.sku ? [{ sku: item.sku }] : []),
              {
                sku: null,
                name: item.name,
                itemType: item.itemType,
                category: item.category,
                subcategory: item.subcategory,
                size: item.size,
                unit: item.unit,
              },
            ],
          },
        });

        if (!destItem) {
          // No matching item at destination — create one.
          // Omit SKU to avoid the @@unique([businessId, sku]) conflict when the
          // source item still exists with that SKU (partial transfer).
          destItem = await tx.inventoryItem.create({
            data: {
              name: item.name,
              itemType: item.itemType,
              category: item.category,
              targetCustomer: item.targetCustomer,
              subcategory: item.subcategory,
              size: item.size,
              condition: item.condition,
              quantity: 0,
              price: item.price,
              unit: item.unit,
              minStock: item.minStock,
              maxStock: item.maxStock,
              reorderPoint: item.reorderPoint,
              expiryDate: item.expiryDate,
              storageTemperature: item.storageTemperature,
              locationId: transfer.toLocationId,
              businessId,
            },
          });
        }

        const destPrevious = destItem.quantity;
        const destNew = destPrevious + transferItem.quantity;

        await tx.inventoryItem.update({
          where: { id: destItem.id },
          data: { quantity: destNew },
        });

        await tx.stockMovement.create({
          data: {
            type: 'TRANSFER_IN',
            quantity: transferItem.quantity,
            previousQuantity: destPrevious,
            newQuantity: destNew,
            unit: item.unit,
            reason: 'Stock transfer in',
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            notes: `Transfer ${transfer.transferNumber} in`,
            itemId: destItem.id,
            locationId: transfer.toLocationId,
            businessId,
            module,
            createdById: completedById,
          },
        });
      }

      const result = await tx.transfer.updateMany({
        where: { id, businessId, module, status: 'IN_TRANSIT' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (result.count === 0) {
        throw new NotFoundException(`Transfer #${id} not found`);
      }
      return tx.transfer.findFirstOrThrow({
        where: { id, businessId, module },
        include: this.transferInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancel(
    id: string,
    businessId: string,
    module: BusinessModule,
  ) {
    const transfer = await this.findOne(id, businessId, module);
    if (!['PENDING', 'IN_TRANSIT'].includes(transfer.status)) {
      throw new BadRequestException('Only PENDING or IN_TRANSIT transfers can be cancelled');
    }
    const result = await this.prisma.transfer.updateMany({
      where: {
        id,
        businessId,
        module,
        status: { in: ['PENDING', 'IN_TRANSIT'] },
      },
      data: { status: 'CANCELLED' },
    });
    if (result.count === 0) {
      await this.findOne(id, businessId, module);
      throw new BadRequestException(
        'Only PENDING or IN_TRANSIT transfers can be cancelled',
      );
    }
    return this.findOne(id, businessId, module);
  }

  private readonly transferInclude = {
    fromLocation: true,
    toLocation: true,
    items: { include: { inventoryItem: true } },
    createdBy: { select: { id: true, name: true, email: true } },
  };
}
