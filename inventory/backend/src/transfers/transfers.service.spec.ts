import { TransfersService } from './transfers.service';
import { BusinessModule } from '@prisma/client';

describe('TransfersService', () => {
  it('reuses a SKU-less destination copy on repeated transfers', async () => {
    const sourceItem = {
      id: 'source-item',
      name: 'Tomato',
      itemType: 'INGREDIENT',
      sku: 'TOM-001',
      category: 'Produce',
      targetCustomer: null,
      subcategory: 'Vegetables',
      size: null,
      condition: null,
      quantity: 10,
      price: 5,
      unit: 'kg',
      minStock: 1,
      maxStock: 20,
      reorderPoint: 2,
      expiryDate: null,
      storageTemperature: 'Chilled',
      locationId: 'source-location',
      businessId: 'business',
    };
    const destinationItem = {
      ...sourceItem,
      id: 'destination-item',
      sku: null,
      quantity: 3,
      locationId: 'destination-location',
    };

    const tx = {
      transfer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'transfer',
          status: 'IN_TRANSIT',
          transferNumber: 'TRF-1',
          fromLocationId: 'source-location',
          toLocationId: 'destination-location',
          items: [{ inventoryItemId: sourceItem.id, quantity: 2 }],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: 'transfer',
          status: 'COMPLETED',
        }),
      },
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue(sourceItem),
        findFirst: jest.fn().mockResolvedValue(destinationItem),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new TransfersService(prisma as any);

    await service.complete(
      'transfer',
      'business',
      BusinessModule.RESTAURANT,
      'user',
    );

    expect(tx.inventoryItem.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: 'business',
        locationId: 'destination-location',
        OR: [
          { sku: 'TOM-001' },
          {
            sku: null,
            name: 'Tomato',
            itemType: 'INGREDIENT',
            category: 'Produce',
            subcategory: 'Vegetables',
            size: null,
            unit: 'kg',
          },
        ],
      },
    });
    expect(tx.inventoryItem.create).not.toHaveBeenCalled();
    expect(tx.inventoryItem.update).toHaveBeenNthCalledWith(2, {
      where: { id: destinationItem.id },
      data: { quantity: 5 },
    });
  });
});
