import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, paginateQuery, PaginatedResult } from '../common/dto/pagination.dto';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { InventoryItemType } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createInventoryDto: CreateInventoryDto,
    businessId: string,
    modules: string[] = [],
  ) {
    const itemType = this.resolveCreateItemType(
      createInventoryDto.itemType,
      modules,
    );
    await this.assertLocationInBusiness(
      createInventoryDto.locationId,
      businessId,
    );
    if (createInventoryDto.categoryId) {
      await this.assertCategoryInBusiness(
        createInventoryDto.categoryId,
        businessId,
      );
    }

    try {
      return await this.prisma.inventoryItem.create({
        data: { ...createInventoryDto, itemType, businessId },
        include: { location: true, categoryRef: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An item with this SKU already exists in your business');
      }
      throw error;
    }
  }

  async findAll(
    businessId: string,
    search?: string,
    itemType?: string,
    modules: string[] = [],
    page = 1,
    limit = 50,
  ): Promise<PaginatedResult<any>> {
    const allowedItemTypes = this.getAllowedItemTypes(modules);
    if (itemType) {
      this.assertCanUseItemType(itemType, modules);
    }
    const where = {
      businessId,
      itemType: this.isInventoryItemType(itemType)
        ? itemType
        : { in: allowedItemTypes },
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { category: { contains: search, mode: 'insensitive' as const } },
              { subcategory: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        include: { location: true, categoryRef: true },
        orderBy: { dateAdded: 'desc' },
        ...paginateQuery(page, limit),
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async findOne(id: string, businessId: string, modules: string[] = []) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: {
        id,
        businessId,
        itemType: { in: this.getAllowedItemTypes(modules) },
      },
      include: { location: true, categoryRef: true },
    });
    if (!item) throw new NotFoundException(`Inventory item #${id} not found`);
    return item;
  }

  async update(
    id: string,
    updateInventoryDto: UpdateInventoryDto,
    businessId: string,
    modules: string[] = [],
  ) {
    const currentItem = await this.findOne(id, businessId, modules);
    this.assertCanUseItemType(
      updateInventoryDto.itemType ?? currentItem.itemType,
      modules,
    );
    if (updateInventoryDto.locationId) {
      await this.assertLocationInBusiness(
        updateInventoryDto.locationId,
        businessId,
      );
    }
    if (updateInventoryDto.categoryId) {
      await this.assertCategoryInBusiness(
        updateInventoryDto.categoryId,
        businessId,
      );
    }

    return this.prisma.inventoryItem.update({
      where: { id },
      data: updateInventoryDto,
      include: { location: true, categoryRef: true },
    });
  }

  async remove(id: string, businessId: string, modules: string[] = []) {
    const item = await this.findOne(id, businessId, modules);
    await this.prisma.inventoryItem.deleteMany({
      where: {
        id,
        businessId,
        itemType: item.itemType,
      },
    });
    return item;
  }

  async getStats(businessId: string, modules: string[] = []) {
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        businessId,
        itemType: { in: this.getAllowedItemTypes(modules) },
      },
    });
    const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
    const availableStock = items
      .filter((i) => i.condition !== 'Damaged')
      .reduce((sum, i) => sum + i.quantity, 0);
    const damagedItems = items
      .filter((i) => i.condition === 'Damaged')
      .reduce((sum, i) => sum + i.quantity, 0);
    const totalValue = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const totalCostValue = items.reduce(
      (sum, i) => sum + (i.costPrice ?? i.price) * i.quantity,
      0,
    );
    const lowStockItems = items.filter(
      (i) => i.quantity <= (i.reorderPoint ?? 3) && i.condition !== 'Damaged',
    );
    return {
      totalItems,
      availableStock,
      damagedItems,
      totalValue,
      totalCostValue,
      stockAlerts: lowStockItems.map((i) => ({
        id: i.id,
        itemName: i.name,
        currentStock: i.quantity,
        threshold: i.reorderPoint ?? 5,
        severity: i.quantity <= (i.minStock ?? 1) ? 'critical' : 'low',
      })),
    };
  }

  private async assertLocationInBusiness(locationId: string, businessId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, businessId },
      select: { id: true },
    });
    if (!location) throw new NotFoundException(`Location #${locationId} not found`);
  }

  private async assertCategoryInBusiness(categoryId: string, businessId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, businessId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException(`Category #${categoryId} not found`);
  }

  private isInventoryItemType(value?: string): value is InventoryItemType {
    return Boolean(
      value &&
        Object.values(InventoryItemType).includes(value as InventoryItemType),
    );
  }

  private assertCanUseItemType(itemType?: string, modules: string[] = []) {
    if (!itemType || !this.isInventoryItemType(itemType)) {
      throw new BadRequestException('A valid inventory itemType is required');
    }
    if (!this.getAllowedItemTypes(modules).includes(itemType)) {
      throw new ForbiddenException(
        `The ${itemType} inventory type is not enabled for this business`,
      );
    }
  }

  private resolveCreateItemType(
    itemType: InventoryItemType | undefined,
    modules: string[],
  ): InventoryItemType {
    if (itemType) {
      this.assertCanUseItemType(itemType, modules);
      return itemType;
    }
    if (modules.length === 1 && modules[0] === 'RETAIL') {
      return InventoryItemType.RetailItem;
    }
    throw new BadRequestException(
      'itemType is required when creating inventory for this business',
    );
  }

  private getAllowedItemTypes(modules: string[]): InventoryItemType[] {
    const allowed = new Set<InventoryItemType>();
    if (modules.includes('RETAIL')) {
      allowed.add(InventoryItemType.RetailItem);
      allowed.add(InventoryItemType.Bundle);
    }
    if (modules.includes('RESTAURANT')) {
      allowed.add(InventoryItemType.Ingredient);
      allowed.add(InventoryItemType.MenuItem);
      allowed.add(InventoryItemType.Supply);
    }
    if (allowed.size === 0) {
      throw new ForbiddenException('No inventory module is enabled');
    }
    return Array.from(allowed);
  }
}
