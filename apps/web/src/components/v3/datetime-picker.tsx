'use client';

// Custom date+time picker — the native <input type="datetime-local"> renders
// inconsistently across browsers and looks out of place on the v3 surface.
// This one uses Radix Popover for the open/close behavior and shadcn Selects
// for the time controls so it matches the rest of the form vocabulary.
//
// Time resolution: 5-minute increments. Sufficient for survey-send timing
// and keeps the dropdown short.

import * as React from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface Props {
  value: Date;
  onChange: (next: Date) => void;
  // Optional minimum date (inclusive). Earlier dates are disabled in the grid.
  minDate?: Date;
  className?: string;
}

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/**
 * Build a 6-row × 7-col grid of dates for the given month, including the
 * trailing days of the previous month and leading days of the next month so
 * the grid is always rectangular. Week starts on Monday to match the
 * sidebar/calendar convention used elsewhere in the app.
 */
function monthGrid(viewYear: number, viewMonth: number): Date[] {
  const first = new Date(viewYear, viewMonth, 1);
  // JS getDay: Sun=0, Mon=1, ..., Sat=6. We want Mon-start, so map to 0-6.
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(viewYear, viewMonth, 1 - offset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return cells;
}

function formatDisplay(d: Date): string {
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const date = d.getDate();
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${day}, ${month} ${date} · ${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function DateTimePicker({ value, onChange, minDate, className }: Props) {
  const [open, setOpen] = React.useState(false);
  const [viewMonth, setViewMonth] = React.useState(value.getMonth());
  const [viewYear, setViewYear] = React.useState(value.getFullYear());

  // Keep the visible month in sync if `value` changes externally
  // (e.g. when the dialog opens with a new default).
  React.useEffect(() => {
    setViewMonth(value.getMonth());
    setViewYear(value.getFullYear());
  }, [value]);

  const today = startOfDay(new Date());
  const minDay = minDate ? startOfDay(minDate) : null;
  const cells = React.useMemo(() => monthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  function pickDate(d: Date) {
    const next = new Date(d);
    next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    onChange(next);
  }

  function setHour(h: number, ampm: 'AM' | 'PM') {
    const next = new Date(value);
    let hour24 = h % 12;
    if (ampm === 'PM') hour24 += 12;
    next.setHours(hour24);
    onChange(next);
  }

  function setMinute(m: number) {
    const next = new Date(value);
    next.setMinutes(m);
    onChange(next);
  }

  const hour12 = value.getHours() % 12 || 12;
  const ampm: 'AM' | 'PM' = value.getHours() >= 12 ? 'PM' : 'AM';
  const minutesRounded = Math.round(value.getMinutes() / 5) * 5;

  function navMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-[color:var(--card)] px-3 text-[13px] text-left',
            'hover:border-[color:var(--border-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--blue)]/40',
            className,
          )}
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="truncate">{formatDisplay(value)}</span>
          <CalendarIcon className="size-4 text-[color:var(--ink-mute)] shrink-0" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="z-50 rounded-2xl border bg-[color:var(--card)] p-4 shadow-lg w-[300px]"
          style={{ borderColor: 'var(--border)' }}
        >
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => navMonth(-1)}
              className="rounded p-1 hover:bg-[color:var(--paper-2)] text-[color:var(--ink-mute)]"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-[13px] font-bold text-[color:var(--ink)]">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={() => navMonth(1)}
              className="rounded p-1 hover:bg-[color:var(--paper-2)] text-[color:var(--ink-mute)]"
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_LABELS.map((d, i) => (
              <span
                key={i}
                className="text-center text-[10.5px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]"
              >{d}</span>
            ))}
          </div>

          {/* Date grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              const inMonth = d.getMonth() === viewMonth;
              const isToday = sameDay(d, today);
              const isSelected = sameDay(d, value);
              const disabled = minDay !== null && d < minDay;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => { pickDate(d); }}
                  className={cn(
                    'h-8 rounded text-[12.5px] tabular',
                    isSelected
                      ? 'bg-[color:var(--blue)] text-white font-bold'
                      : isToday
                        ? 'border border-[color:var(--blue)] text-[color:var(--ink)] font-semibold'
                        : inMonth
                          ? 'text-[color:var(--ink)] hover:bg-[color:var(--paper-2)]'
                          : 'text-[color:var(--ink-mute)] hover:bg-[color:var(--paper-2)]',
                    disabled && 'opacity-30 cursor-not-allowed hover:bg-transparent',
                  )}
                >{d.getDate()}</button>
              );
            })}
          </div>

          {/* Time controls */}
          <div className="mt-4 pt-3 border-t flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[11px] uppercase tracking-wide font-semibold text-[color:var(--ink-mute)]">Time</span>
            <Select
              value={String(hour12)}
              onValueChange={(v) => setHour(Number(v), ampm)}
            >
              <SelectTrigger className="h-8 w-[60px] text-[13px] tabular"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                  <SelectItem key={h} value={String(h)}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[color:var(--ink-mute)]">:</span>
            <Select
              value={String(minutesRounded).padStart(2, '0')}
              onValueChange={(v) => setMinute(Number(v))}
            >
              <SelectTrigger className="h-8 w-[64px] text-[13px] tabular"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                  <SelectItem key={m} value={String(m).padStart(2, '0')}>
                    {String(m).padStart(2, '0')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={ampm}
              onValueChange={(v) => setHour(hour12, v as 'AM' | 'PM')}
            >
              <SelectTrigger className="h-8 w-[64px] text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AM">AM</SelectItem>
                <SelectItem value="PM">PM</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[12px] font-semibold text-[color:var(--blue)] hover:underline px-2 py-1"
            >
              Done
            </button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
