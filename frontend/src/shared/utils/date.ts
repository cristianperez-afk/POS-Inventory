export function getLocalDateKey(date: Date = new Date()) {
  return getManilaDateKey(date);
}

export function parseLocalDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export const MANILA_TIME_ZONE = 'Asia/Manila';

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

export function getManilaDateKey(value: unknown = new Date()) {
  const timestamp = value instanceof Date ? value : parseDatabaseTimestamp(value);
  if (Number.isNaN(timestamp.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(timestamp);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function formatManilaTime(value: unknown) {
  const timestamp = parseDatabaseTimestamp(value);
  if (Number.isNaN(timestamp.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

export function getManilaTime(date: Date = new Date()) {
  return formatManilaTime(date);
}

export function formatManilaDateTime(value: unknown) {
  const timestamp = parseDatabaseTimestamp(value);
  if (Number.isNaN(timestamp.getTime())) return '-';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

export function formatManilaFullDateTime(value: unknown) {
  const timestamp = parseDatabaseTimestamp(value);
  if (Number.isNaN(timestamp.getTime())) return '-';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}
