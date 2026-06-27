import { LoaderCircle } from 'lucide-react';

export function InlineDataLoading({
  label = 'Loading data…',
  className = '',
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground ${className}`}
      role="status"
      aria-live="polite"
    >
      <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
