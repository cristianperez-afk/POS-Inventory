import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthenticatedUser } from '../../shared/common/types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PosService } from './pos.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Get('pos/menu')
  @Permissions('pos:read')
  getMenu(@CurrentUser() user: AuthenticatedUser) {
    return this.posService.getMenu(user.id);
  }

  @Get('pos/ingredients')
  @Permissions('pos:read')
  getIngredients(@CurrentUser() user: AuthenticatedUser) {
    return this.posService.getIngredients(user.id);
  }

  @Get('products/:id/recipe')
  @Permissions('pos:read')
  getProductRecipe(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.posService.getProductRecipe({
      userId: user.id,
      productId: Number(id),
    });
  }

  @Post('pos/orders')
  @Permissions('pos:create_order')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  createOrder(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.posService.createOrder({
      ...body,
      userId: user.id,
    });
  }
}
