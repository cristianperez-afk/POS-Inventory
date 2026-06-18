import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessModule } from '@prisma/client';
import { paginate, paginateQuery, PaginatedResult } from '../common/dto/pagination.dto';
import {
  CreateStockMovementDto,
  StockMovementType,
} from './dto/create-stock-movement.dto';

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createStockMovementDto: CreateStockMovementDto,
    businessId: string,
    module: BusinessModule,
    createdById?: string,
    modules: string[] = [],
  ) {
    if (createStockMovementDto.quantity < 0) {
      throw new BadRequestException('Movement quantity cannot be negative');
    }
    if (
      createStockMovementDto.type !== StockMovementType.Adjustment &&
      createStockMovementDto.quantity === 0
    ) {
      throw new BadRequestException('Movement quantity must be greater than zero');
    }
    this.assertCanUseMovementType(createStockMovementDto.type, modules);

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: { id: createStockMovementDto.itemId, businessId },
        select: {
          id: true,
          itemType: true,
          quantity: true,
          unit: true,
          locationId: true,
        },
      });

      if (!item) {
        throw new NotFoundException(
          `Inventory item #${createStockMovementDto.itemId} not found`,
        );
      }
      const isRestaurantItem = ['INGREDIENT', 'MENU_ITEM', 'SUPPLY'].includes(
        item.itemType,
      );
      if (
        (module === BusinessModule.RESTAURANT && !isRestaurantItem) ||
        (module === BusinessModule.RETAIL && isRestaurantItem)
      ) {
        throw new BadRequestException(
          `Inventory item is not owned by the ${module.toLowerCase()} module`,
        );
      }

      const locationId = createStockMovementDto.locationId ?? item.locationId;
      const location = await tx.location.findFirst({
        where: { id: locationId, businessId },
        select: { id: true },
      });

      if (!location) {
        throw new NotFoundException(`Location #${locationId} not found`);
      }

      const previousQuantity = item.quantity;
      const newQuantity = this.calculateNewQuantity(
        previousQuantity,
        createStockMovementDto.quantity,
        createStockMovementDto.type,
      );

      if (newQuantity < 0) {
        throw new BadRequestException('Stock movement would make quantity negative');
      }

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          quantity: newQuantity,
          ...(locationId !== item.locationId ? { locationId } : {}),
        },
      });

      return tx.stockMovement.create({
        data: {
          type: createStockMovementDto.type,
          quantity: createStockMovementDto.quantity,
          previousQuantity,
          newQuantity,
          unit: item.unit,
          reason: createStockMovementDto.reason,
          referenceType: createStockMovementDto.referenceType,
          referenceId: createStockMovementDto.referenceId,
          notes: createStockMovementDto.notes,
          itemId: item.id,
          locationId,
          businessId,
          module,
          createdById,
        },
        include: {
          item: true,
          location: true,
          createdBy: true,
        },
      });
    });
  }

  async findAll(
    businessId: string,
    filters: {
      module: BusinessModule;
      itemId?: string;
      locationId?: string;
      type?: string;
      referenceType?: string;
      referenceId?: string;
    },
    modules: string[] = [],
    page = 1,
    limit = 50,
  ): Promise<PaginatedResult<any>> {
    this.assertCanUseMovementType(filters.type, modules);
    const module = filters.module;
    const where = {
      businessId,
      module,
      ...(filters.itemId ? { itemId: filters.itemId } : {}),
      ...(filters.locationId ? { locationId: filters.locationId } : {}),
      ...(this.isStockMovementType(filters.type) ? { type: filters.type } : {}),
      ...(filters.referenceType ? { referenceType: filters.referenceType } : {}),
      ...(filters.referenceId ? { referenceId: filters.referenceId } : {}),
    };
    const include = { item: true, location: true, createdBy: true };
    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        ...paginateQuery(page, limit),
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async findOne(
    id: string,
    businessId: string,
    module: BusinessModule,
  ) {
    const movement = await this.prisma.stockMovement.findFirst({
      where: { id, businessId, module },
      include: {
        item: true,
        location: true,
        createdBy: true,
      },
    });

    if (!movement) {
      throw new NotFoundException(`Stock movement #${id} not found`);
    }

    return movement;
  }

  private calculateNewQuantity(
    previousQuantity: number,
    movementQuantity: number,
    type: StockMovementType,
  ) {
    if (
      [
        StockMovementType.StockIn,
        StockMovementType.TransferIn,
        StockMovementType.VoidRestock,
      ].includes(type)
    ) {
      return previousQuantity + movementQuantity;
    }

    if (type === StockMovementType.Adjustment) {
      return movementQuantity;
    }

    return previousQuantity - movementQuantity;
  }

  private isStockMovementType(value?: string): value is StockMovementType {
    return Boolean(
      value &&
        Object.values(StockMovementType).includes(value as StockMovementType),
    );
  }

  private assertCanUseMovementType(type?: string, modules: string[] = []) {
    if (
      type &&
      [
        StockMovementType.RecipeConsumption,
        StockMovementType.Spoilage,
        StockMovementType.Expiry,
      ].includes(type as StockMovementType) &&
      !modules.includes('RESTAURANT')
    ) {
      throw new ForbiddenException('Restaurant module access is required');
    }
  }
}
