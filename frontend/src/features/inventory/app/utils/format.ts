export const formatDate = (value: string) =>
  value ? new Date(value).toISOString().split('T')[0] : '';

export const formatPeso = (value: number | null | undefined) =>
  `₱${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export const getDaysUntil = (value?: string | null): number | null => {
  if (!value) return null;
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
};
