const CLOSED_STATUSES = new Set([
  'received',
  'rejected',
  'cancelled',
  'RECEIVED',
  'REJECTED',
  'CANCELLED',
]);

const pad = (value: number) => String(value).padStart(2, '0');

export function toDateTimeLocalInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatExpectedDelivery(value?: string | null) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getDeliveryDelayLabel(
  expectedDelivery?: string | null,
  now = new Date(),
) {
  if (!expectedDelivery) return null;

  const expected = new Date(expectedDelivery);
  if (Number.isNaN(expected.getTime()) || now <= expected) return null;

  const totalHours = Math.floor((now.getTime() - expected.getTime()) / 3_600_000);
  if (totalHours < 1) return 'less than 1 hour late';

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const parts = [];

  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);

  return `${parts.join(' and ')} late`;
}

export function isPurchaseOrderDelayed(
  expectedDelivery: string | null | undefined,
  status: string,
  now = new Date(),
) {
  return !CLOSED_STATUSES.has(status) && Boolean(getDeliveryDelayLabel(expectedDelivery, now));
}
