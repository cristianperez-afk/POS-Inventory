import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../shared/database/database.service';
import { PosOrderRepository } from './pos-order.repository';

@Injectable()
export class PosService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly posOrderRepository: PosOrderRepository,
  ) {}

  getMenu(userId: number) {
    return this.databaseService.listPosProducts(userId);
  }

  getIngredients(userId: number) {
    return this.databaseService.listPosIngredients(userId);
  }

  getProductRecipe(input: { userId: number; productId: number }) {
    return this.databaseService.getPosProductRecipe(input);
  }

  createOrder(input: any) {
    return this.posOrderRepository.createPaidOrder(input);
  }
}
