export const VAT_RATE = 0.12;

export function calculateVatBreakdown(totalAmount: number) {
  const total = Number.isFinite(totalAmount) ? Math.max(totalAmount, 0) : 0;
  const vatableSales = total / (1 + VAT_RATE);
  const vatAmount = total - vatableSales;

  return {
    vatableSales,
    vatAmount,
    total,
  };
}
