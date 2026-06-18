import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DiningTableStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, paginateQuery, PaginatedResult } from '../common/dto/pagination.dto';
import { CreateDiningTableDto } from './dto/create-dining-table.dto';

@Injectable()
export class DiningTablesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDiningTableDto, businessId: string, role: string) {
    if (role !== 'Admin' && role !== 'Manager') {
      throw new ForbiddenException('Only Admin or Manager can create dining tables');
    }
    await this.assertLocationInBusiness(dto.locationId, businessId);

    try {
      return await this.prisma.diningTable.create({
        data: { ...dto, businessId },
        include: this.tableInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Table "${dto.tableNumber}" already exists at this location`);
      }
      throw error;
    }
  }

  async findAll(
    businessId: string,
    locationId?: string,
    status?: DiningTableStatus,
    page = 1,
    limit = 50,
  ): Promise<PaginatedResult<any>> {
    const where = {
      businessId,
      ...(locationId ? { locationId } : {}),
      ...(status ? { status } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.diningTable.findMany({
        where,
        include: this.tableInclude,
        orderBy: [{ locationId: 'asc' }, { tableNumber: 'asc' }],
        ...paginateQuery(page, limit),
      }),
      this.prisma.diningTable.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async findOne(id: string, businessId: string) {
    const table = await this.prisma.diningTable.findFirst({
      where: { id, businessId },
      include: this.tableInclude,
    });
    if (!table) throw new NotFoundException(`Dining table #${id} not found`);
    return table;
  }

  async updateStatus(id: string, status: DiningTableStatus, businessId: string) {
    await this.findOne(id, businessId);
    return this.prisma.diningTable.update({
      where: { id },
      data: { status },
      include: this.tableInclude,
    });
  }

  async remove(id: string, businessId: string, role: string) {
    if (role !== 'Admin' && role !== 'Manager') {
      throw new ForbiddenException('Only Admin or Manager can delete dining tables');
    }
    await this.findOne(id, businessId);
    const linkedOrders = await this.prisma.kitchenOrder.count({ where: { tableId: id } });
    if (linkedOrders > 0) {
      throw new BadRequestException('Cannot delete a table that has kitchen orders linked to it');
    }
    return this.prisma.diningTable.delete({ where: { id } });
  }

  private async assertLocationInBusiness(locationId: string, businessId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, businessId },
      select: { id: true },
    });
    if (!location) throw new NotFoundException(`Location #${locationId} not found`);
  }

  private readonly tableInclude = {
    location: { select: { id: true, name: true } },
  };
}
