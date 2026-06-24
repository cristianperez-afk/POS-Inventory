export function getLocalDateKey(date: Date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

/**
 * PostgreSQL's legacy `TIMESTAMP` columns have no offset. The POS database
 * writes those values in UTC, so attach UTC before the browser converts them
 * to the signed-in user's local date and time.
 */
export function parseDatabaseTimestamp(value: unknown) {
  if (value instanceof Date) return value;
  const raw = String(value ?? '').trim();
  if (!raw) return new Date(NaN);
  const isoLike = raw.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoLike);
  return new Date(hasTimezone ? isoLike : `${isoLike}Z`);
}
