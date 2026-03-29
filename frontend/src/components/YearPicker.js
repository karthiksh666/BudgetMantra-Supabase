import { ChevronLeft, ChevronRight } from "lucide-react";

export default function YearPicker({ year, onChange, minYear = 2020 }) {
  const maxYear = new Date().getFullYear() + 1;
  return (
    <div className="flex items-center gap-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-2 py-1.5 shadow-sm">
      <button
        onClick={() => onChange(year - 1)}
        disabled={year <= minYear}
        className="p-0.5 rounded-lg text-stone-400 hover:text-stone-700 disabled:opacity-30 transition-colors"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="text-xs font-bold text-stone-700 dark:text-stone-200 min-w-[36px] text-center">{year}</span>
      <button
        onClick={() => onChange(year + 1)}
        disabled={year >= maxYear}
        className="p-0.5 rounded-lg text-stone-400 hover:text-stone-700 disabled:opacity-30 transition-colors"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
