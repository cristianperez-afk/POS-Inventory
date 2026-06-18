import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryItemType } from './dto/create-inventory.dto';
import { InventoryService } from './inventory.service';

describe('InventoryService module isolation', () => {
  it('filters an omitted itemType to the user enabled module', async () => {
    const prisma = {
      inventoryItem: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as any;
    const service = new InventoryService(prisma);

    await service.findAll('business-1', undefined, undefined, ['RETAIL']);

    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: 'business-1',
          itemType: {
            in: [
              InventoryItemType.RetailItem,
              InventoryItemType.Bundle,
            ],
          },
        }),
      }),
    );
  });

  it('does not return a restaurant item to a retail-only user', async () => {
    const prisma = {
      inventoryItem: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const service = new InventoryService(prisma);

    await expect(
      service.findOne('item-1', 'business-1', ['RETAIL']),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.inventoryItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          itemType: {
            in: [
              InventoryItemType.RetailItem,
              InventoryItemType.Bundle,
            ],
          },
        }),
      }),
    );
  });

  it('rejects updating an inaccessible item when itemType is omitted', async () => {
    const prisma = {
      inventoryItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    } as any;
    const service = new InventoryService(prisma);

    await expect(
      service.update('item-1', { name: 'Rice' }, 'business-1', ['RETAIL']),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('requires an explicit type for restaurant inventory creation', async () => {
    const service = new InventoryService({} as any);

    await expect(
      service.create(
        {
          name: 'Rice',
          category: 'Grains',
          quantity: 0,
          price: 0,
          locationId: '00000000-0000-0000-0000-000000000001',
        },
        'business-1',
        ['RESTAURANT'],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
