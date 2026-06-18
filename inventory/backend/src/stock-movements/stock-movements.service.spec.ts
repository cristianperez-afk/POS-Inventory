import { BadRequestException } from '@nestjs/common';
import { BusinessModule } from '@prisma/client';
import { StockMovementType } from './dto/create-stock-movement.dto';
import { StockMovementsService } from './stock-movements.service';

describe('StockMovementsService', () => {
  const itemId = '11111111-1111-4111-8111-111111111111';
  const locationId = '22222222-2222-4222-8222-222222222222';
  const businessId = '33333333-3333-4333-8333-333333333333';

  function createService() {
    const tx = {
      inventoryItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: itemId,
          quantity: 5,
          unit: 'pcs',
          locationId,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      location: {
        findFirst: jest.fn().mockResolvedValue({ id: locationId }),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({ id: 'movement-id', newQuantity: 0 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    return {
      service: new StockMovementsService(prisma as never),
      tx,
    };
  }

  it('accepts an adjustment that recounts stock to zero', async () => {
    const { service, tx } = createService();

    await service.create(
      {
        itemId,
        locationId,
        type: StockMovementType.Adjustment,
        quantity: 0,
        reason: 'Physical recount',
      },
      businessId,
      BusinessModule.RETAIL,
    );

    expect(tx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: itemId },
      data: { quantity: 0 },
    });
  });

  it('still rejects zero-quantity non-adjustment movements', async () => {
    const { service } = createService();

    await expect(
      service.create(
        {
          itemId,
          locationId,
          type: StockMovementType.StockIn,
          quantity: 0,
        },
        businessId,
        BusinessModule.RETAIL,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
