// Utility to handle number inputs and remove leading zeros
export const handleNumberInput = (value: string): string => {
  // Remove leading zeros unless it's just "0" or a decimal like "0.5"
  if (value === '' || value === '0') return value;

  // Handle decimal numbers
  if (value.includes('.')) {
    const [whole, decimal] = value.split('.');
    const cleanWhole = whole.replace(/^0+/, '') || '0';
    return `${cleanWhole}.${decimal}`;
  }

  // Remove leading zeros from whole numbers
  return value.replace(/^0+/, '') || '0';
};

// Parse number input value, removing leading zeros
export const parseNumberInput = (value: string): number => {
  const cleaned = handleNumberInput(value);
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};
