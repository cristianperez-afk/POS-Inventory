import { BadRequestException, NotFoundException } from '@nestjs/common';
import { KitchenOrderStatus } from '@prisma/client';
import { KitchenOrdersService } from './kitchen-orders.service';

describe('KitchenOrdersService', () => {
  it('moves a pending order to preparing without deducting inventory', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      kitchenOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: KitchenOrderStatus.PENDING,
          recipeId: 'recipe-1',
        }),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: KitchenOrderStatus.PREPARING,
        }),
      },
      inventoryItem: { update: jest.fn() },
      stockMovement: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => unknown) => callback(tx),
      ),
    };
    const service = new KitchenOrdersService(prisma as any);

    await service.updateStatus(
      'order-1',
      KitchenOrderStatus.PREPARING,
      'business-1',
      'user-1',
    );

    expect(tx.kitchenOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: KitchenOrderStatus.PREPARING },
    });
    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('rejects skipped kitchen-order status transitions', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      kitchenOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: KitchenOrderStatus.PENDING,
          recipeId: 'recipe-1',
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => unknown) => callback(tx),
      ),
    };
    const service = new KitchenOrdersService(prisma as any);

    await expect(
      service.updateStatus(
        'order-1',
        KitchenOrderStatus.READY,
        'business-1',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a dining table outside the current business', async () => {
    const tx = {
      location: { findFirst: jest.fn() },
      diningTable: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => unknown) => callback(tx),
      ),
    };
    const service = new KitchenOrdersService(prisma as any);

    await expect(
      service.complete(
        {
          receiptNo: 'R-1',
          recipeId: 'recipe-1',
          quantity: 1,
          tableId: 'other-business-table',
          status: KitchenOrderStatus.PENDING,
        },
        'business-1',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deducts only non-excluded recipe ingredients for a modified menu order', async () => {
    const tx = {
      inventoryItem: { update: jest.fn() },
      stockMovement: { create: jest.fn() },
    };
    const service = new KitchenOrdersService({} as any);
    const recipe = {
      id: 'recipe-1',
      name: 'Burger',
      servings: 1,
      ingredients: [
        {
          id: 'ingredient-patty',
          itemId: 'item-patty',
          quantity: 1,
          unit: 'pcs',
          item: {
            name: 'Patty',
            quantity: 10,
            unit: 'pcs',
            locationId: 'loc-1',
          },
        },
        {
          id: 'ingredient-cheese',
          itemId: 'item-cheese',
          quantity: 1,
          unit: 'slice',
          item: {
            name: 'Cheese',
            quantity: 10,
            unit: 'slice',
            locationId: 'loc-1',
          },
        },
      ],
    };

    await (service as any).deductRecipeInventory(
      tx,
      recipe,
      { id: 'order-1', receiptNo: 'R-1', quantity: 1 },
      'business-1',
      'user-1',
      ['ingredient-cheese'],
    );

    expect(tx.inventoryItem.update).toHaveBeenCalledTimes(1);
    expect(tx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'item-patty' },
      data: { quantity: 9 },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itemId: 'item-patty',
        quantity: 1,
        notes: 'Receipt R-1 consumed Burger with modifiers',
      }),
    });
  });
});
