import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../../shared/common/types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PosService } from './pos.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Get('pos/menu')
  getMenu(@CurrentUser() user: AuthenticatedUser) {
    return this.posService.getMenu(user.id);
  }

  @Get('pos/ingredients')
  getIngredients(@Query('user_id') userId: string) {
    return this.posService.getIngredients(Number(userId));
  }

  @Get('products/:id/recipe')
  getProductRecipe(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.posService.getProductRecipe({
      userId: user.id,
      productId: Number(id),
    });
  }

  @Post('pos/orders')
  createOrder(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.posService.createOrder({
      ...body,
      userId: user.id,
    });
  }
}
