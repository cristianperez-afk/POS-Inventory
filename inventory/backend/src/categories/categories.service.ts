import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessModule, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto, businessId: string) {
    try {
      return await this.prisma.category.create({
        data: { ...dto, businessId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          `Category "${dto.name}" already exists for module ${dto.module}`,
        );
      }
      throw error;
    }
  }

  async findAll(businessId: string, module?: BusinessModule) {
    return this.prisma.category.findMany({
      where: {
        businessId,
        ...(module ? { module } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, businessId: string) {
    const category = await this.prisma.category.findFirst({ where: { id, businessId } });
    if (!category) throw new NotFoundException(`Category #${id} not found`);
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, businessId: string) {
    await this.findOne(id, businessId);
    try {
      return await this.prisma.category.update({ where: { id }, data: dto });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Category name already exists for this module`);
      }
      throw error;
    }
  }

  async remove(id: string, businessId: string) {
    await this.findOne(id, businessId);
    const [itemCount, supplierCount] = await Promise.all([
      this.prisma.inventoryItem.count({ where: { categoryId: id } }),
      this.prisma.supplier.count({ where: { categoryId: id } }),
    ]);
    if (itemCount > 0 || supplierCount > 0) {
      throw new BadRequestException(
        `Cannot delete: ${itemCount} item(s) and ${supplierCount} supplier(s) still use this category`,
      );
    }
    return this.prisma.category.delete({ where: { id } });
  }
}
