import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * MonthPicker — replacement for <input type="month">
 *
 * Props:
 *   value     string "YYYY-MM"
 *   onChange  fn(string) — called with "YYYY-MM"
 *   placeholder  string
 *   className string
 *   disabled  bool
 */
export function MonthPicker({ value, onChange, placeholder = "Select month", className, disabled = false }) {
  const [open, setOpen] = useState(false);

  const parsed = value ? value.split("-").map(Number) : null;
  const selYear  = parsed ? parsed[0] : new Date().getFullYear();
  const selMonth = parsed ? parsed[1] : null; // 1-indexed

  const [viewYear, setViewYear] = useState(selYear);

  const displayLabel = parsed
    ? `${MONTHS[selMonth - 1]} ${selYear}`
    : null;

  const handleSelect = (monthIdx) => {
    const m = String(monthIdx + 1).padStart(2, "0");
    onChange(`${viewYear}-${m}`);
    setOpen(false);
  };

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
            !displayLabel && "text-stone-400 dark:text-stone-500",
            className
          )}
        >
          <CalendarDays size={15} className="shrink-0 text-stone-400 dark:text-stone-500" />
          <span className="flex-1 text-left">{displayLabel || placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3 bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 shadow-xl rounded-2xl"
        align="start"
      >
        {/* Year navigation */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setViewYear(y => y - 1)}
            className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="font-semibold text-stone-800 dark:text-stone-200 text-sm">{viewYear}</span>
          <button
            type="button"
            onClick={() => setViewYear(y => y + 1)}
            className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS.map((m, idx) => {
            const isSelected = selMonth === idx + 1 && selYear === viewYear;
            return (
              <button
                key={m}
                type="button"
                onClick={() => handleSelect(idx)}
                className={cn(
                  "py-2 rounded-xl text-sm font-medium transition-all",
                  isSelected
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                )}
              >
                {m}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
