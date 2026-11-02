import React from 'react';

export function formatStarString(rating?: number | null): string {
  if (!rating || rating <= 0) return 'Unrated';
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '');
}

interface StarRatingInteractiveProps {
  value?: number | null;
  onChange: (nextRating: number | null) => void;
}

const RATING_STEPS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

export const StarRatingInteractive: React.FC<StarRatingInteractiveProps> = ({
  value,
  onChange,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {RATING_STEPS.map((step) => {
        const active = value === step;
        return (
          <button
            key={step}
            type="button"
            onClick={() => onChange(active ? null : step)}
            className={`px-2 py-1 text-xs font-mono-tabular rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              active
                ? 'bg-[#9A7B1C] dark:bg-[#D4AF37] text-white dark:text-[#0C0C0E] font-semibold'
                : 'bg-[#EBE6DF] dark:bg-[#1E2028] text-[#6E6A63] dark:text-[#9A9891] hover:text-[#181615] dark:hover:text-[#F4F1EA]'
            }`}
          >
            {step.toFixed(1)}★
          </button>
        );
      })}
    </div>
  );
};
