import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessModule, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, paginateQuery, PaginatedResult } from '../common/dto/pagination.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreatePurchaseOrderDto,
    businessId: string,
    module: BusinessModule,
    createdById?: string,
  ) {
    const orderNumber = `PO-${Date.now()}`;
    const totalAmount = dto.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    await this.assertReferencesBelongToBusiness(dto, businessId, module);
    try {
      return await this.prisma.purchaseOrder.create({
        data: {
          orderNumber,
          supplierId: dto.supplierId,
          notes: dto.notes,
          paymentMethod: dto.paymentMethod,
          paymentTerms: dto.paymentTerms,
          expectedDelivery: dto.expectedDelivery
            ? new Date(dto.expectedDelivery)
            : undefined,
          totalAmount,
          businessId,
          module,
          createdById,
          items: {
            create: dto.items.map((item) => ({
              inventoryItemId: item.inventoryItemId,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.quantity * item.unitPrice,
            })),
          },
        },
        include: this.poInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Order number "${orderNumber}" already exists`);
      }
      throw error;
    }
  }

  async findAll(
    businessId: string,
    module: BusinessModule,
    status?: string,
    supplierId?: string,
    page = 1,
    limit = 50,
  ): Promise<PaginatedResult<any>> {
    const where: Prisma.PurchaseOrderWhereInput = {
      businessId,
      module,
      ...(status ? { status: status as any } : {}),
      ...(supplierId ? { supplierId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: this.poInclude,
        orderBy: { createdAt: 'desc' },
        ...paginateQuery(page, limit),
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async findOne(
    id: string,
    businessId: string,
    module: BusinessModule,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, businessId, module },
      include: this.poInclude,
    });
    if (!po) throw new NotFoundException(`Purchase order #${id} not found`);
    return po;
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
    businessId: string,
    module: BusinessModule,
  ) {
    const po = await this.findOne(id, businessId, module);
    if (!['DRAFT', 'SUBMITTED'].includes(po.status)) {
      throw new BadRequestException('Only DRAFT or SUBMITTED orders can be edited');
    }
    const result = await this.prisma.purchaseOrder.updateMany({
      where: {
        id,
        businessId,
        module,
        status: { in: ['DRAFT', 'SUBMITTED'] },
      },
      data: (({ module: _ignoredModule, ...data }) => data)(dto),
    });
    if (result.count === 0) {
      await this.findOne(id, businessId, module);
      throw new BadRequestException(
        'Only DRAFT or SUBMITTED orders can be edited',
      );
    }
    return this.findOne(id, businessId, module);
  }

  async submit(
    id: string,
    businessId: string,
    module: BusinessModule,
  ) {
    const po = await this.findOne(id, businessId, module);
    if (po.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT orders can be submitted');
    }
    const result = await this.prisma.purchaseOrder.updateMany({
      where: { id, businessId, module, status: 'DRAFT' },
      data: { status: 'SUBMITTED' },
    });
    if (result.count === 0) {
      await this.findOne(id, businessId, module);
      throw new BadRequestException('Only DRAFT orders can be submitted');
    }
    return this.findOne(id, businessId, module);
  }

  async approve(
    id: string,
    businessId: string,
    role: string,
    module: BusinessModule,
  ) {
    if (!['Admin', 'Manager'].includes(role)) {
      throw new ForbiddenException('Only Admin or Manager can approve purchase orders');
    }
    const po = await this.findOne(id, businessId, module);
    if (po.status !== 'SUBMITTED') {
      throw new BadRequestException('Only SUBMITTED orders can be approved');
    }
    const result = await this.prisma.purchaseOrder.updateMany({
      where: { id, businessId, module, status: 'SUBMITTED' },
      data: { status: 'APPROVED' },
    });
    if (result.count === 0) {
      await this.findOne(id, businessId, module);
      throw new BadRequestException(
        'Only SUBMITTED orders can be approved',
      );
    }
    return this.findOne(id, businessId, module);
  }

  async receive(
    id: string,
    dto: ReceivePurchaseOrderDto,
    businessId: string,
    module: BusinessModule,
    receivedById?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id, businessId, module },
        include: { items: true },
      });
      if (!po) throw new NotFoundException(`Purchase order #${id} not found`);
      if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
        throw new BadRequestException(
          'Only APPROVED or PARTIALLY_RECEIVED orders can be received',
        );
      }

      const receiptNumber = `GR-${Date.now()}`;
      const receiptItems: Array<{
        purchaseOrderItemId: string;
        inventoryItemId?: string;
        receivedQty: number;
        rejectedQty: number;
        condition?: string;
        notes?: string;
      }> = [];

      for (const receiveItem of dto.items) {
        const poItem = po.items.find((i) => i.id === receiveItem.id);
        if (!poItem) {
          throw new BadRequestException(
            `Purchase order item #${receiveItem.id} does not belong to this order`,
          );
        }

        const processedQty = poItem.receivedQty + poItem.rejectedQty;
        const submittedQty = receiveItem.receivedQty + receiveItem.rejectedQty;
        if (submittedQty <= 0) continue;
        if (processedQty + submittedQty > poItem.quantity) {
          throw new BadRequestException(
            `Receipt quantity for "${poItem.name}" exceeds the remaining ordered quantity`,
          );
        }

        if (receiveItem.receivedQty > 0 && poItem.inventoryItemId) {
          const item = await tx.inventoryItem.findFirst({
            where: { id: poItem.inventoryItemId, businessId },
          });
          if (!item) {
            throw new BadRequestException(
              `Inventory item for "${poItem.name}" is unavailable`,
            );
          }

          const previousQuantity = item.quantity;
          const newQuantity = previousQuantity + receiveItem.receivedQty;
          const wacPrice =
            newQuantity > 0
              ? (previousQuantity * item.price +
                  receiveItem.receivedQty * poItem.unitPrice) /
                newQuantity
              : item.price;

          await tx.inventoryItem.update({
            where: { id: item.id },
            data: {
              quantity: newQuantity,
              price: wacPrice,
              ...(receiveItem.expiryDate
                ? { expiryDate: new Date(receiveItem.expiryDate) }
                : {}),
              ...(receiveItem.storageTemperature
                ? { storageTemperature: receiveItem.storageTemperature }
                : {}),
            },
          });

          await tx.stockMovement.create({
            data: {
              type: 'STOCK_IN',
              quantity: receiveItem.receivedQty,
              previousQuantity,
              newQuantity,
              unit: item.unit,
              reason: 'Purchase order received',
              referenceType: 'PURCHASE_ORDER',
              referenceId: po.id,
              notes: `Received from PO ${po.orderNumber}`,
              itemId: item.id,
              locationId: item.locationId,
              businessId,
              module,
              createdById: receivedById,
            },
          });
        }

        await tx.purchaseOrderItem.update({
          where: { id: receiveItem.id },
          data: {
            receivedQty: { increment: receiveItem.receivedQty },
            rejectedQty: { increment: receiveItem.rejectedQty },
          },
        });

        receiptItems.push({
          purchaseOrderItemId: poItem.id,
          inventoryItemId: poItem.inventoryItemId ?? undefined,
          receivedQty: receiveItem.receivedQty,
          rejectedQty: receiveItem.rejectedQty,
          condition: receiveItem.condition,
          notes: receiveItem.notes,
        });
      }

      if (receiptItems.length === 0) {
        throw new BadRequestException('At least one item quantity must be received or rejected');
      }

      await tx.goodsReceipt.create({
        data: {
          receiptNumber,
          purchaseOrderId: po.id,
          receivedById,
          notes: dto.notes,
          businessId,
          module,
          items: { create: receiptItems },
        },
      });

      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: po.id },
      });
      const isComplete = updatedItems.every(
        (item) => item.receivedQty + item.rejectedQty >= item.quantity,
      );

      const result = await tx.purchaseOrder.updateMany({
        where: { id, businessId, module },
        data: {
          status: isComplete ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
          receivedAt: isComplete ? new Date() : undefined,
          receivedById,
        },
      });
      if (result.count === 0) {
        throw new NotFoundException(`Purchase order #${id} not found`);
      }
      return tx.purchaseOrder.findFirstOrThrow({
        where: { id, businessId, module },
        include: this.poInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reject(
    id: string,
    reason: string,
    businessId: string,
    role: string,
    module: BusinessModule,
  ) {
    if (!['Admin', 'Manager'].includes(role)) {
      throw new ForbiddenException(
        'Only Admin or Manager can reject purchase orders',
      );
    }
    const po = await this.findOne(id, businessId, module);
    if (!['SUBMITTED', 'APPROVED'].includes(po.status)) {
      throw new BadRequestException(
        'Only SUBMITTED or APPROVED orders can be rejected',
      );
    }
    const result = await this.prisma.purchaseOrder.updateMany({
      where: {
        id,
        businessId,
        module,
        status: { in: ['SUBMITTED', 'APPROVED'] },
      },
      data: {
        status: 'REJECTED',
        rejectionReason: reason.trim(),
        rejectedAt: new Date(),
      },
    });
    if (result.count === 0) {
      await this.findOne(id, businessId, module);
      throw new BadRequestException(
        'Only SUBMITTED or APPROVED orders can be rejected',
      );
    }
    return this.findOne(id, businessId, module);
  }

  async findGoodsReceipts(
    businessId: string,
    module: BusinessModule,
    purchaseOrderId?: string,
    page = 1,
    limit = 50,
  ): Promise<PaginatedResult<any>> {
    const where: Prisma.GoodsReceiptWhereInput = {
      businessId,
      module,
      ...(purchaseOrderId ? { purchaseOrderId } : {}),
    };
    const include = {
      purchaseOrder: { include: { supplier: true } },
      receivedBy: { select: { id: true, name: true, email: true } },
      items: {
        include: {
          purchaseOrderItem: true,
          inventoryItem: true,
        },
      },
    };
    const [data, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        ...paginateQuery(page, limit),
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async cancel(
    id: string,
    businessId: string,
    module: BusinessModule,
  ) {
    const po = await this.findOne(id, businessId, module);
    if (po.status === 'RECEIVED') {
      throw new BadRequestException('RECEIVED orders cannot be cancelled');
    }
    const result = await this.prisma.purchaseOrder.updateMany({
      where: {
        id,
        businessId,
        module,
        status: { not: 'RECEIVED' },
      },
      data: { status: 'CANCELLED' },
    });
    if (result.count === 0) {
      await this.findOne(id, businessId, module);
      throw new BadRequestException('RECEIVED orders cannot be cancelled');
    }
    return this.findOne(id, businessId, module);
  }

  private readonly poInclude = {
    supplier: true,
    items: { include: { inventoryItem: true } },
    goodsReceipts: {
      include: {
        receivedBy: { select: { id: true, name: true, email: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' as const },
    },
    createdBy: { select: { id: true, name: true, email: true } },
    receivedBy: { select: { id: true, name: true, email: true } },
  };

  private async assertReferencesBelongToBusiness(
    dto: CreatePurchaseOrderDto,
    businessId: string,
    module: BusinessModule,
  ) {
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, businessId, module, isActive: true },
        select: { id: true },
      });
      if (!supplier) {
        throw new BadRequestException('Supplier is unavailable for this business');
      }
    }

    const itemIds = dto.items
      .map((item) => item.inventoryItemId)
      .filter((id): id is string => Boolean(id));
    if (itemIds.length === 0) return;

    const count = await this.prisma.inventoryItem.count({
      where: {
        id: { in: [...new Set(itemIds)] },
        businessId,
        itemType:
          module === BusinessModule.RESTAURANT
            ? { in: ['INGREDIENT', 'MENU_ITEM', 'SUPPLY'] }
            : { in: ['RETAIL_ITEM', 'BUNDLE'] },
      },
    });
    if (count !== new Set(itemIds).size) {
      throw new BadRequestException(
        'One or more inventory items are unavailable for this business',
      );
    }
  }
}
