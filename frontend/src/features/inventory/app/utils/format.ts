export const formatDate = (value: string) =>
  value ? new Date(value).toISOString().split('T')[0] : '';

export const formatPeso = (value: number | null | undefined) =>
  `₱${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

// True when an item was added within the trailing `days` window — drives the
// "recently added" indicator on the inventory lists.
export const isRecentlyAdded = (value?: string | null, days = 7): boolean => {
  if (!value) return false;
  const added = new Date(value);
  if (Number.isNaN(added.getTime())) return false;
  const ageMs = Date.now() - added.getTime();
  return ageMs >= 0 && ageMs <= days * 86400000;
};

export const getDaysUntil = (value?: string | null): number | null => {
  if (!value) return null;
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
};
