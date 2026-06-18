import { BadRequestException } from '@nestjs/common';
import { BusinessModule } from '@prisma/client';
import { TransfersService } from './transfers.service';

describe('TransfersService validation', () => {
  it('rejects locations outside the current business', async () => {
    const prisma = {
      location: { count: jest.fn().mockResolvedValue(1) },
      transfer: { create: jest.fn() },
    } as any;
    const service = new TransfersService(prisma);

    await expect(
      service.create(
        {
          fromLocationId: '00000000-0000-0000-0000-000000000001',
          toLocationId: '00000000-0000-0000-0000-000000000002',
          items: [
            {
              inventoryItemId: '00000000-0000-0000-0000-000000000003',
              quantity: 1,
            },
          ],
        },
        'business-1',
        BusinessModule.RETAIL,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.transfer.create).not.toHaveBeenCalled();
  });

  it('rejects items that are not at the source location', async () => {
    const prisma = {
      location: { count: jest.fn().mockResolvedValue(2) },
      inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
      transfer: { create: jest.fn() },
    } as any;
    const service = new TransfersService(prisma);

    await expect(
      service.create(
        {
          fromLocationId: '00000000-0000-0000-0000-000000000001',
          toLocationId: '00000000-0000-0000-0000-000000000002',
          items: [
            {
              inventoryItemId: '00000000-0000-0000-0000-000000000003',
              quantity: 1,
            },
          ],
        },
        'business-1',
        BusinessModule.RETAIL,
        'user-1',
      ),
    ).rejects.toThrow('unavailable at the source location');
  });
});
