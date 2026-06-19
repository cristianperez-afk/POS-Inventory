import { describe, expect, it } from 'vitest';
import { getStockStatus } from './inventoryLogic';

describe('getStockStatus', () => {
  it.each([
    [0, 100, 'out-of-stock'],
    [10, 100, 'critical'],
    [30, 100, 'low'],
    [70, 100, 'medium'],
    [100, 100, 'healthy'],
    [101, 100, 'overstock'],
  ] as const)(
    'maps %s of %s to %s',
    (stock, maxStock, expected) => {
      expect(getStockStatus(stock, maxStock)).toBe(expected);
    },
  );
});
