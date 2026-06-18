import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, paginateQuery, PaginatedResult } from '../common/dto/pagination.dto';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { UpdateBundleDto } from './dto/update-bundle.dto';

@Injectable()
export class BundlesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly bundleInclude = {
    items: { include: { inventoryItem: { select: { id: true, name: true, price: true, quantity: true, category: true } } } },
    createdBy: { select: { id: true, name: true } },
    approvedBy: { select: { id: true, name: true } },
    location: { select: { id: true, name: true } },
  };

  async create(dto: CreateBundleDto, businessId: string, createdById: string, role: string) {
    if (dto.locationId) {
      await this.assertLocationInBusiness(dto.locationId, businessId);
    }
    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: { id: { in: dto.items.map((i) => i.inventoryItemId) }, businessId },
      select: { id: true, price: true },
    });
    const requestedItemIds = new Set(dto.items.map((item) => item.inventoryItemId));
    if (inventoryItems.length !== requestedItemIds.size) {
      throw new NotFoundException('One or more bundle items were not found');
    }

    const itemPriceMap = new Map(inventoryItems.map((i) => [i.id, i.price]));
    const originalTotal = dto.items.reduce(
      (sum, i) => sum + (itemPriceMap.get(i.inventoryItemId) ?? 0) * i.quantity,
      0,
    );
    const price = originalTotal * (1 - dto.discount / 100);

    const isAdmin = role === 'Admin' || role === 'Manager';
    const status = isAdmin ? 'APPROVED' : 'PENDING';

    return this.prisma.bundlePackage.create({
      data: {
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        discount: dto.discount,
        price,
        status: status as any,
        locationId: dto.locationId,
        businessId,
        createdById,
        ...(isAdmin && { approvedById: createdById, approvedAt: new Date() }),
        items: {
          create: dto.items.map((i) => ({
            inventoryItemId: i.inventoryItemId,
            quantity: i.quantity,
          })),
        },
      },
      include: this.bundleInclude,
    });
  }

  async findAll(
    businessId: string,
    status?: string,
    locationId?: string,
    page = 1,
    limit = 50,
  ): Promise<PaginatedResult<any>> {
    const where = {
      businessId,
      ...(status ? { status: status as any } : {}),
      ...(locationId ? { locationId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.bundlePackage.findMany({
        where,
        include: this.bundleInclude,
        orderBy: { createdAt: 'desc' },
        ...paginateQuery(page, limit),
      }),
      this.prisma.bundlePackage.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async findOne(id: string, businessId: string) {
    const bundle = await this.prisma.bundlePackage.findFirst({
      where: { id, businessId },
      include: this.bundleInclude,
    });
    if (!bundle) throw new NotFoundException(`Bundle #${id} not found`);
    return bundle;
  }

  async update(id: string, dto: UpdateBundleDto, businessId: string) {
    const bundle = await this.findOne(id, businessId);
    if (!['PENDING', 'REJECTED'].includes(bundle.status)) {
      throw new BadRequestException('Only PENDING or REJECTED bundles can be edited');
    }
    return this.prisma.bundlePackage.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.discount !== undefined ? { discount: dto.discount } : {}),
        status: 'PENDING' as any,
      },
      include: this.bundleInclude,
    });
  }

  async approve(id: string, businessId: string, approvedById: string, role: string) {
    if (role !== 'Admin' && role !== 'Manager') {
      throw new ForbiddenException('Only Admin or Manager can approve bundles');
    }
    const bundle = await this.findOne(id, businessId);
    if (bundle.status !== 'PENDING') {
      throw new BadRequestException('Only PENDING bundles can be approved');
    }
    return this.prisma.bundlePackage.update({
      where: { id },
      data: { status: 'APPROVED' as any, approvedById, approvedAt: new Date(), rejectionReason: null },
      include: this.bundleInclude,
    });
  }

  async reject(id: string, rejectionReason: string, businessId: string, role: string) {
    if (role !== 'Admin' && role !== 'Manager') {
      throw new ForbiddenException('Only Admin or Manager can reject bundles');
    }
    const bundle = await this.findOne(id, businessId);
    if (bundle.status !== 'PENDING') {
      throw new BadRequestException('Only PENDING bundles can be rejected');
    }
    return this.prisma.bundlePackage.update({
      where: { id },
      data: { status: 'REJECTED' as any, rejectionReason },
      include: this.bundleInclude,
    });
  }

  async activate(id: string, businessId: string, role: string) {
    if (role !== 'Admin' && role !== 'Manager') {
      throw new ForbiddenException('Only Admin or Manager can activate bundles');
    }
    const bundle = await this.findOne(id, businessId);
    if (!['APPROVED', 'INACTIVE'].includes(bundle.status)) {
      throw new BadRequestException('Only APPROVED or INACTIVE bundles can be activated');
    }
    return this.prisma.bundlePackage.update({
      where: { id },
      data: { status: 'ACTIVE' as any },
      include: this.bundleInclude,
    });
  }

  async deactivate(id: string, businessId: string, role: string) {
    if (role !== 'Admin' && role !== 'Manager') {
      throw new ForbiddenException('Only Admin or Manager can deactivate bundles');
    }
    const bundle = await this.findOne(id, businessId);
    if (bundle.status !== 'ACTIVE') {
      throw new BadRequestException('Only ACTIVE bundles can be deactivated');
    }
    return this.prisma.bundlePackage.update({
      where: { id },
      data: { status: 'INACTIVE' as any },
      include: this.bundleInclude,
    });
  }

  async remove(id: string, businessId: string, role: string) {
    if (role !== 'Admin' && role !== 'Manager') {
      throw new ForbiddenException('Only Admin or Manager can delete bundles');
    }
    const bundle = await this.findOne(id, businessId);
    if (!['PENDING', 'REJECTED'].includes(bundle.status)) {
      throw new BadRequestException('Only PENDING or REJECTED bundles can be deleted');
    }
    await this.prisma.bundlePackage.delete({ where: { id } });
  }

  private async assertLocationInBusiness(locationId: string, businessId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, businessId },
      select: { id: true },
    });
    if (!location) throw new NotFoundException(`Location #${locationId} not found`);
  }
}
