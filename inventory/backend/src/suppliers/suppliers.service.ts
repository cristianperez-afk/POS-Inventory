import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessModule, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, paginateQuery, PaginatedResult } from '../common/dto/pagination.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateSupplierDto,
    businessId: string,
    module: BusinessModule,
  ) {
    if (dto.categoryId) {
      await this.assertCategoryInBusiness(dto.categoryId, businessId);
    }
    try {
      return await this.prisma.supplier.create({
        data: { ...dto, module, businessId },
        include: { categoryRef: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Supplier "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async findAll(
    businessId: string,
    module: BusinessModule,
    isActive?: boolean,
    page = 1,
    limit = 50,
  ): Promise<PaginatedResult<any>> {
    const where: Prisma.SupplierWhereInput = {
      businessId,
      module,
      ...(isActive !== undefined ? { isActive } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        include: { categoryRef: true },
        orderBy: { name: 'asc' },
        ...paginateQuery(page, limit),
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async findOne(
    id: string,
    businessId: string,
    module: BusinessModule,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, businessId, module },
      include: { categoryRef: true },
    });
    if (!supplier) throw new NotFoundException(`Supplier #${id} not found`);
    return supplier;
  }

  async update(
    id: string,
    dto: UpdateSupplierDto,
    businessId: string,
    module: BusinessModule,
  ) {
    if (dto.categoryId) {
      await this.assertCategoryInBusiness(dto.categoryId, businessId);
    }
    try {
      const { module: _ignoredModule, ...data } = dto;
      const result = await this.prisma.supplier.updateMany({
        where: { id, businessId, module },
        data,
      });
      if (result.count === 0) {
        throw new NotFoundException(`Supplier #${id} not found`);
      }
      return await this.findOne(id, businessId, module);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Supplier name "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async remove(
    id: string,
    businessId: string,
    module: BusinessModule,
  ) {
    await this.findOne(id, businessId, module);
    const poCount = await this.prisma.purchaseOrder.count({ where: { supplierId: id } });
    if (poCount > 0) {
      throw new BadRequestException('Cannot delete supplier with existing purchase orders');
    }
    const result = await this.prisma.supplier.deleteMany({
      where: { id, businessId, module },
    });
    if (result.count === 0) {
      throw new NotFoundException(`Supplier #${id} not found`);
    }
    return { id };
  }

  private async assertCategoryInBusiness(categoryId: string, businessId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, businessId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException(`Category #${categoryId} not found`);
  }
}
