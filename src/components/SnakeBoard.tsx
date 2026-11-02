import React, { useEffect, useRef } from 'react';
import {
  BLITZ_DURATION_SECONDS,
  COMBO_WINDOW_MS,
  GOLDEN_LIFETIME_MS,
  GRID_SIZE,
  MODE_CONFIGS,
  SPEED_CONFIGS,
  getObstaclesForMode,
} from '../constants/modes';
import {
  Direction,
  FloatingPopup,
  Fruit,
  GameMode,
  GameOverReason,
  GameState,
  Particle,
  Point,
  RunSummary,
  SpeedTier,
} from '../types/game';
import { arcadeSound } from '../utils/sound';

export interface HudSnapshot {
  score: number;
  length: number;
  combo: number;
  comboProgress: number; // 0..1 remaining window
  goldenProgress: number | null; // 0..1 remaining window if golden fruit active
  timeRemainingSec: number | null; // only for Chrono Blitz
  applesEaten: number;
}

interface SnakeBoardProps {
  gameState: GameState;
  mode: GameMode;
  speed: SpeedTier;
  runNonce: number;
  onDirectionRef: React.MutableRefObject<((dir: Direction) => void) | null>;
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onGameOver: (summary: RunSummary) => void;
  personalBest: number;
}

const DIR_VECTORS: Record<Direction, Point> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

function isOpposite(a: Direction, b: Direction): boolean {
  return (
    (a === 'UP' && b === 'DOWN') ||
    (a === 'DOWN' && b === 'UP') ||
    (a === 'LEFT' && b === 'RIGHT') ||
    (a === 'RIGHT' && b === 'LEFT')
  );
}

