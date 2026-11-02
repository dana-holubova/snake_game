import classicBoardImg from '../assets/images/mode_classic_board_1793594260222.jpg';
import portalWrapImg from '../assets/images/mode_portal_wrap_1793594261601.jpg';
import stoneLabyrinthImg from '../assets/images/mode_stone_labyrinth_1793594261940.jpg';
import chronoBlitzImg from '../assets/images/mode_chrono_blitz_1793594264942.jpg';
import { GameMode, Point, SpeedTier } from '../types/game';

export const GRID_SIZE = 22;
export const BLITZ_DURATION_SECONDS = 90;
export const COMBO_WINDOW_MS = 4500;
export const GOLDEN_LIFETIME_MS = 8500;

export interface ModeConfig {
  id: GameMode;
  name: string;
  shortName: string;
  wallBehavior: string;
  baseMultiplier: number;
  summary: string;
  detail: string;
  image: string;
  wrapsEdges: boolean;
  hasObstacles: boolean;
  timedSeconds?: number;
  simultaneousApples: number;
}

export const MODE_CONFIGS: Record<GameMode, ModeConfig> = {
  [GameMode.Classic]: {
    id: GameMode.Classic,
    name: 'Classic Arena',
    shortName: 'Classic',
    wallBehavior: 'Solid Perimeter',
    baseMultiplier: 1.0,
    summary: 'Solid perimeter stone walls with progressive tempo scaling.',
    detail:
      'Pure arcade discipline. Collect crimson apples to extend your serpent while avoiding the outer stone boundary and your own body.',
    image: classicBoardImg,
    wrapsEdges: false,
    hasObstacles: false,
    simultaneousApples: 1,
  },
  [GameMode.Portal]: {
    id: GameMode.Portal,
    name: 'Portal Wrap',
    shortName: 'Portal',
    wallBehavior: 'Wraparound Edges',
    baseMultiplier: 1.0,
    summary: 'Seamless borderless wraparound edges for cross-board shortcuts.',
    detail:
      'Cross any boundary edge to emerge immediately on the opposite side. Use cross-arena portals to intercept expiring golden fruit.',
    image: portalWrapImg,
    wrapsEdges: true,
    hasObstacles: false,
    simultaneousApples: 1,
  },
  [GameMode.Labyrinth]: {
    id: GameMode.Labyrinth,
    name: 'Stone Labyrinth',
    shortName: 'Labyrinth',
    wallBehavior: 'Interior Pillars',
    baseMultiplier: 1.25,
    summary: 'Symmetrical basalt pillars reward precision cornering at 1.25× points.',
    detail:
      'Carved interior stone monoliths divide the arena into tactical lanes. Every catch earns a 1.25× hazard bonus.',
    image: stoneLabyrinthImg,
    wrapsEdges: false,
    hasObstacles: true,
    simultaneousApples: 1,
  },
  [GameMode.Blitz]: {
    id: GameMode.Blitz,
    name: 'Chrono Blitz',
    shortName: 'Blitz',
    wallBehavior: '90s Time Trial',
    baseMultiplier: 1.2,
    summary: '90-second sprint with dual apples, wrap edges, and +4s golden fruit.',
    detail:
      'Race a 90-second countdown with two apples active simultaneously. Golden fruit extends the clock by 4 seconds and stacks high combos.',
    image: chronoBlitzImg,
    wrapsEdges: true,
    hasObstacles: false,
    timedSeconds: BLITZ_DURATION_SECONDS,
    simultaneousApples: 2,
  },
};

export interface SpeedConfig {
  id: SpeedTier;
  label: string;
  baseTickMs: number;
  minTickMs: number;
  stepDecrementMs: number;
  scoreMultiplier: number;
  cadenceLabel: string;
}

export const SPEED_CONFIGS: Record<SpeedTier, SpeedConfig> = {
  [SpeedTier.Relaxed]: {
    id: SpeedTier.Relaxed,
    label: 'Relaxed',
    baseTickMs: 145,
    minTickMs: 92,
    stepDecrementMs: 1.1,
    scoreMultiplier: 1.0,
    cadenceLabel: '145 ms tick',
  },
  [SpeedTier.Arcade]: {
    id: SpeedTier.Arcade,
    label: 'Arcade',
    baseTickMs: 106,
    minTickMs: 66,
    stepDecrementMs: 1.0,
    scoreMultiplier: 1.25,
    cadenceLabel: '106 ms tick',
  },
  [SpeedTier.Turbo]: {
    id: SpeedTier.Turbo,
    label: 'Turbo',
    baseTickMs: 76,
    minTickMs: 48,
    stepDecrementMs: 0.75,
    scoreMultiplier: 1.6,
    cadenceLabel: '76 ms tick',
  },
};

export function getObstaclesForMode(mode: GameMode): Point[] {
  if (mode !== GameMode.Labyrinth) {
    return [];
  }

  // Symmetrical carved pillars on a 22x22 grid (indices 0..21).
  // Leaves spawn row y = 11 completely open and guarantees >= 2-tile corridors everywhere.
  return [
    // Top-left L-pillar
    { x: 4, y: 4 },
    { x: 5, y: 4 },
    { x: 4, y: 5 },
    // Top-right L-pillar
    { x: 16, y: 4 },
    { x: 17, y: 4 },
    { x: 17, y: 5 },
    // Bottom-left L-pillar
    { x: 4, y: 16 },
    { x: 4, y: 17 },
    { x: 5, y: 17 },
    // Bottom-right L-pillar
    { x: 17, y: 16 },
    { x: 16, y: 17 },
    { x: 17, y: 17 },
    // Upper central twin gates
    { x: 8, y: 7 },
    { x: 9, y: 7 },
    { x: 12, y: 7 },
    { x: 13, y: 7 },
    // Lower central twin gates
    { x: 8, y: 14 },
    { x: 9, y: 14 },
    { x: 12, y: 14 },
    { x: 13, y: 14 },
  ];
}
