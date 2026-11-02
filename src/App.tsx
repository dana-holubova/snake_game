import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { DirectionalPad } from './components/DirectionalPad';
import { ResilientModeArtwork } from './components/ResilientModeArtwork';
import { HudSnapshot, SnakeBoard } from './components/SnakeBoard';
import {
  BLITZ_DURATION_SECONDS,
  MODE_CONFIGS,
  SPEED_CONFIGS,
} from './constants/modes';
import {
  Direction,
  GameMode,
  GameOverReason,
  GameState,
  MatchRecord,
  RunSummary,
  SpeedTier,
} from './types/game';
import { arcadeSound } from './utils/sound';

const RECORDS_STORAGE_KEY = 'ophidian_match_records_v1';
const BESTS_STORAGE_KEY = 'ophidian_personal_bests_v1';

type BestsMap = Record<GameMode, number>;

const DEFAULT_BESTS: BestsMap = {
  [GameMode.Classic]: 0,
  [GameMode.Portal]: 0,
  [GameMode.Labyrinth]: 0,
  [GameMode.Blitz]: 0,
};

function loadPersonalBests(): BestsMap {
  try {
    const raw = localStorage.getItem(BESTS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BESTS };
    const parsed = JSON.parse(raw) as Partial<BestsMap>;
    return {
      [GameMode.Classic]: Number(parsed[GameMode.Classic]) || 0,
      [GameMode.Portal]: Number(parsed[GameMode.Portal]) || 0,
      [GameMode.Labyrinth]: Number(parsed[GameMode.Labyrinth]) || 0,
      [GameMode.Blitz]: Number(parsed[GameMode.Blitz]) || 0,
    };
  } catch {
    return { ...DEFAULT_BESTS };
  }
}

