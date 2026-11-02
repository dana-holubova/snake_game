import React from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { Direction } from '../types/game';

interface DirectionalPadProps {
  onSteer: (dir: Direction) => void;
  disabled?: boolean;
}

export function DirectionalPad({ onSteer, disabled = false }: DirectionalPadProps) {
  const handleTrigger = (dir: Direction) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!disabled) {
      onSteer(dir);
    }
  };

  const handleKeyActivate = (dir: Direction) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
      e.preventDefault();
      onSteer(dir);
    }
  };

  const btnBase =
    'h-12 w-16 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 flex items-center justify-center transition-transform duration-100 active:scale-95 hover:bg-slate-800 hover:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-40 disabled:pointer-events-none select-none touch-manipulation';

  return (
    <div
      role="group"
      aria-label="Directional steering controls"
      className="flex flex-col items-center gap-2 pt-3"
    >
      <button
        type="button"
        aria-label="Steer Up"
        disabled={disabled}
        onPointerDown={handleTrigger('UP')}
        onKeyDown={handleKeyActivate('UP')}
        className={btnBase}
      >
        <ArrowUp className="w-5 h-5" aria-hidden="true" />
      </button>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Steer Left"
          disabled={disabled}
          onPointerDown={handleTrigger('LEFT')}
          onKeyDown={handleKeyActivate('LEFT')}
          className={btnBase}
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Steer Down"
          disabled={disabled}
          onPointerDown={handleTrigger('DOWN')}
          onKeyDown={handleKeyActivate('DOWN')}
          className={btnBase}
        >
          <ArrowDown className="w-5 h-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Steer Right"
          disabled={disabled}
          onPointerDown={handleTrigger('RIGHT')}
          onKeyDown={handleKeyActivate('RIGHT')}
          className={btnBase}
        >
          <ArrowRight className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
