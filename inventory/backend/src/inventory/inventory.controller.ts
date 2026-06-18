import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/current-user.decorator';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin', 'Manager', 'Staff')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  create(
    @Body() createInventoryDto: CreateInventoryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inventoryService.create(
      createInventoryDto,
      currentUser.businessId,
      currentUser.modules,
    );
  }

  @Get()
  findAll(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('itemType') itemType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.findAll(
      currentUser.businessId,
      search,
      itemType,
      currentUser.modules,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('stats')
  getStats(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.inventoryService.getStats(
      currentUser.businessId,
      currentUser.modules,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    return this.inventoryService.findOne(
      id,
      currentUser.businessId,
      currentUser.modules,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateInventoryDto: UpdateInventoryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.inventoryService.update(
      id,
      updateInventoryDto,
      currentUser.businessId,
      currentUser.modules,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    return this.inventoryService.remove(
      id,
      currentUser.businessId,
      currentUser.modules,
    );
  }
}
