import { useState, useRef } from "react";
import { format, parseISO, isValid } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// Detect touch/mobile devices — use native date input on these (iOS Safari Popover issue)
const isTouchDevice = () =>
  typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);

/**
 * DatePicker — drop-in replacement for <input type="date">
 * Uses native <input type="date"> on touch/mobile, custom calendar on desktop.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  min,
  max,
  className,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const nativeRef = useRef(null);

  const selected = value && isValid(parseISO(value)) ? parseISO(value) : undefined;
  const fromDate = min && isValid(parseISO(min)) ? parseISO(min) : undefined;
  const toDate   = max && isValid(parseISO(max)) ? parseISO(max) : undefined;

  const handleSelect = (day) => {
    if (!day) return;
    onChange(format(day, "yyyy-MM-dd"));
    setOpen(false);
  };

  // ── Mobile: native date input styled to match ────────────────────────────
  if (isTouchDevice()) {
    return (
      <div className={cn("relative w-full", className)}>
        <div className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border text-sm bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 pointer-events-none">
          <CalendarIcon size={15} className="shrink-0 text-stone-400 dark:text-stone-500" />
          <span className={cn("flex-1 text-left", !value && "text-stone-400 dark:text-stone-500")}>
            {value && isValid(parseISO(value)) ? format(parseISO(value), "dd MMM yyyy") : placeholder}
          </span>
        </div>
        <input
          ref={nativeRef}
          type="date"
          value={value || ""}
          min={min}
          max={max}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    );
  }

  // ── Desktop: custom calendar popover ────────────────────────────────────
  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border text-sm transition-colors",
            "bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700",
            "text-stone-900 dark:text-stone-100",
            "hover:border-orange-400 dark:hover:border-orange-500 focus:outline-none focus:border-orange-400",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            !selected && "text-stone-400 dark:text-stone-500",
            className
          )}
        >
          <CalendarIcon size={15} className="shrink-0 text-stone-400 dark:text-stone-500" />
          <span className="flex-1 text-left">
            {selected ? format(selected, "dd MMM yyyy") : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 shadow-xl rounded-2xl overflow-hidden"
        align="start"
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          fromDate={fromDate}
          toDate={toDate}
          defaultMonth={selected || fromDate}
          initialFocus
          className="rounded-2xl"
        />
      </PopoverContent>
    </Popover>
  );
}
