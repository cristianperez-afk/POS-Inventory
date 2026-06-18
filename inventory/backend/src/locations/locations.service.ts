import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, paginateQuery, PaginatedResult } from '../common/dto/pagination.dto';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createLocationDto: CreateLocationDto, businessId: string) {
    try {
      const location = await this.prisma.location.create({
        data: { ...createLocationDto, businessId },
      });
      return this.withItemCount(location, 0);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A location named "${createLocationDto.name}" already exists`);
      }
      throw error;
    }
  }

  async findAll(businessId: string, page = 1, limit = 50): Promise<PaginatedResult<any>> {
    const where = { businessId };
    const [locations, total] = await Promise.all([
      this.prisma.location.findMany({
        where,
        include: { _count: { select: { items: true } } },
        orderBy: { name: 'asc' },
        ...paginateQuery(page, limit),
      }),
      this.prisma.location.count({ where }),
    ]);
    return paginate(
      locations.map((loc) => this.withItemCount(loc, loc._count.items)),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string, businessId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id, businessId },
      include: { _count: { select: { items: true } } },
    });
    if (!location) throw new NotFoundException(`Location #${id} not found`);
    return this.withItemCount(location, location._count.items);
  }

  async update(
    id: string,
    updateLocationDto: UpdateLocationDto,
    businessId: string,
  ) {
    await this.findOne(id, businessId);
    const location = await this.prisma.location.update({
      where: { id },
      data: updateLocationDto,
    });
    const itemCount = await this.prisma.inventoryItem.count({
      where: { locationId: id, businessId },
    });
    return this.withItemCount(location, itemCount);
  }

  async remove(id: string, businessId: string) {
    const location = await this.findOne(id, businessId);
    if (location.itemCount > 0) {
      throw new BadRequestException(
        'Cannot delete a location that still has inventory items',
      );
    }
    return this.prisma.location.delete({ where: { id } });
  }

  private withItemCount<T extends { _count?: unknown; itemCount?: number }>(
    location: T,
    itemCount: number,
  ) {
    const { _count: _count, ...locationData } = location;
    return { ...locationData, itemCount };
  }
}
