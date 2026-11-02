import { useState } from 'react';
import { Compass, Clock, Grid3X3, Shield } from 'lucide-react';
import { GameMode } from '../types/game';

interface ResilientModeArtworkProps {
  src: string;
  alt: string;
  mode: GameMode;
}

export function ResilientModeArtwork({ src, alt, mode }: ResilientModeArtworkProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    const Icon =
      mode === GameMode.Portal
        ? Compass
        : mode === GameMode.Labyrinth
          ? Shield
          : mode === GameMode.Blitz
            ? Clock
            : Grid3X3;

    return (
      <div className="aspect-[4/3] w-full bg-gradient-to-br from-slate-900 via-[#111B27] to-emerald-950/50 flex flex-col items-center justify-center p-6 text-center border-b border-slate-800">
        <Icon className="w-9 h-9 text-emerald-400 mb-2.5" aria-hidden="true" />
        <span className="text-xs font-medium text-slate-300">{alt}</span>
      </div>
    );
  }

  return (
    <div className="aspect-[4/3] w-full overflow-hidden bg-slate-950 border-b border-slate-800">
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
      />
    </div>
  );
}
