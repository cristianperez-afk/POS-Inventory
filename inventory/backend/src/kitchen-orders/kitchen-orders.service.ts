import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessModule, KitchenOrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, paginateQuery, PaginatedResult } from '../common/dto/pagination.dto';
import { CreateKitchenOrderDto } from './dto/create-kitchen-order.dto';
import { VoidKitchenOrderDto } from './dto/void-kitchen-order.dto';

@Injectable()
export class KitchenOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async complete(
    createKitchenOrderDto: CreateKitchenOrderDto,
    businessId: string,
    completedById?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const initialStatus =
        createKitchenOrderDto.status ?? KitchenOrderStatus.COMPLETED;
      if (initialStatus === KitchenOrderStatus.VOIDED) {
        throw new BadRequestException('New kitchen orders cannot start as voided');
      }

      const locationId = await this.assertOrderContext(
        tx,
        createKitchenOrderDto.locationId,
        createKitchenOrderDto.tableId,
        businessId,
      );

      const recipe: any =
        initialStatus === KitchenOrderStatus.COMPLETED
          ? await this.loadRecipeForCompletion(
              tx,
              createKitchenOrderDto.recipeId,
              businessId,
            )
          : await tx.recipe.findFirst({
              where: {
                id: createKitchenOrderDto.recipeId,
                businessId,
                isActive: true,
              },
            });

      if (!recipe) {
        throw new NotFoundException(
          `Recipe #${createKitchenOrderDto.recipeId} not found`,
        );
      }

      let order;
      try {
        order = await tx.kitchenOrder.create({
          data: {
            receiptNo: createKitchenOrderDto.receiptNo,
            recipeId: recipe.id,
            quantity: createKitchenOrderDto.quantity,
            notes: createKitchenOrderDto.notes,
            status: initialStatus,
            locationId,
            tableId: createKitchenOrderDto.tableId,
            businessId,
            completedById:
              initialStatus === KitchenOrderStatus.COMPLETED
                ? completedById
                : undefined,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException(`Receipt number "${createKitchenOrderDto.receiptNo}" already exists`);
        }
        throw error;
      }

      if (initialStatus === KitchenOrderStatus.COMPLETED) {
        await this.deductRecipeInventory(
          tx,
          recipe,
          order,
          businessId,
          completedById,
          createKitchenOrderDto.excludedIngredientIds ?? [],
        );
      }

      return tx.kitchenOrder.findUnique({
        where: { id: order.id },
        include: this.kitchenOrderInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateStatus(
    id: string,
    status: KitchenOrderStatus,
    businessId: string,
    completedById?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "KitchenOrder"
        WHERE id = ${id}
        FOR UPDATE
      `;

      const order = await tx.kitchenOrder.findFirst({
        where: { id, businessId },
      });
      if (!order) throw new NotFoundException(`Kitchen order #${id} not found`);

      const allowedNextStatus: Partial<
        Record<KitchenOrderStatus, KitchenOrderStatus>
      > = {
        [KitchenOrderStatus.PENDING]: KitchenOrderStatus.PREPARING,
        [KitchenOrderStatus.PREPARING]: KitchenOrderStatus.READY,
        [KitchenOrderStatus.READY]: KitchenOrderStatus.COMPLETED,
      };

      if (allowedNextStatus[order.status] !== status) {
        throw new BadRequestException(
          `Kitchen order cannot move from ${order.status} to ${status}`,
        );
      }

      if (status === KitchenOrderStatus.COMPLETED) {
        const recipe = await this.loadRecipeForCompletion(
          tx,
          order.recipeId,
          businessId,
        );
        await this.deductRecipeInventory(
          tx,
          recipe,
          order,
          businessId,
          completedById,
        );
      }

      await tx.kitchenOrder.update({
        where: { id },
        data: {
          status,
          ...(status === KitchenOrderStatus.COMPLETED
            ? { completedById }
            : {}),
        },
      });

      return tx.kitchenOrder.findUnique({
        where: { id },
        include: this.kitchenOrderInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async findAll(
    businessId: string,
    status?: string,
    locationId?: string,
    page = 1,
    limit = 50,
  ): Promise<PaginatedResult<any>> {
    const validStatuses: string[] = Object.values(KitchenOrderStatus);
    const validStatus = status && validStatuses.includes(status)
      ? (status as KitchenOrderStatus)
      : undefined;
    const where = {
      businessId,
      ...(validStatus ? { status: validStatus } : {}),
      ...(locationId ? { locationId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.kitchenOrder.findMany({
        where,
        include: this.kitchenOrderInclude,
        orderBy: { createdAt: 'desc' },
        ...paginateQuery(page, limit),
      }),
      this.prisma.kitchenOrder.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async findOne(id: string, businessId: string) {
    const order = await this.prisma.kitchenOrder.findFirst({
      where: { id, businessId },
      include: this.kitchenOrderInclude,
    });

    if (!order) throw new NotFoundException(`Kitchen order #${id} not found`);
    return order;
  }

  async void(id: string, voidDto: VoidKitchenOrderDto, businessId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "KitchenOrder"
        WHERE id = ${id}
        FOR UPDATE
      `;

      const order = await tx.kitchenOrder.findFirst({
        where: { id, businessId },
      });

      if (!order) throw new NotFoundException(`Kitchen order #${id} not found`);
      if (order.status === 'VOIDED') {
        throw new BadRequestException('Kitchen order is already voided');
      }

      // Lock the affected inventory rows before restocking.
      await tx.$queryRaw`
        SELECT id FROM "InventoryItem"
        WHERE id IN (
          SELECT "itemId" FROM "StockMovement"
          WHERE "referenceType" = 'KITCHEN_ORDER'
            AND "referenceId" = ${order.id}
            AND "type" = 'RECIPE_CONSUMPTION'
        )
        FOR UPDATE
      `;

      const sourceMovements = await tx.stockMovement.findMany({
        where: {
          businessId,
          referenceType: 'KITCHEN_ORDER',
          referenceId: order.id,
          type: 'RECIPE_CONSUMPTION',
        },
        include: { item: true },
      });

      for (const movement of sourceMovements) {
        const previousQuantity = movement.item.quantity;
        const newQuantity = previousQuantity + movement.quantity;

        await tx.inventoryItem.update({
          where: { id: movement.itemId },
          data: { quantity: newQuantity },
        });

        await tx.stockMovement.create({
          data: {
            type: 'VOID_RESTOCK',
            quantity: movement.quantity,
            previousQuantity,
            newQuantity,
            unit: movement.unit,
            reason: voidDto.voidReason,
            referenceType: 'KITCHEN_ORDER',
            referenceId: order.id,
            notes: `Void restock for receipt ${order.receiptNo}`,
            itemId: movement.itemId,
            locationId: movement.locationId,
            businessId,
            module: BusinessModule.RESTAURANT,
            createdById: order.completedById,
          },
        });
      }

      await tx.kitchenOrder.update({
        where: { id: order.id },
        data: {
          status: 'VOIDED',
          voidReason: voidDto.voidReason,
          voidedAt: new Date(),
        },
      });

      return tx.kitchenOrder.findUnique({
        where: { id: order.id },
        include: this.kitchenOrderInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async assertOrderContext(
    tx: Prisma.TransactionClient,
    locationId: string | undefined,
    tableId: string | undefined,
    businessId: string,
  ) {
    const location = locationId
      ? await tx.location.findFirst({
          where: { id: locationId, businessId },
          select: { id: true },
        })
      : null;
    if (locationId && !location) {
      throw new NotFoundException(`Location #${locationId} not found`);
    }

    const table = tableId
      ? await tx.diningTable.findFirst({
          where: { id: tableId, businessId },
          select: { id: true, locationId: true },
        })
      : null;
    if (tableId && !table) {
      throw new NotFoundException(`Dining table #${tableId} not found`);
    }
    if (table && locationId && table.locationId !== locationId) {
      throw new BadRequestException(
        'Dining table does not belong to the selected location',
      );
    }

    return locationId ?? table?.locationId;
  }

  private async loadRecipeForCompletion(
    tx: Prisma.TransactionClient,
    recipeId: string,
    businessId: string,
  ) {
    await tx.$queryRaw`
      SELECT id FROM "InventoryItem"
      WHERE id IN (
        SELECT "itemId" FROM "RecipeIngredient" WHERE "recipeId" = ${recipeId}
      )
      FOR UPDATE
    `;

    const recipe = await tx.recipe.findFirst({
      where: { id: recipeId, businessId, isActive: true },
      include: {
        ingredients: {
          include: { item: true },
        },
      },
    });
    if (!recipe) throw new NotFoundException(`Recipe #${recipeId} not found`);
    if (recipe.ingredients.length === 0) {
      throw new BadRequestException('Recipe has no ingredients to deduct');
    }
    return recipe;
  }

  private async deductRecipeInventory(
    tx: Prisma.TransactionClient,
    recipe: Awaited<ReturnType<KitchenOrdersService['loadRecipeForCompletion']>>,
    order: { id: string; receiptNo: string; quantity: number },
    businessId: string,
    completedById?: string,
    excludedIngredientIds: string[] = [],
  ) {
    const servingFactor = order.quantity / Math.max(recipe.servings, 1);
    const excludedIds = new Set(excludedIngredientIds);
    const deductions = recipe.ingredients
      .filter((ingredient) => !excludedIds.has(ingredient.id))
      .map((ingredient) => ({
      ingredient,
      requiredQuantity: ingredient.quantity * servingFactor,
    }));
    if (deductions.length === 0) {
      throw new BadRequestException('At least one recipe ingredient must be deducted');
    }
    const insufficientIngredient = deductions.find(
      ({ ingredient, requiredQuantity }) =>
        ingredient.item.quantity < requiredQuantity,
    );
    if (insufficientIngredient) {
      throw new BadRequestException(
        `${insufficientIngredient.ingredient.item.name} does not have enough stock`,
      );
    }

    for (const { ingredient, requiredQuantity } of deductions) {
      const previousQuantity = ingredient.item.quantity;
      const newQuantity = previousQuantity - requiredQuantity;

      await tx.inventoryItem.update({
        where: { id: ingredient.itemId },
        data: { quantity: newQuantity },
      });
      await tx.stockMovement.create({
        data: {
          type: 'RECIPE_CONSUMPTION',
          quantity: requiredQuantity,
          previousQuantity,
          newQuantity,
          unit: ingredient.item.unit ?? ingredient.unit,
          reason: 'Kitchen order recipe consumption',
          referenceType: 'KITCHEN_ORDER',
          referenceId: order.id,
          notes: excludedIds.size > 0
            ? `Receipt ${order.receiptNo} consumed ${recipe.name} with modifiers`
            : `Receipt ${order.receiptNo} consumed ${recipe.name}`,
          itemId: ingredient.itemId,
          locationId: ingredient.item.locationId,
          businessId,
          module: BusinessModule.RESTAURANT,
          createdById: completedById,
        },
      });
    }
  }

  private readonly kitchenOrderInclude = {
    recipe: {
      include: {
        ingredients: {
          include: { item: true },
        },
      },
    },
    completedBy: true,
    location: { select: { id: true, name: true } },
    table: { select: { id: true, tableNumber: true } },
    sale: { select: { id: true, transactionNumber: true } },
  };
}
