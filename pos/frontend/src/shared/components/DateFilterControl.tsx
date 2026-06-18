import { useRef } from 'react';
import { Calendar } from 'lucide-react';

export type DateFilterMode = 'all' | 'today' | 'date' | 'week' | 'month' | 'year';

interface DateFilterControlProps {
  mode: DateFilterMode;
  selectedDate: string;
  onModeChange: (mode: DateFilterMode) => void;
  onDateChange: (date: string) => void;
  className?: string;
}

export function DateFilterControl({
  mode,
  selectedDate,
  onModeChange,
  onDateChange,
  className = '',
}: DateFilterControlProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);

  const openDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;

    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.click();
    }
  };

  return (
    <div className="relative inline-flex items-stretch">
      <button
        type="button"
        onClick={openDatePicker}
        className="mr-2 inline-flex items-center justify-center rounded-lg border border-border bg-white px-3 text-primary transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
        aria-label="Choose date"
        title={selectedDate || 'Choose date'}
      >
        <Calendar className="h-4 w-4" />
      </button>
      <select
        value={mode}
        onChange={(event) => {
          const nextMode = event.target.value as DateFilterMode;
          if (nextMode === 'date') {
            openDatePicker();
            return;
          }
          onModeChange(nextMode);
        }}
        className={className}
      >
        {mode === 'date' && selectedDate && <option value="date">{selectedDate}</option>}
        <option value="all">All</option>
        <option value="today">Today</option>
        <option value="week">This Week</option>
        <option value="month">This Month</option>
        <option value="year">This Year</option>
      </select>
      <input
        ref={dateInputRef}
        type="date"
        value={selectedDate}
        onChange={(event) => {
          onDateChange(event.target.value);
          onModeChange('date');
        }}
        className="pointer-events-none absolute left-0 top-full h-px w-px opacity-0"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
