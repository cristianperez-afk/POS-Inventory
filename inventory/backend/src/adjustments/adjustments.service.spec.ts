import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BusinessModule } from '@prisma/client';
import { AdjustmentsService } from './adjustments.service';

describe('AdjustmentsService', () => {
  const businessId = 'business-1';
  const reviewedById = 'manager-1';

  function createService(txOverrides: Record<string, unknown> = {}) {
    const tx = {
      stockAdjustment: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'adjustment-1' }),
      },
      inventoryItem: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({}),
      },
      ...txOverrides,
    } as any;
    const prisma = {
      stockAdjustment: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as any;

    return {
      service: new AdjustmentsService(prisma),
      prisma,
      tx,
    };
  }

  function pendingAdjustment(items = [{ inventoryItemId: 'item-1', quantityChange: 2, locationId: 'loc-1' }]) {
    return {
      id: 'adjustment-1',
      adjustmentNumber: 'ADJ-1',
      type: 'ADD',
      reason: 'Cycle count',
      status: 'PENDING',
      items,
    };
  }

  it('applies approved adjustments and writes module-scoped stock movements', async () => {
    const { service, tx } = createService();
    tx.stockAdjustment.findFirst.mockResolvedValue(pendingAdjustment());
    tx.inventoryItem.findFirst.mockResolvedValue({
      id: 'item-1',
      name: 'Jacket',
      quantity: 3,
      unit: 'pcs',
    });

    await service.approve(
      'adjustment-1',
      businessId,
      BusinessModule.RETAIL,
      'Manager',
      reviewedById,
    );

    expect(tx.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { quantity: 5 },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'ADJUSTMENT',
        previousQuantity: 3,
        newQuantity: 5,
        businessId,
        module: BusinessModule.RETAIL,
        createdById: reviewedById,
      }),
    });
    expect(tx.stockAdjustment.update).toHaveBeenCalledWith({
      where: { id: 'adjustment-1' },
      data: {
        status: 'APPROVED',
        reviewedById,
        reviewedAt: expect.any(Date),
      },
      include: expect.any(Object),
    });
  });

  it('throws when an adjustment item is no longer available and does not mark approved', async () => {
    const { service, tx } = createService();
    tx.stockAdjustment.findFirst.mockResolvedValue(pendingAdjustment());
    tx.inventoryItem.findFirst.mockResolvedValue(null);

    await expect(
      service.approve(
        'adjustment-1',
        businessId,
        BusinessModule.RETAIL,
        'Admin',
        reviewedById,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockAdjustment.update).not.toHaveBeenCalled();
  });

  it('prevents negative quantities before mutating any adjustment item', async () => {
    const { service, tx } = createService();
    tx.stockAdjustment.findFirst.mockResolvedValue(
      pendingAdjustment([
        { inventoryItemId: 'item-1', quantityChange: 1, locationId: 'loc-1' },
        { inventoryItemId: 'item-2', quantityChange: -5, locationId: 'loc-1' },
      ]),
    );
    tx.inventoryItem.findFirst
      .mockResolvedValueOnce({
        id: 'item-1',
        name: 'Shirt',
        quantity: 10,
        unit: 'pcs',
      })
      .mockResolvedValueOnce({
        id: 'item-2',
        name: 'Pants',
        quantity: 2,
        unit: 'pcs',
      });

    await expect(
      service.approve(
        'adjustment-1',
        businessId,
        BusinessModule.RETAIL,
        'Manager',
        reviewedById,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.stockAdjustment.update).not.toHaveBeenCalled();
  });

  it('rejects double approval when the adjustment is no longer pending', async () => {
    const { service, tx } = createService();
    tx.stockAdjustment.findFirst.mockResolvedValue({
      ...pendingAdjustment(),
      status: 'APPROVED',
    });

    await expect(
      service.approve(
        'adjustment-1',
        businessId,
        BusinessModule.RETAIL,
        'Admin',
        reviewedById,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('blocks staff from approving or rejecting adjustments', async () => {
    const { service, prisma } = createService();

    await expect(
      service.approve(
        'adjustment-1',
        businessId,
        BusinessModule.RETAIL,
        'Staff',
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.reject(
        'adjustment-1',
        businessId,
        BusinessModule.RETAIL,
        'Staff',
        'No',
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.stockAdjustment.update).not.toHaveBeenCalled();
  });

  it('scopes reads by business and module', async () => {
    const { service, prisma } = createService();
    prisma.stockAdjustment.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('adjustment-1', businessId, BusinessModule.RESTAURANT),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.stockAdjustment.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'adjustment-1',
        businessId,
        module: BusinessModule.RESTAURANT,
      },
      include: expect.any(Object),
    });
  });
});
