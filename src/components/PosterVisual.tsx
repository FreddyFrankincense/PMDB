import React, { useState } from 'react';
import { FilmRecord } from '../types/cinema';

interface PosterVisualProps {
  film: FilmRecord;
  className?: string;
  compact?: boolean;
}

const FALLBACK_POSTER_ART = '/src/assets/images/poster_fallback_artdeco_1793538460528.jpg';

export const PosterVisual: React.FC<PosterVisualProps> = ({
  film,
  className = 'w-full aspect-[2/3]',
  compact = false,
}) => {
  const [imgError, setImgError] = useState(false);
  const posterUrl = film.metadata?.posterUrl;
  const hasValidRemotePoster = Boolean(posterUrl && !imgError);

  return (
    <div
      className={`relative overflow-hidden bg-[#ECE7DD] dark:bg-[#16171C] border border-[#DED9CE] dark:border-[#262830] select-none ${className}`}
    >
      {hasValidRemotePoster ? (
        <img
          src={posterUrl}
          alt={`${film.title} (${film.year}) theatrical poster`}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="relative w-full h-full flex flex-col justify-between">
          <img
            src={FALLBACK_POSTER_ART}
            alt={`${film.title} archival cover`}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-35 dark:opacity-45"
          />
          <div className=" inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/30 absolute" />

          {!compact && (
            <div className="relative z-10 p-3 flex items-center justify-between text-[11px] font-mono-tabular text-[#D4AF37]/90 border-b border-white/10">
              <span>{film.year}</span>
              <span className="truncate max-w-[120px]">{film.metadata?.country || '35MM ARCHIVE'}</span>
            </div>
          )}

          <div className={`relative z-10 ${compact ? 'p-2' : 'p-3.5'} mt-auto`}>
            <p
              className={`font-editorial font-semibold text-[#F4F1EA] leading-tight line-clamp-3 ${
                compact ? 'text-xs' : 'text-base sm:text-lg'
              }`}
            >
              {film.title}
            </p>
            {!compact && film.metadata?.director && (
              <p className="mt-1 text-[11px] text-[#C8C4B8] truncate">
                Dir. {film.metadata.director}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