function loadMatchRecords(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatReasonProse(reason: GameOverReason): string {
  switch (reason) {
    case 'wall':
      return 'Struck the outer stone boundary.';
    case 'self':
      return 'Crossed into your own coiled body.';
    case 'obstacle':
      return 'Collided with a carved basalt pillar.';
    case 'time_up':
      return '90-second blitz countdown completed.';
    case 'board_cleared':
      return 'Every tile on the 22 × 22 arena conquered.';
  }
}

function formatReasonShort(reason: GameOverReason): string {
  switch (reason) {
    case 'wall':
      return 'Perimeter Wall';
    case 'self':
      return 'Self Coil';
    case 'obstacle':
      return 'Stone Pillar';
    case 'time_up':
      return 'Time Complete';
    case 'board_cleared':
      return 'Arena Cleared';
  }
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [mode, setMode] = useState<GameMode>(GameMode.Classic);
  const [speed, setSpeed] = useState<SpeedTier>(SpeedTier.Arcade);
  const [runNonce, setRunNonce] = useState<number>(1);
  const [muted, setMuted] = useState<boolean>(() => arcadeSound.isMuted());
  const [showDesktopPad, setShowDesktopPad] = useState<boolean>(false);

  const [personalBests, setPersonalBests] = useState<BestsMap>(loadPersonalBests);
  const [records, setRecords] = useState<MatchRecord[]>(loadMatchRecords);
  const [scoreFilter, setScoreFilter] = useState<'all' | GameMode>('all');
  const [confirmingClear, setConfirmingClear] = useState<boolean>(false);
  const [lastRun, setLastRun] = useState<RunSummary | null>(null);

  const [hud, setHud] = useState<HudSnapshot>({
    score: 0,
    length: 4,
    combo: 1,
    comboProgress: 0,
    goldenProgress: null,
    timeRemainingSec: null,
    applesEaten: 0,
  });

  const directionHandlerRef = useRef<((dir: Direction) => void) | null>(null);
  const arenaRef = useRef<HTMLElement | null>(null);

  const activeModeCfg = MODE_CONFIGS[mode];
  const activeSpeedCfg = SPEED_CONFIGS[speed];
  const activeBest = Math.max(personalBests[mode], hud.score);

  const blurActiveControl = () => {
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body) {
      active.blur();
    }
  };

  const startNewRun = useCallback(
    (overrideMode?: GameMode, scrollToArena: boolean = false) => {
      blurActiveControl();
      if (overrideMode && overrideMode !== mode) {
        setMode(overrideMode);
      }
      setLastRun(null);
      setRunNonce((n) => n + 1);
      setGameState('PLAYING');
      arcadeSound.playStart();

      if (scrollToArena) {
        arenaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [mode]
  );

  const handleTogglePause = useCallback(() => {
    blurActiveControl();
    setGameState((prev) => {
      if (prev === 'PLAYING') {
        arcadeSound.playPause(true);
        return 'PAUSED';
      }
      if (prev === 'PAUSED') {
        arcadeSound.playPause(false);
        return 'PLAYING';
      }
      return prev;
    });
  }, []);

  const handleReturnToTitle = useCallback(() => {
    blurActiveControl();
    setLastRun(null);
    setRunNonce((n) => n + 1);
    setGameState('TITLE_MENU');
  }, []);

  const handleSelectMode = (nextMode: GameMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setLastRun(null);
    setRunNonce((n) => n + 1);
    setGameState('TITLE_MENU');
  };

  const handleSelectSpeed = (nextSpeed: SpeedTier) => {
    if (nextSpeed === speed) return;
    setSpeed(nextSpeed);
    setLastRun(null);
    setRunNonce((n) => n + 1);
    setGameState('TITLE_MENU');
  };

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      arcadeSound.setMuted(next);
      return next;
    });
  }, []);

  const handleGameOver = useCallback((summary: RunSummary) => {
    setLastRun(summary);
    setGameState('GAME_OVER');

    setPersonalBests((prev) => {
      if (summary.score <= prev[summary.mode]) return prev;
      const updated = { ...prev, [summary.mode]: summary.score };
      try {
        localStorage.setItem(BESTS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage errors
      }
      return updated;
    });

    const newRecord: MatchRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      mode: summary.mode,
      speed: summary.speed,
      score: summary.score,
      applesEaten: summary.applesEaten,
      goldenEaten: summary.goldenEaten,
      maxLength: summary.maxLength,
      peakCombo: summary.peakCombo,
      durationSeconds: summary.durationSeconds,
      reason: summary.reason,
      playedAt: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setRecords((prev) => {
      const updated = [newRecord, ...prev].slice(0, 30);
      try {
        localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage errors
      }
      return updated;
    });
  }, []);

  const handleClearHistory = () => {
    setRecords([]);
    setPersonalBests({ ...DEFAULT_BESTS });
    setConfirmingClear(false);
    try {
      localStorage.removeItem(RECORDS_STORAGE_KEY);
      localStorage.removeItem(BESTS_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  const handleSteerInput = useCallback(
    (dir: Direction) => {
      if (gameState === 'PLAYING') {
        directionHandlerRef.current?.(dir);
      }
    },
    [gameState]
  );

  // Global keyboard bindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      // Steering keys
      let mappedDir: Direction | null = null;
      if (e.key === 'ArrowUp' || key === 'w') mappedDir = 'UP';
      else if (e.key === 'ArrowDown' || key === 's') mappedDir = 'DOWN';
      else if (e.key === 'ArrowLeft' || key === 'a') mappedDir = 'LEFT';
      else if (e.key === 'ArrowRight' || key === 'd') mappedDir = 'RIGHT';

      if (mappedDir) {
        if (gameState === 'PLAYING') {
          e.preventDefault();
          directionHandlerRef.current?.(mappedDir);
        }
        return;
      }

      if (e.key === ' ' || key === 'p') {
        if (gameState === 'PLAYING' || gameState === 'PAUSED') {
          e.preventDefault();
          handleTogglePause();
        } else if (
          e.key === ' ' &&
          (gameState === 'TITLE_MENU' || gameState === 'GAME_OVER') &&
          target?.tagName !== 'BUTTON'
        ) {
          e.preventDefault();
          startNewRun();
        }
        return;
      }

      if (e.key === 'Enter' && target?.tagName !== 'BUTTON') {
        if (gameState === 'TITLE_MENU' || gameState === 'GAME_OVER') {
          e.preventDefault();
          startNewRun();
        }
        return;
      }

      if (key === 'r' && !e.metaKey && !e.ctrlKey) {
        if (gameState === 'PLAYING' || gameState === 'PAUSED' || gameState === 'GAME_OVER') {
          e.preventDefault();
          startNewRun();
        }
        return;
      }

      if (key === 'm' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleToggleMute();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, handleToggleMute, handleTogglePause, startNewRun]);

  const filteredRecords = useMemo(() => {
    if (scoreFilter === 'all') return records;
    return records.filter((r) => r.mode === scoreFilter);
  }, [records, scoreFilter]);

  return (
    <div className="min-h-screen bg-[#0B1117] text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-[#0B1117]">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Single-element Brand Wordmark */}
          <a
            href="#arena"
            className="font-display text-xl font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
          >
            Ophidian
          </a>

          {/* Zone 2: 4 Clean Single-Line Text Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400"
          >
            <a
              href="#arena"
              className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Arena
            </a>
            <a
              href="#modes"
              className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Game Modes
            </a>
            <a
              href="#guide"
              className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              How to Play
            </a>
            <a
              href="#scores"
              className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              High Scores
            </a>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => startNewRun(undefined, true)}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-lg hover:bg-emerald-300 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              New Game
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Section 0: Primary Game Arena & Configuration Workspace */}
        <section
          id="arena"
          ref={arenaRef}
          className="max-w-[1200px] mx-auto px-6 pt-6 pb-14"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: HUD + Interactive Board + Touch D-Pad */}
            <div className="lg:col-span-7 flex flex-col">
              {/* Unobtrusive Top HUD */}
              <div className="w-full max-w-[580px] mx-auto flex flex-wrap items-end justify-between gap-4 pb-3.5">
                <div className="flex items-center gap-6 sm:gap-7">
                  <div>
                    <div className="text-xs font-medium text-slate-400">Score</div>
                    <div className="font-mono text-2xl font-semibold text-slate-100 tabular-nums leading-tight">
                      {hud.score.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-400">Best</div>
                    <div className="font-mono text-lg font-semibold text-slate-300 tabular-nums leading-tight">
                      {activeBest.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-400">Length</div>
                    <div className="font-mono text-lg font-semibold text-slate-300 tabular-nums leading-tight">
                      {hud.length}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-400">Streak</div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono text-lg font-semibold tabular-nums leading-tight ${
                          hud.combo > 1 ? 'text-amber-300' : 'text-slate-300'
                        }`}
                      >
                        {hud.combo}×
                      </span>
                      <div
                        aria-hidden="true"
                        className="flex items-center gap-0.5"
                      >
                        {[0.12, 0.38, 0.64, 0.86].map((threshold, idx) => (
                          <span
                            key={idx}
                            className={`w-2 h-1.5 rounded-xs transition-opacity duration-100 ${
                              gameState === 'PLAYING' && hud.comboProgress >= threshold
                                ? 'bg-amber-400 opacity-100'
                                : 'bg-slate-800 opacity-60'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {mode === GameMode.Blitz && (
                    <div>
                      <div className="text-xs font-medium text-slate-400">Clock</div>
                      <div
                        className={`font-mono text-lg font-semibold tabular-nums leading-tight ${
                          hud.timeRemainingSec !== null && hud.timeRemainingSec <= 12
                            ? 'text-rose-400'
                            : 'text-emerald-300'
                        }`}
                      >
                        {formatClock(hud.timeRemainingSec ?? BLITZ_DURATION_SECONDS)}
                        {hud.timeRemainingSec !== null &&
                          hud.timeRemainingSec <= 12 &&
                          ' ·Final'}
                      </div>
                    </div>
                  )}
                </div>

                {/* Workspace Toolbar Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
                    <button
                      type="button"
                      onClick={handleTogglePause}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#131C28] border border-slate-800 text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      {gameState === 'PAUSED' ? (
                        <>
                          <Play className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                          <span>Resume</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
                          <span>Pause</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleToggleMute}
                    aria-pressed={muted}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#131C28] border border-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    {muted ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        <span>Muted</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                        <span>Sound On</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Square Precision Arena Frame (r_outer = 16px, p = 8px, r_inner = 8px) */}
              <div className="relative w-full max-w-[580px] mx-auto aspect-square rounded-2xl bg-[#111924] border border-slate-800 p-2 shadow-xl">
                <div className="relative w-full h-full rounded-lg overflow-hidden">
                  <SnakeBoard
                    gameState={gameState}
                    mode={mode}
                    speed={speed}
                    runNonce={runNonce}
                    onDirectionRef={directionHandlerRef}
                    onHudUpdate={setHud}
                    onGameOver={handleGameOver}
                    personalBest={personalBests[mode]}
                  />

                  {/* Title Menu Overlay */}
                  {gameState === 'TITLE_MENU' && (
                    <div className="absolute inset-0 bg-slate-950/76 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-300 mb-3">
                        <span>{activeModeCfg.name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{activeSpeedCfg.label} Pace</span>
                        <span aria-hidden="true">·</span>
                        <span>22 × 22 Grid</span>
                      </div>

                      <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-50 max-w-md mb-3">
                        Steer the Serpent. Master the Grid.
                      </h1>

                      <p className="text-sm text-slate-300 max-w-sm leading-relaxed mb-7">
                        {activeModeCfg.summary}
                      </p>

                      <button
                        type="button"
                        onClick={() => startNewRun()}
                        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-slate-950 bg-emerald-400 rounded-lg hover:bg-emerald-300 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                      >
                        <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                        <span>Start Game</span>
                      </button>

                      <p className="mt-5 text-xs text-slate-400">
                        Press Space or Enter to launch · Steer with Arrow keys, WASD, or swipe
                      </p>
                    </div>
                  )}

                  {/* Paused Overlay */}
                  {gameState === 'PAUSED' && (
                    <div className="absolute inset-0 bg-slate-950/84 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center">
                      <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                        <span>{activeModeCfg.name}</span>
                        <span aria-hidden="true">·</span>
                        <span>Score {hud.score.toLocaleString()}</span>
                        <span aria-hidden="true">·</span>
                        <span>Length {hud.length}</span>
                      </div>

                      <h2 className="font-display text-3xl font-bold text-slate-50 mb-6">
                        Game Paused
                      </h2>

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={handleTogglePause}
                          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-950 bg-emerald-400 rounded-lg hover:bg-emerald-300 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                        >
                          <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                          <span>Resume Game</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => startNewRun()}
                          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        >
                          <RotateCcw className="w-4 h-4" aria-hidden="true" />
                          <span>Restart</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Game Over / Victory Summary Modal */}
                  {gameState === 'GAME_OVER' && lastRun && (
                    <div className="absolute inset-0 bg-slate-950/88 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center">
                      <div className="flex items-center gap-2 text-xs text-slate-300 mb-2">
                        {lastRun.isNewBest ? (
                          <span className="text-amber-300 font-semibold">
                            New Personal Best Recorded
                          </span>
                        ) : (
                          <>
                            <span>{MODE_CONFIGS[lastRun.mode].name}</span>
                            <span aria-hidden="true">·</span>
                            <span>{SPEED_CONFIGS[lastRun.speed].label} Pace</span>
                          </>
                        )}
                      </div>

                      <h2 className="font-display text-3xl sm:text-4xl font-bold text-slate-50 mb-2">
                        {lastRun.reason === 'board_cleared'
                          ? 'Arena Cleared'
                          : lastRun.reason === 'time_up'
                            ? 'Time Complete'
                            : 'Game Over'}
                      </h2>

                      <p className="text-sm text-slate-400 mb-6">
                        {formatReasonProse(lastRun.reason)}
                      </p>

                      {/* Clean unboxed 4-metric breakdown with hairline dividers */}
                      <div className="w-full max-w-md grid grid-cols-4 divide-x divide-slate-800 border-y border-slate-800 py-3.5 mb-7">
                        <div className="px-2">
                          <div className="text-xs text-slate-400">Score</div>
                          <div className="font-mono text-lg font-semibold text-slate-100 tabular-nums mt-0.5">
                            {lastRun.score.toLocaleString()}
                          </div>
                        </div>
                        <div className="px-2">
                          <div className="text-xs text-slate-400">Fruits</div>
                          <div className="font-mono text-lg font-semibold text-slate-100 tabular-nums mt-0.5">
                            {lastRun.applesEaten + lastRun.goldenEaten}
                          </div>
                        </div>
                        <div className="px-2">
                          <div className="text-xs text-slate-400">Length</div>
                          <div className="font-mono text-lg font-semibold text-slate-100 tabular-nums mt-0.5">
                            {lastRun.maxLength}
                          </div>
                        </div>
                        <div className="px-2">
                          <div className="text-xs text-slate-400">Peak Streak</div>
                          <div className="font-mono text-lg font-semibold text-amber-300 tabular-nums mt-0.5">
                            {lastRun.peakCombo}×
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => startNewRun()}
                          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-slate-950 bg-emerald-400 rounded-lg hover:bg-emerald-300 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                        >
                          <RotateCcw className="w-4 h-4" aria-hidden="true" />
                          <span>Play Again</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleReturnToTitle}
                          className="px-5 py-2.5 text-sm font-medium text-slate-300 bg-slate-900 border border-slate-800 rounded-lg hover:text-slate-100 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        >
                          Title Screen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* On-Screen Directional Pad (Always available on mobile/tablet, toggleable on desktop) */}
              <div className={showDesktopPad ? 'block' : 'block lg:hidden'}>
                <DirectionalPad
                  onSteer={handleSteerInput}
                  disabled={gameState !== 'PLAYING'}
                />
              </div>
            </div>

            {/* Right Column: Single-Elevation Configuration & Telemetry Panel */}
            <aside className="lg:col-span-5 rounded-2xl bg-[#111924] border border-slate-800 p-6 space-y-6">
              {/* Arena Mode Selector */}
              <div>
                <div className="flex items-baseline justify-between gap-4 mb-2.5">
                  <h2 className="font-display text-lg font-semibold text-slate-100">
                    Arena Mode
                  </h2>
                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                    {activeModeCfg.baseMultiplier.toFixed(2).replace(/\.00$/, '.0')}× mode bonus
                  </span>
                </div>

                <div
                  role="group"
                  aria-label="Select arena mode"
                  className="grid grid-cols-2 gap-1.5 p-1 bg-[#0B1117] rounded-xl border border-slate-800/90"
                >
                  {Object.values(MODE_CONFIGS).map((cfg) => {
                    const selected = mode === cfg.id;
                    return (
                      <button
                        key={cfg.id}
                        type="button"
                        onClick={() => handleSelectMode(cfg.id)}
                        className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                          selected
                            ? 'bg-slate-800 text-emerald-300 shadow-xs'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {cfg.name}
                      </button>
                    );
                  })}
                </div>

                <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                  {activeModeCfg.detail}
                </p>
              </div>

              {/* Serpent Pace Selector */}
              <div className="pt-6 border-t border-slate-800/80">
                <div className="flex items-baseline justify-between gap-4 mb-2.5">
                  <h2 className="font-display text-lg font-semibold text-slate-100">
                    Serpent Pace
                  </h2>
                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                    {activeSpeedCfg.cadenceLabel}
                  </span>
                </div>

                <div
                  role="group"
                  aria-label="Select serpent speed"
                  className="grid grid-cols-3 gap-1 p-1 bg-[#0B1117] rounded-xl border border-slate-800/90"
                >
                  {Object.values(SPEED_CONFIGS).map((sCfg) => {
                    const selected = speed === sCfg.id;
                    return (
                      <button
                        key={sCfg.id}
                        type="button"
                        onClick={() => handleSelectSpeed(sCfg.id)}
                        className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                          selected
                            ? 'bg-slate-800 text-emerald-300 shadow-xs'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {sCfg.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>{activeSpeedCfg.scoreMultiplier}× pace multiplier</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeModeCfg.wallBehavior}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Combined{' '}
                    {(
                      activeModeCfg.baseMultiplier * activeSpeedCfg.scoreMultiplier
                    ).toFixed(2).replace(/\.00$/, '.0')}
                    × base
                  </span>
                </div>
              </div>

              {/* Harvest & Multiplier Breakdown */}
              <div className="pt-6 border-t border-slate-800/80 space-y-3">
                <h2 className="font-display text-lg font-semibold text-slate-100">
                  Scoring & Fruit Harvest
                </h2>

                <div className="space-y-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-slate-300">Crimson Apple</span>
                    <span className="font-mono text-xs text-slate-400 tabular-nums">
                      +10 pts × streak · +1 length
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-amber-300">Golden Fruit (Every 5th)</span>
                    <span className="font-mono text-xs text-slate-400 tabular-nums">
                      {mode === GameMode.Blitz
                        ? '+50 pts × streak · +4s clock'
                        : '+50 pts × streak · 8.5s window'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-slate-300">Rapid Streak Window</span>
                    <span className="font-mono text-xs text-slate-400 tabular-nums">
                      4.5s chain · Up to 4×
                    </span>
                  </div>
                </div>
              </div>

              {/* Input & Accessibility Controls */}
              <div className="pt-6 border-t border-slate-800/80 space-y-3">
                <h2 className="font-display text-lg font-semibold text-slate-100">
                  Controls
                </h2>

                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Steer</span>
                    <span className="font-mono text-slate-200">Arrows / WASD</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Pause</span>
                    <span className="font-mono text-slate-200">Space / P</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Quick Restart</span>
                    <span className="font-mono text-slate-200">R</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Mute Sound</span>
                    <span className="font-mono text-slate-200">M</span>
                  </div>
                </div>

                <div className="hidden lg:flex items-center justify-between pt-2">
                  <span className="text-xs text-slate-400">
                    Pointer steering pad below board
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowDesktopPad((v) => !v)}
                    aria-pressed={showDesktopPad}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0B1117] border border-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <Gamepad2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    <span>{showDesktopPad ? 'Hide D-Pad' : 'Show D-Pad'}</span>
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* Section 1: Four Playable Game Modes Showcase */}
        <section
          id="modes"
          className="max-w-[1200px] mx-auto px-6 py-14 border-t border-slate-800/80"
        >
          <div className="max-w-2xl mb-9">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-100 mb-2">
              01. Four Distinct Arenas
            </h2>
            <p className="text-base text-slate-400 leading-relaxed">
              Choose between classic solid-stone discipline, seamless cross-board edge
              portals, carved interior basalt monoliths, or a 90-second dual-apple sprint.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {Object.values(MODE_CONFIGS).map((cfg) => {
              const isSelected = mode === cfg.id;
              const bestVal = personalBests[cfg.id];
              return (
                <article
                  key={cfg.id}
                  className="group rounded-xl bg-[#111924] border border-slate-800 overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <ResilientModeArtwork
                      src={cfg.image}
                      alt={`${cfg.name} board preview`}
                      mode={cfg.id}
                    />
                    <div className="p-5">
                      <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                        <span>{cfg.wallBehavior}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {cfg.baseMultiplier}× Base
                        </span>
                      </div>

                      <h3 className="font-display text-lg font-semibold text-slate-100 mb-2">
                        {cfg.name}
                      </h3>

                      <p className="text-sm text-slate-400 leading-relaxed">
                        {cfg.summary}
                      </p>
                    </div>
                  </div>

                  <div className="px-5 pb-5 pt-3 border-t border-slate-800/70 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-400">
                      Best:{' '}
                      <span className="font-mono font-semibold text-slate-200 tabular-nums">
                        {bestVal.toLocaleString()}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => startNewRun(cfg.id, true)}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                        isSelected
                          ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                          : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      Play {cfg.shortName}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Section 2: Mechanics & Tactical Guide */}
        <section
          id="guide"
          className="max-w-[1200px] mx-auto px-6 py-14 border-t border-slate-800/80"
        >
          <div className="max-w-2xl mb-9">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-100 mb-2">
              02. Mechanics & Cornering Technique
            </h2>
            <p className="text-base text-slate-400 leading-relaxed">
              Every system on the board is deterministic—built for responsive turns,
              calculated coil routing, and streak optimization.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:divide-x md:divide-slate-800/80">
            <div className="md:pr-6">
              <h3 className="font-display text-lg font-semibold text-slate-100 mb-2">
                01. Two-Step Turn Buffering
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Rapid directional sequences—such as pressing Up and immediately Left to
                execute a tight U-turn—are queued across two consecutive simulation ticks
                so fast fingers never trigger accidental neck collisions.
              </p>
            </div>

            <div className="md:px-6">
              <h3 className="font-display text-lg font-semibold text-slate-100 mb-2">
                02. Streak Windows & Golden Fruit
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Collecting another fruit within 4.5 seconds advances your streak multiplier
                up to 4×. Every fifth crimson apple summons a timed Golden Fruit worth
                five times normal value—plan your fifth catch near open center lanes.
              </p>
            </div>

            <div className="md:pl-6">
              <h3 className="font-display text-lg font-semibold text-slate-100 mb-2">
                03. Vacating Tail Geometry
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Unless your serpent is actively expanding from a recent catch, the final
                tail tip vacates its square on the exact tick your head steps forward,
                allowing nose-to-tail loop escapes inside crowded late-game boards.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Personal High Scores & Match History */}
        <section
          id="scores"
          className="max-w-[1200px] mx-auto px-6 py-14 border-t border-slate-800/80"
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-100 mb-2">
                03. Personal Bests & Match Log
              </h2>
              <p className="text-base text-slate-400">
                Scores are saved automatically in your browser across all four arenas.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Interactive Filter Control */}
              <div
                role="group"
                aria-label="Filter match log by mode"
                className="flex items-center gap-1 p-1 bg-[#111924] border border-slate-800 rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => setScoreFilter('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    scoreFilter === 'all'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All
                </button>
                {Object.values(MODE_CONFIGS).map((cfg) => (
                  <button
                    key={cfg.id}
                    type="button"
                    onClick={() => setScoreFilter(cfg.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      scoreFilter === cfg.id
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cfg.shortName}
                  </button>
                ))}
              </div>

              {(records.length > 0 ||
                Object.values(personalBests).some((v) => v > 0)) && (
                <div className="flex items-center gap-2">
                  {confirmingClear ? (
                    <>
                      <button
                        type="button"
                        onClick={handleClearHistory}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500 text-slate-950 hover:bg-rose-400 transition-colors whitespace-nowrap shrink-0"
                      >
                        Confirm Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingClear(false)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingClear(true)}
                      className="px-3.5 py-2 text-xs font-medium rounded-lg bg-[#111924] border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-colors whitespace-nowrap shrink-0"
                    >
                      Reset Scores
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 4-Mode Personal Best Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800 rounded-xl bg-[#111924] border border-slate-800 mb-8">
            {Object.values(MODE_CONFIGS).map((cfg) => (
              <div key={cfg.id} className="p-5">
                <div className="text-xs font-medium text-slate-400 mb-1">
                  {cfg.name}
                </div>
                <div className="font-mono text-2xl font-semibold text-slate-100 tabular-nums">
                  {personalBests[cfg.id].toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {/* Match History Table or Empty State */}
          {filteredRecords.length === 0 ? (
            <div className="rounded-xl bg-[#111924] border border-slate-800 p-10 text-center">
              <p className="text-sm text-slate-300 mb-1">
                {records.length === 0
                  ? 'No completed matches recorded yet.'
                  : `No matches recorded in ${MODE_CONFIGS[scoreFilter as GameMode].name} yet.`}
              </p>
              <p className="text-xs text-slate-400 mb-5">
                Finish a run in the arena above to log detailed score, streak, and survival
                metrics.
              </p>
              <button
                type="button"
                onClick={() =>
                  startNewRun(
                    scoreFilter === 'all' ? undefined : scoreFilter,
                    true
                  )
                }
                className="px-5 py-2.5 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-lg hover:bg-emerald-300 transition-colors whitespace-nowrap shrink-0"
              >
                Start a Match
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-[#111924] border border-slate-800 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-medium text-slate-400">
                    <th className="py-3.5 px-5">Arena</th>
                    <th className="py-3.5 px-4">Pace</th>
                    <th className="py-3.5 px-4 text-right">Score</th>
                    <th className="py-3.5 px-4 text-right">Fruits</th>
                    <th className="py-3.5 px-4 text-right">Length</th>
                    <th className="py-3.5 px-4 text-right">Peak Streak</th>
                    <th className="py-3.5 px-4 text-right">Time</th>
                    <th className="py-3.5 px-5 text-right">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-sm">
                  {filteredRecords.map((rec) => (
                    <tr
                      key={rec.id}
                      className="hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3 px-5 font-medium text-slate-200 whitespace-nowrap">
                        {MODE_CONFIGS[rec.mode].name}
                      </td>
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {SPEED_CONFIGS[rec.speed].label}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-300 tabular-nums whitespace-nowrap">
                        {rec.score.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300 tabular-nums whitespace-nowrap">
                        {rec.applesEaten + rec.goldenEaten}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300 tabular-nums whitespace-nowrap">
                        {rec.maxLength}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-amber-300 tabular-nums whitespace-nowrap">
                        {rec.peakCombo}×
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400 tabular-nums whitespace-nowrap">
                        {formatClock(rec.durationSeconds)}
                      </td>
                      <td className="py-3 px-5 text-right text-xs text-slate-400 whitespace-nowrap">
                        {formatReasonShort(rec.reason)} · {rec.playedAt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 py-6">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>Ophidian — Precision 2D Arcade Snake</span>
          <div className="flex items-center gap-6">
            <a href="#arena" className="hover:text-slate-300 transition-colors">
              Back to Arena
            </a>
            <a href="#modes" className="hover:text-slate-300 transition-colors">
              Modes
            </a>
            <a href="#scores" className="hover:text-slate-300 transition-colors">
              High Scores
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
