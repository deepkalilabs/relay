"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DatePickerState } from "@/lib/recorder-session";

interface DatePickerOverlayProps {
  picker: DatePickerState;
  containerRef: RefObject<HTMLDivElement | null>;
  onDismiss: () => void;
  onSelect: (value: string) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])
    ? date
    : null;
}

function formatDate(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function clampDate(date: Date, min: Date | null, max: Date | null): Date {
  if (min && date < min) return min;
  if (max && date > max) return max;
  return date;
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function DatePickerOverlay({ picker, containerRef, onDismiss, onSelect }: DatePickerOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const selectedDate = useMemo(() => parseDate(picker.value), [picker.value]);
  const minDate = useMemo(() => parseDate(picker.min), [picker.min]);
  const maxDate = useMemo(() => parseDate(picker.max), [picker.max]);
  const initialDate = useMemo(() => clampDate(selectedDate ?? new Date(), minDate, maxDate), [selectedDate, minDate, maxDate]);
  const [month, setMonth] = useState(() => monthStart(initialDate));
  const [position, setPosition] = useState({ left: 8, top: 8 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const dialog = dialogRef.current;
    if (!container || !dialog) return;
    const place = () => {
      const scaleX = container.clientWidth / picker.viewport.width;
      const scaleY = container.clientHeight / picker.viewport.height;
      const anchorLeft = picker.rect.x * scaleX;
      const below = (picker.rect.y + picker.rect.height) * scaleY + 8;
      const above = picker.rect.y * scaleY - dialog.offsetHeight - 8;
      setPosition({
        left: Math.max(8, Math.min(anchorLeft, container.clientWidth - dialog.offsetWidth - 8)),
        top: Math.max(8, below + dialog.offsetHeight <= container.clientHeight - 8 ? below : above),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, picker]);

  useEffect(() => {
    const dismissOnPointerDown = (event: PointerEvent) => {
      if (!dialogRef.current?.contains(event.target as Node)) onDismiss();
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    };
    document.addEventListener("pointerdown", dismissOnPointerDown, true);
    document.addEventListener("keydown", dismissOnEscape, true);
    const focusTimer = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>("[aria-pressed='true'], button:not(:disabled)")?.focus();
    });
    return () => {
      document.removeEventListener("pointerdown", dismissOnPointerDown, true);
      document.removeEventListener("keydown", dismissOnEscape, true);
      cancelAnimationFrame(focusTimer);
    };
  }, [onDismiss, picker.requestId]);

  const firstVisible = new Date(month);
  firstVisible.setDate(1 - firstVisible.getDay());
  const days = Array.from({ length: 42 }, (_, index) => new Date(firstVisible.getFullYear(), firstVisible.getMonth(), firstVisible.getDate() + index));
  const previousMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const previousDisabled = Boolean(minDate && new Date(month.getFullYear(), month.getMonth(), 0) < minDate);
  const nextDisabled = Boolean(maxDate && nextMonth > maxDate);
  const today = formatDate(new Date());

  return (
    <div
      ref={dialogRef}
      className="date-picker"
      style={{ left: position.left, top: position.top }}
      role="dialog"
      aria-label="Choose date"
      aria-modal="false"
    >
      <div className="date-picker-heading">
        <button type="button" onClick={() => setMonth(previousMonth)} disabled={previousDisabled} aria-label="Previous month"><ChevronLeft size={17} /></button>
        <strong aria-live="polite">{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month)}</strong>
        <button type="button" onClick={() => setMonth(nextMonth)} disabled={nextDisabled} aria-label="Next month"><ChevronRight size={17} /></button>
      </div>
      <div className="date-picker-weekdays" aria-hidden="true">
        {WEEKDAYS.map((day) => <span key={day}>{day.slice(0, 2)}</span>)}
      </div>
      <div className="date-picker-grid" role="group" aria-label="Calendar days">
        {days.map((day) => {
          const value = formatDate(day);
          const outsideMonth = day.getMonth() !== month.getMonth();
          const disabled = Boolean((minDate && day < minDate) || (maxDate && day > maxDate));
          return (
            <button
              type="button"
              key={value}
              className={outsideMonth ? "outside-month" : ""}
              disabled={disabled}
              aria-current={value === today ? "date" : undefined}
              aria-pressed={value === picker.value}
              aria-label={new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(day)}
              onClick={() => onSelect(value)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
