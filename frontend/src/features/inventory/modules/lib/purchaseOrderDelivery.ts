const CLOSED_DELIVERY_STATUSES = new Set([
  'received',
  'rejected',
  'cancelled',
  'RECEIVED',
  'REJECTED',
  'CANCELLED',
]);

const pad = (value: number) => String(value).padStart(2, '0');
const DELIVERY_START_MINUTES = 8 * 60;
const DELIVERY_END_MINUTES = 18 * 60;

export const EXPECTED_DELIVERY_TIME_WINDOW_LABEL = '8:00 AM to 6:00 PM';

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

// Lower bound for the expected-delivery picker: now. Past dates/times are for a
// future delivery, so they must not be selectable. Computed fresh per call so it
// stays current while a form is open.
export function getMinExpectedDeliveryInput() {
  return toDateTimeLocalInput(new Date());
}

// Rejects an expected-delivery datetime that is in the past. Used on create only —
// editing an existing order may legitimately retain an already-past delivery date.
export function getExpectedDeliveryPastError(value?: string | null, now = new Date()) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null; // invalid/empty handled by the window + required checks
  if (date.getTime() < now.getTime()) {
    return 'Expected delivery must be a future date and time.';
  }
  return null;
}

export function getExpectedDeliveryTimeWindowError(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Select a valid expected delivery date and time.';

  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes < DELIVERY_START_MINUTES || minutes > DELIVERY_END_MINUTES) {
    return `Expected delivery time must be between ${EXPECTED_DELIVERY_TIME_WINDOW_LABEL}.`;
  }

  return null;
}

export function getDeliveryDelayLabel(
  expectedDelivery?: string | null,
  now = new Date(),
) {
  if (!expectedDelivery) return null;

  const expected = new Date(expectedDelivery);
  if (Number.isNaN(expected.getTime()) || now <= expected) return null;

  const totalMinutes = Math.floor((now.getTime() - expected.getTime()) / 60_000);
  if (totalMinutes < 1) return 'Delayed: less than 1 minute';

  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const dayLabel = `${days} ${days === 1 ? 'day' : 'days'}`;
  const hourLabel = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const minuteLabel = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;

  if (days > 0) return `Delayed: ${dayLabel}, ${hourLabel} and ${minuteLabel}`;
  if (hours > 0) return `Delayed: ${hourLabel} and ${minuteLabel}`;
  return `Delayed: ${minuteLabel}`;
}

export function isPurchaseOrderDelayed(
  expectedDelivery: string | null | undefined,
  status: string,
  now = new Date(),
) {
  return !CLOSED_DELIVERY_STATUSES.has(status) && Boolean(getDeliveryDelayLabel(expectedDelivery, now));
}
