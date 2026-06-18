import { BadRequestException } from '@nestjs/common';
import { BusinessModule } from '@prisma/client';
import { PurchaseOrdersService } from './purchase-orders.service';

describe('PurchaseOrdersService', () => {
  it('rejects inventory items that do not belong to the business', async () => {
    const prisma = {
      inventoryItem: { count: jest.fn().mockResolvedValue(0) },
      purchaseOrder: { create: jest.fn() },
    } as any;
    const service = new PurchaseOrdersService(prisma);

    await expect(
      service.create(
        {
          items: [
            {
              inventoryItemId: '00000000-0000-0000-0000-000000000001',
              name: 'Rice',
              quantity: 1,
              unitPrice: 50,
            },
          ],
        },
        'business-1',
        BusinessModule.RESTAURANT,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it('rejects a receipt that exceeds the remaining ordered quantity', async () => {
    const tx = {
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'po-1',
          orderNumber: 'PO-1',
          status: 'APPROVED',
          items: [
            {
              id: 'line-1',
              name: 'Rice',
              quantity: 10,
              receivedQty: 8,
              rejectedQty: 1,
              inventoryItemId: 'item-1',
            },
          ],
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new PurchaseOrdersService(prisma);

    await expect(
      service.receive(
        'po-1',
        {
          items: [
            {
              id: 'line-1',
              receivedQty: 2,
              rejectedQty: 0,
            },
          ],
        },
        'business-1',
        BusinessModule.RESTAURANT,
        'user-1',
      ),
    ).rejects.toThrow('exceeds the remaining ordered quantity');
  });
});