function createInitialSnake(): Point[] {
  return [
    { x: 6, y: 11 },
    { x: 5, y: 11 },
    { x: 4, y: 11 },
    { x: 3, y: 11 },
  ];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function SnakeBoard({
  gameState,
  mode,
  speed,
  runNonce,
  onDirectionRef,
  onHudUpdate,
  onGameOver,
  personalBest,
}: SnakeBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Latest React props mirrored into refs for zero-stale-closure rAF loop
  const stateRef = useRef(gameState);
  const modeRef = useRef(mode);
  const speedRef = useRef(speed);
  const bestRef = useRef(personalBest);
  const onHudRef = useRef(onHudUpdate);
  const onGameOverRef = useRef(onGameOver);

  stateRef.current = gameState;
  modeRef.current = mode;
  speedRef.current = speed;
  bestRef.current = personalBest;
  onHudRef.current = onHudUpdate;
  onGameOverRef.current = onGameOver;

  // Mutable simulation state inside ref for crisp 60fps performance
  const simRef = useRef<{
    snake: Point[];
    prevSnake: Point[];
    direction: Direction;
    directionQueue: Direction[];
    obstacles: Point[];
    fruits: Fruit[];
    nextFruitId: number;
    particles: Particle[];
    popups: FloatingPopup[];
    nextPopupId: number;
    pendingGrowth: number;
    score: number;
    applesEaten: number;
    goldenEaten: number;
    combo: number;
    peakCombo: number;
    lastEatTime: number;
    lastTickTime: number;
    currentTickMs: number;
    elapsedPlayMs: number;
    blitzRemainingMs: number;
    lastFrameTime: number;
    lastHudSyncTime: number;
    reducedMotion: boolean;
  }>({
    snake: createInitialSnake(),
    prevSnake: createInitialSnake(),
    direction: 'RIGHT',
    directionQueue: [],
    obstacles: getObstaclesForMode(mode),
    fruits: [],
    nextFruitId: 1,
    particles: [],
    popups: [],
    nextPopupId: 1,
    pendingGrowth: 0,
    score: 0,
    applesEaten: 0,
    goldenEaten: 0,
    combo: 1,
    peakCombo: 1,
    lastEatTime: 0,
    lastTickTime: 0,
    currentTickMs: SPEED_CONFIGS[speed].baseTickMs,
    elapsedPlayMs: 0,
    blitzRemainingMs: BLITZ_DURATION_SECONDS * 1000,
    lastFrameTime: 0,
    lastHudSyncTime: 0,
    reducedMotion: false,
  });

  // Helper to spawn fruit on unoccupied tiles
  const spawnFruit = (
    sim: typeof simRef.current,
    kind: 'apple' | 'golden',
    now: number
  ): boolean => {
    const occupied = new Set<string>();
    for (const seg of sim.snake) occupied.add(`${seg.x},${seg.y}`);
    for (const obs of sim.obstacles) occupied.add(`${obs.x},${obs.y}`);
    for (const f of sim.fruits) occupied.add(`${f.x},${f.y}`);

    const free: Point[] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (!occupied.has(`${x},${y}`)) {
          free.push({ x, y });
        }
      }
    }

    if (free.length === 0) return false;
    const choice = free[Math.floor(Math.random() * free.length)];
    sim.fruits.push({
      id: sim.nextFruitId++,
      x: choice.x,
      y: choice.y,
      kind,
      spawnedAt: now,
      expiresAt: kind === 'golden' ? now + GOLDEN_LIFETIME_MS : undefined,
    });
    return true;
  };

  // Reset board simulation whenever mode, speed, or runNonce resets
  useEffect(() => {
    const sim = simRef.current;
    const now = performance.now();
    const initialSnake = createInitialSnake();
    const modeCfg = MODE_CONFIGS[mode];
    const speedCfg = SPEED_CONFIGS[speed];

    sim.snake = initialSnake.map((p) => ({ ...p }));
    sim.prevSnake = initialSnake.map((p) => ({ ...p }));
    sim.direction = 'RIGHT';
    sim.directionQueue = [];
    sim.obstacles = getObstaclesForMode(mode);
    sim.fruits = [];
    sim.particles = [];
    sim.popups = [];
    sim.pendingGrowth = 0;
    sim.score = 0;
    sim.applesEaten = 0;
    sim.goldenEaten = 0;
    sim.combo = 1;
    sim.peakCombo = 1;
    sim.lastEatTime = 0;
    sim.lastTickTime = now;
    sim.lastFrameTime = now;
    sim.currentTickMs = speedCfg.baseTickMs;
    sim.elapsedPlayMs = 0;
    sim.blitzRemainingMs = (modeCfg.timedSeconds ?? BLITZ_DURATION_SECONDS) * 1000;
    sim.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    for (let i = 0; i < modeCfg.simultaneousApples; i++) {
      spawnFruit(sim, 'apple', now);
    }

    onHudRef.current({
      score: 0,
      length: initialSnake.length,
      combo: 1,
      comboProgress: 0,
      goldenProgress: null,
      timeRemainingSec: modeCfg.timedSeconds ?? null,
      applesEaten: 0,
    });
  }, [mode, speed, runNonce]);

  // Reset frame timestamps cleanly when unpausing so snake doesn't jump
  useEffect(() => {
    if (gameState === 'PLAYING') {
      const now = performance.now();
      const pausedDelta = now - simRef.current.lastFrameTime;
      if (pausedDelta > 0) {
        // Shift fruit expiry & combo window forward so pausing never penalizes timers
        if (simRef.current.lastEatTime > 0) {
          simRef.current.lastEatTime += pausedDelta;
        }
        for (const f of simRef.current.fruits) {
          if (f.expiresAt !== undefined) {
            f.expiresAt += pausedDelta;
          }
        }
      }
      simRef.current.lastTickTime = now;
      simRef.current.lastFrameTime = now;
    }
  }, [gameState]);

  // Expose buffered directional input handler
  useEffect(() => {
    onDirectionRef.current = (incoming: Direction) => {
      if (stateRef.current !== 'PLAYING') return;
      const sim = simRef.current;
      const lastPlanned =
        sim.directionQueue.length > 0
          ? sim.directionQueue[sim.directionQueue.length - 1]
          : sim.direction;

      if (incoming === lastPlanned || isOpposite(incoming, lastPlanned)) {
        return;
      }

      if (sim.directionQueue.length < 2) {
        sim.directionQueue.push(incoming);
        arcadeSound.playTurn();
      }
    };
    return () => {
      onDirectionRef.current = null;
    };
  }, [onDirectionRef]);

  // Main 60fps Canvas Loop (handles TITLE_MENU idle demo + PLAYING active game + rendering)
  useEffect(() => {
    let rafId = 0;

    const chooseDemoDirection = (sim: typeof simRef.current, wraps: boolean): Direction => {
      const head = sim.snake[0];
      const target = sim.fruits[0] ?? { x: 11, y: 11 };
      const allDirs: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
      const candidates = allDirs.filter(
        (d) => !isOpposite(d, sim.direction)
      );

      const obstacleSet = new Set(sim.obstacles.map((o) => `${o.x},${o.y}`));
      const bodySet = new Set(
        sim.snake.slice(0, sim.snake.length - 1).map((s) => `${s.x},${s.y}`)
      );

      let bestDir: Direction = sim.direction;
      let bestScore = Infinity;

      for (const dir of candidates) {
        const vec = DIR_VECTORS[dir];
        let nx = head.x + vec.x;
        let ny = head.y + vec.y;

        if (wraps) {
          nx = (nx + GRID_SIZE) % GRID_SIZE;
          ny = (ny + GRID_SIZE) % GRID_SIZE;
        } else if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) {
          continue;
        }

        if (obstacleSet.has(`${nx},${ny}`) || bodySet.has(`${nx},${ny}`)) {
          continue;
        }

        let dx = Math.abs(target.x - nx);
        let dy = Math.abs(target.y - ny);
        if (wraps) {
          dx = Math.min(dx, GRID_SIZE - dx);
          dy = Math.min(dy, GRID_SIZE - dy);
        }
        const dist = dx + dy + (dir === sim.direction ? -0.15 : 0);
        if (dist < bestScore) {
          bestScore = dist;
          bestDir = dir;
        }
      }
      return bestDir;
    };

    const spawnBurst = (
      sim: typeof simRef.current,
      gridX: number,
      gridY: number,
      color: string,
      count: number
    ) => {
      if (sim.reducedMotion) return;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const speedVal = 1.6 + Math.random() * 3.2;
        sim.particles.push({
          x: gridX + 0.5,
          y: gridY + 0.5,
          vx: Math.cos(angle) * speedVal,
          vy: Math.sin(angle) * speedVal,
          life: 0,
          maxLife: 0.38 + Math.random() * 0.2,
          color,
          size: 2.5 + Math.random() * 2.5,
        });
      }
    };

    const finishGame = (sim: typeof simRef.current, reason: GameOverReason) => {
      const isNewBest = sim.score > bestRef.current && sim.score > 0;
      arcadeSound.playGameOver(isNewBest);
      onGameOverRef.current({
        mode: modeRef.current,
        speed: speedRef.current,
        score: sim.score,
        applesEaten: sim.applesEaten,
        goldenEaten: sim.goldenEaten,
        maxLength: sim.snake.length,
        peakCombo: sim.peakCombo,
        durationSeconds: Math.max(1, Math.round(sim.elapsedPlayMs / 1000)),
        reason,
        isNewBest,
      });
    };

    const stepSimulation = (sim: typeof simRef.current, now: number, isDemo: boolean) => {
      const modeCfg = MODE_CONFIGS[modeRef.current];
      const speedCfg = SPEED_CONFIGS[speedRef.current];

      // Remove expired golden fruits
      sim.fruits = sim.fruits.filter(
        (f) => f.expiresAt === undefined || f.expiresAt > now
      );

      // Ensure required number of standard apples exist
      const currentStandardCount = sim.fruits.filter((f) => f.kind === 'apple').length;
      for (let i = currentStandardCount; i < modeCfg.simultaneousApples; i++) {
        spawnFruit(sim, 'apple', now);
      }

      if (isDemo) {
        sim.direction = chooseDemoDirection(sim, modeCfg.wrapsEdges);
      } else if (sim.directionQueue.length > 0) {
        sim.direction = sim.directionQueue.shift()!;
      }

      const head = sim.snake[0];
      const vec = DIR_VECTORS[sim.direction];
      let nx = head.x + vec.x;
      let ny = head.y + vec.y;

      // Perimeter wall check vs wraparound
      if (modeCfg.wrapsEdges) {
        nx = (nx + GRID_SIZE) % GRID_SIZE;
        ny = (ny + GRID_SIZE) % GRID_SIZE;
      } else if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) {
        if (isDemo) {
          // Reset demo seamlessly
          const fresh = createInitialSnake();
          sim.snake = fresh.map((p) => ({ ...p }));
          sim.prevSnake = fresh.map((p) => ({ ...p }));
          sim.direction = 'RIGHT';
          return;
        }
        finishGame(sim, 'wall');
        return;
      }

      // Obstacle collision check
      if (sim.obstacles.some((o) => o.x === nx && o.y === ny)) {
        if (isDemo) {
          const fresh = createInitialSnake();
          sim.snake = fresh.map((p) => ({ ...p }));
          sim.prevSnake = fresh.map((p) => ({ ...p }));
          sim.direction = 'RIGHT';
          return;
        }
        finishGame(sim, 'obstacle');
        return;
      }

      // Check if fruit is at (nx, ny)
      const eatenIndex = sim.fruits.findIndex((f) => f.x === nx && f.y === ny);
      const eatenFruit = eatenIndex >= 0 ? sim.fruits[eatenIndex] : null;
      const willGrow = sim.pendingGrowth > 0 || eatenFruit !== null;

      // Body collision check (vacating tail tip is safe if not growing)
      const collisionSlice = willGrow
        ? sim.snake
        : sim.snake.slice(0, sim.snake.length - 1);

      if (collisionSlice.some((seg) => seg.x === nx && seg.y === ny)) {
        if (isDemo) {
          const fresh = createInitialSnake();
          sim.snake = fresh.map((p) => ({ ...p }));
          sim.prevSnake = fresh.map((p) => ({ ...p }));
          sim.direction = 'RIGHT';
          return;
        }
        finishGame(sim, 'self');
        return;
      }

      // Advance snake positions
      sim.prevSnake = sim.snake.map((p) => ({ ...p }));
      const nextSnake = [{ x: nx, y: ny }, ...sim.snake];

      if (sim.pendingGrowth > 0) {
        sim.pendingGrowth -= 1;
      } else if (!eatenFruit) {
        nextSnake.pop();
      }

      // Cap demo snake length at 14 so background demo stays clean
      if (isDemo && nextSnake.length > 14) {
        nextSnake.pop();
      }

      sim.snake = nextSnake;

      if (eatenFruit) {
        sim.fruits.splice(eatenIndex, 1);

        if (isDemo) {
          spawnFruit(sim, 'apple', now);
          return;
        }

        const withinCombo =
          sim.lastEatTime > 0 && now - sim.lastEatTime <= COMBO_WINDOW_MS;
        sim.combo = withinCombo ? Math.min(4, sim.combo + 1) : 1;
        sim.peakCombo = Math.max(sim.peakCombo, sim.combo);
        sim.lastEatTime = now;

        const totalMultiplier =
          sim.combo * modeCfg.baseMultiplier * speedCfg.scoreMultiplier;

        if (eatenFruit.kind === 'golden') {
          const pts = Math.round(50 * totalMultiplier);
          sim.score += pts;
          sim.goldenEaten += 1;
          sim.pendingGrowth += 1; // +1 immediate +1 queued = +2 total length
          arcadeSound.playEatGolden();
          spawnBurst(sim, nx, ny, '#F59E0B', 18);

          let popupText = `+${pts}`;
          if (modeRef.current === GameMode.Blitz) {
            sim.blitzRemainingMs += 4000;
            popupText = `+${pts} · +4s`;
          }
          sim.popups.push({
            id: sim.nextPopupId++,
            x: nx + 0.5,
            y: ny,
            text: popupText,
            color: '#FBBF24',
            life: 0,
            maxLife: 0.85,
          });
        } else {
          const pts = Math.round(10 * totalMultiplier);
          sim.score += pts;
          sim.applesEaten += 1;
          sim.currentTickMs = Math.max(
            speedCfg.minTickMs,
            sim.currentTickMs - speedCfg.stepDecrementMs
          );
          arcadeSound.playEatApple(sim.combo);
          spawnBurst(sim, nx, ny, '#F43F5E', 14);

          sim.popups.push({
            id: sim.nextPopupId++,
            x: nx + 0.5,
            y: ny,
            text: sim.combo > 1 ? `+${pts} ×${sim.combo}` : `+${pts}`,
            color: '#34D399',
            life: 0,
            maxLife: 0.72,
          });

          const spawned = spawnFruit(sim, 'apple', now);
          if (!spawned && sim.fruits.length === 0) {
            finishGame(sim, 'board_cleared');
            return;
          }

          // Every 5 crimson apples, summon a timed Golden Apple if none is on board
          if (
            sim.applesEaten % 5 === 0 &&
            !sim.fruits.some((f) => f.kind === 'golden')
          ) {
            spawnFruit(sim, 'golden', now);
          }
        }
      }
    };

    const renderFrame = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }

      const sim = simRef.current;
      const dtMs = sim.lastFrameTime > 0 ? Math.min(80, now - sim.lastFrameTime) : 16.67;
      const dtSec = dtMs / 1000;
      sim.lastFrameTime = now;

      const activeState = stateRef.current;
      const modeCfg = MODE_CONFIGS[modeRef.current];

      // Update active timers & discrete ticks
      if (activeState === 'PLAYING') {
        sim.elapsedPlayMs += dtMs;

        if (modeCfg.timedSeconds !== undefined) {
          sim.blitzRemainingMs = Math.max(0, sim.blitzRemainingMs - dtMs);
          if (sim.blitzRemainingMs <= 0) {
            finishGame(sim, 'time_up');
          }
        }

        if (stateRef.current === 'PLAYING' && now - sim.lastTickTime >= sim.currentTickMs) {
          sim.lastTickTime = now;
          stepSimulation(sim, now, false);
        }
      } else if (activeState === 'TITLE_MENU') {
        const demoTickMs = 125;
        if (now - sim.lastTickTime >= demoTickMs) {
          sim.lastTickTime = now;
          stepSimulation(sim, now, true);
        }
      }

      // Update particles and floating popups
      if (activeState === 'PLAYING' || activeState === 'TITLE_MENU') {
        for (let i = sim.particles.length - 1; i >= 0; i--) {
          const p = sim.particles[i];
          p.life += dtSec;
          p.x += p.vx * dtSec;
          p.y += p.vy * dtSec;
          p.vx *= 0.92;
          p.vy *= 0.92;
          if (p.life >= p.maxLife) sim.particles.splice(i, 1);
        }

        for (let i = sim.popups.length - 1; i >= 0; i--) {
          const pop = sim.popups[i];
          pop.life += dtSec;
          pop.y -= 1.15 * dtSec;
          if (pop.life >= pop.maxLife) sim.popups.splice(i, 1);
        }
      }

      // Sync HUD ~15 times/sec or immediately on score change
      if (activeState === 'PLAYING' && now - sim.lastHudSyncTime >= 65) {
        sim.lastHudSyncTime = now;
        const comboElapsed = sim.lastEatTime > 0 ? now - sim.lastEatTime : Infinity;
        const comboProgress =
          comboElapsed < COMBO_WINDOW_MS
            ? Math.max(0, 1 - comboElapsed / COMBO_WINDOW_MS)
            : 0;
        const activeCombo = comboProgress > 0 ? sim.combo : 1;

        const golden = sim.fruits.find((f) => f.kind === 'golden');
        const goldenProgress =
          golden && golden.expiresAt
            ? Math.max(0, (golden.expiresAt - now) / GOLDEN_LIFETIME_MS)
            : null;

        onHudRef.current({
          score: sim.score,
          length: sim.snake.length,
          combo: activeCombo,
          comboProgress,
          goldenProgress,
          timeRemainingSec:
            modeCfg.timedSeconds !== undefined
              ? Math.ceil(sim.blitzRemainingMs / 1000)
              : null,
          applesEaten: sim.applesEaten,
        });
      }

      // Match canvas backing resolution to CSS size & DPR
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.max(220, Math.round(rect.width * dpr));
      const targetH = Math.max(220, Math.round(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }

      const boardPx = Math.min(targetW, targetH);
      const cell = boardPx / GRID_SIZE;

      ctx.save();
      ctx.clearRect(0, 0, targetW, targetH);

      // 1. Subtle architectural two-tone slate floor tiles
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#0E1520' : '#111A27';
          ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
        }
      }

      // Hairline grid lines
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.055)';
      ctx.lineWidth = Math.max(1, dpr * 0.75);
      ctx.beginPath();
      for (let i = 1; i < GRID_SIZE; i++) {
        const pos = Math.round(i * cell) + 0.5;
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, boardPx);
        ctx.moveTo(0, pos);
        ctx.lineTo(boardPx, pos);
      }
      ctx.stroke();

      // 2. Perimeter indicator: solid stone frame vs amber portal ticks
      const borderWidth = Math.max(2, cell * 0.14);
      if (modeCfg.wrapsEdges) {
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.48)';
        ctx.lineWidth = borderWidth;
        ctx.setLineDash([cell * 0.55, cell * 0.45]);
        ctx.strokeRect(
          borderWidth / 2,
          borderWidth / 2,
          boardPx - borderWidth,
          boardPx - borderWidth
        );
        ctx.restore();
      } else {
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = borderWidth * 1.15;
        ctx.strokeRect(
          borderWidth / 2,
          borderWidth / 2,
          boardPx - borderWidth,
          boardPx - borderWidth
        );
      }

      // 3. Carved Basalt Obstacles (Labyrinth Mode)
      for (const obs of sim.obstacles) {
        const ox = obs.x * cell;
        const oy = obs.y * cell;
        const pad = cell * 0.06;
        const size = cell - pad * 2;

        // Shadow base
        ctx.fillStyle = '#090D14';
        drawRoundedRect(ctx, ox + pad, oy + pad + cell * 0.05, size, size, cell * 0.18);
        ctx.fill();

        // Stone pillar body
        ctx.fillStyle = '#263244';
        drawRoundedRect(ctx, ox + pad, oy + pad, size, size, cell * 0.18);
        ctx.fill();

        // Top bevel highlight
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = Math.max(1, cell * 0.05);
        ctx.stroke();

        // Inner carved square motif
        const inset = cell * 0.28;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
        ctx.lineWidth = Math.max(1, cell * 0.04);
        ctx.strokeRect(ox + inset, oy + inset, cell - inset * 2, cell - inset * 2);
      }

      // 4. Fruits (Crimson Apples & Timed Golden Apples)
      for (const fruit of sim.fruits) {
        const cx = (fruit.x + 0.5) * cell;
        const cy = (fruit.y + 0.5) * cell;
        const pulse = sim.reducedMotion
          ? 1
          : 1 + Math.sin((now - fruit.spawnedAt) * 0.006) * 0.055;
        const radius = cell * 0.35 * pulse;

        if (fruit.kind === 'golden') {
          // Remaining lifetime countdown ring
          const rem = fruit.expiresAt
            ? Math.max(0, (fruit.expiresAt - now) / GOLDEN_LIFETIME_MS)
            : 1;

          ctx.beginPath();
          ctx.arc(
            cx,
            cy,
            cell * 0.45,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * rem
          );
          ctx.strokeStyle = '#FBBF24';
          ctx.lineWidth = Math.max(1.5, cell * 0.07);
          ctx.stroke();

          // Soft ambient aura
          const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, cell * 0.55);
          glow.addColorStop(0, 'rgba(251, 191, 36, 0.35)');
          glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(cx, cy, cell * 0.55, 0, Math.PI * 2);
          ctx.fill();

          // Golden apple sphere
          const bodyGrad = ctx.createRadialGradient(
            cx - radius * 0.3,
            cy - radius * 0.3,
            radius * 0.1,
            cx,
            cy,
            radius
          );
          bodyGrad.addColorStop(0, '#FEF08A');
          bodyGrad.addColorStop(0.55, '#F59E0B');
          bodyGrad.addColorStop(1, '#B45309');
          ctx.fillStyle = bodyGrad;
          ctx.beginPath();
          ctx.arc(cx, cy + cell * 0.03, radius, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Soft crimson aura
          const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, cell * 0.5);
          glow.addColorStop(0, 'rgba(244, 63, 94, 0.26)');
          glow.addColorStop(1, 'rgba(244, 63, 94, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(cx, cy, cell * 0.5, 0, Math.PI * 2);
          ctx.fill();

          // Crimson apple sphere
          const bodyGrad = ctx.createRadialGradient(
            cx - radius * 0.3,
            cy - radius * 0.3,
            radius * 0.1,
            cx,
            cy,
            radius
          );
          bodyGrad.addColorStop(0, '#FDA4AF');
          bodyGrad.addColorStop(0.45, '#F43F5E');
          bodyGrad.addColorStop(1, '#9F1239');
          ctx.fillStyle = bodyGrad;
          ctx.beginPath();
          ctx.arc(cx, cy + cell * 0.03, radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Stem & emerald leaf
        ctx.strokeStyle = '#78350F';
        ctx.lineWidth = Math.max(1.5, cell * 0.06);
        ctx.beginPath();
        ctx.moveTo(cx, cy - radius * 0.72);
        ctx.lineTo(cx + cell * 0.04, cy - radius * 1.12);
        ctx.stroke();

        ctx.fillStyle = '#34D399';
        ctx.beginPath();
        ctx.ellipse(
          cx + cell * 0.12,
          cy - radius * 0.92,
          cell * 0.11,
          cell * 0.055,
          -0.45,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      // 5. Interpolated Emerald Serpent
      const activeTickMs = activeState === 'TITLE_MENU' ? 125 : sim.currentTickMs;
      const rawAlpha =
        activeState === 'PLAYING' || activeState === 'TITLE_MENU'
          ? Math.min(1, Math.max(0, (now - sim.lastTickTime) / activeTickMs))
          : 1;
      const alpha = sim.reducedMotion ? 1 : rawAlpha;

      const interpPoints: Point[] = sim.snake.map((curr, idx) => {
        const prev = sim.prevSnake[idx] ?? curr;
        if (Math.abs(curr.x - prev.x) <= 1 && Math.abs(curr.y - prev.y) <= 1) {
          return {
            x: prev.x + (curr.x - prev.x) * alpha,
            y: prev.y + (curr.y - prev.y) * alpha,
          };
        }
        return { x: curr.x, y: curr.y };
      });

      // Draw tail-to-head so head always sits cleanly on top
      const totalSegs = interpPoints.length;
      for (let i = totalSegs - 1; i >= 0; i--) {
        const pt = interpPoints[i];
        const ratio = 1 - i / Math.max(1, totalSegs + 2);
        const segScale = i === 0 ? 0.86 : Math.max(0.56, 0.82 * (0.72 + 0.28 * ratio));
        const size = cell * segScale;
        const offset = (cell - size) / 2;
        const sx = pt.x * cell + offset;
        const sy = pt.y * cell + offset;

        // Bridge connector to previous segment so turns stay seamless
        if (i > 0) {
          const nextPt = interpPoints[i - 1];
          if (
            Math.abs(nextPt.x - pt.x) <= 1.05 &&
            Math.abs(nextPt.y - pt.y) <= 1.05
          ) {
            const midX = ((pt.x + nextPt.x) / 2) * cell + offset;
            const midY = ((pt.y + nextPt.y) / 2) * cell + offset;
            ctx.fillStyle = i <= 2 ? '#10B981' : '#059669';
            drawRoundedRect(ctx, midX, midY, size, size, size * 0.34);
            ctx.fill();
          }
        }

        // Segment body
        ctx.fillStyle = i === 0 ? '#34D399' : i % 2 === 0 ? '#10B981' : '#0D9468';
        drawRoundedRect(
          ctx,
          sx,
          sy,
          size,
          size,
          i === 0 ? size * 0.38 : size * 0.32
        );
        ctx.fill();

        // Subtle dorsal scale highlight on body segments
        if (i > 0 && i < totalSegs - 1) {
          ctx.fillStyle = 'rgba(167, 243, 208, 0.16)';
          const inner = size * 0.38;
          drawRoundedRect(
            ctx,
            sx + (size - inner) / 2,
            sy + (size - inner) / 2,
            inner,
            inner,
            inner * 0.3
          );
          ctx.fill();
        }

        // Head details: directional eyes + periodic forked crimson tongue
        if (i === 0) {
          const hcx = (pt.x + 0.5) * cell;
          const hcy = (pt.y + 0.5) * cell;
          const dirVec = DIR_VECTORS[sim.direction];
          const perp = { x: -dirVec.y, y: dirVec.x };

          // Periodic tongue flick
          const flickPhase = (now % 2400) / 2400;
          if (!sim.reducedMotion && flickPhase < 0.18) {
            const reach = cell * (0.42 + Math.sin((flickPhase / 0.18) * Math.PI) * 0.18);
            const tipX = hcx + dirVec.x * reach;
            const tipY = hcy + dirVec.y * reach;
            ctx.strokeStyle = '#FB7185';
            ctx.lineWidth = Math.max(1.4, cell * 0.055);
            ctx.beginPath();
            ctx.moveTo(hcx + dirVec.x * cell * 0.3, hcy + dirVec.y * cell * 0.3);
            ctx.lineTo(tipX, tipY);
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(
              tipX + (dirVec.x + perp.x * 0.7) * cell * 0.09,
              tipY + (dirVec.y + perp.y * 0.7) * cell * 0.09
            );
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(
              tipX + (dirVec.x - perp.x * 0.7) * cell * 0.09,
              tipY + (dirVec.y - perp.y * 0.7) * cell * 0.09
            );
            ctx.stroke();
          }

          // Eyes
          const eyeForward = cell * 0.14;
          const eyeSpread = cell * 0.19;
          const eyeRadius = Math.max(2, cell * 0.095);
          const pupilRadius = Math.max(1.1, cell * 0.05);

          for (const side of [-1, 1]) {
            const ex = hcx + dirVec.x * eyeForward + perp.x * eyeSpread * side;
            const ey = hcy + dirVec.y * eyeForward + perp.y * eyeSpread * side;

            ctx.fillStyle = '#064E3B';
            ctx.beginPath();
            ctx.arc(ex, ey, eyeRadius * 1.15, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ECFDF5';
            ctx.beginPath();
            ctx.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#0F172A';
            ctx.beginPath();
            ctx.arc(
              ex + dirVec.x * cell * 0.025,
              ey + dirVec.y * cell * 0.025,
              pupilRadius,
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
        }
      }

      // 6. Particles
      for (const p of sim.particles) {
        const alphaLife = Math.max(0, 1 - p.life / p.maxLife);
        ctx.globalAlpha = alphaLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x * cell, p.y * cell, p.size * dpr * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 7. Floating Score Popups
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.round(cell * 0.52)}px "JetBrains Mono", monospace`;
      for (const pop of sim.popups) {
        const alphaPop = Math.max(0, 1 - pop.life / pop.maxLife);
        ctx.globalAlpha = alphaPop;
        ctx.fillStyle = '#090D14';
        ctx.fillText(pop.text, pop.x * cell + 1, pop.y * cell + 1);
        ctx.fillStyle = pop.color;
        ctx.fillText(pop.text, pop.x * cell, pop.y * cell);
      }
      ctx.globalAlpha = 1;

      ctx.restore();
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Touch swipe handlers for responsive mobile & tablet play
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!touchStartRef.current || e.touches.length === 0) return;
    if (stateRef.current !== 'PLAYING') return;

    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    const threshold = 24;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    e.preventDefault();
    const dir: Direction =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? 'RIGHT'
          : 'LEFT'
        : dy > 0
          ? 'DOWN'
          : 'UP';

    onDirectionRef.current?.(dir);
    // Reset origin so continuous single-finger drag turns work without lifting finger
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-label="Ophidian 22 by 22 arcade snake playing board"
      className="block w-full h-full touch-none select-none rounded-lg"
    />
  );
}
