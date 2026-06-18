import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate, paginateQuery, PaginatedResult } from '../common/dto/pagination.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto, businessId: string) {
    const { password, ...userData } = createUserDto;
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await this.prisma.user.create({
        data: { ...userData, passwordHash, businessId },
      });
      return this.sanitizeUser(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }

  async findAll(businessId: string, page = 1, limit = 50): Promise<PaginatedResult<any>> {
    const where = { businessId };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginateQuery(page, limit),
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(users.map((u) => this.sanitizeUser(u)), total, page, limit);
  }

  async findOne(id: string, businessId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, businessId },
    });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return this.sanitizeUser(user);
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { business: true },
    });
  }

  async findAuthUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { business: true },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto, businessId: string) {
    await this.findOne(id, businessId);
    const { password, ...userData } = updateUserDto;
    const data =
      password !== undefined
        ? { ...userData, passwordHash: await bcrypt.hash(password, 12) }
        : userData;
    const user = await this.prisma.user.update({
      where: { id },
      data,
    });
    return this.sanitizeUser(user);
  }

  async remove(id: string, businessId: string) {
    await this.findOne(id, businessId);
    const user = await this.prisma.user.delete({ where: { id } });
    return this.sanitizeUser(user);
  }

  async touchLastLogin(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastLogin: new Date() },
    });
  }

  sanitizeUser<T extends { passwordHash?: string }>(user: T) {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
