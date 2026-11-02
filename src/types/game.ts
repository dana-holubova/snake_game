export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export enum GameMode {
  Classic = 'classic',
  Portal = 'portal',
  Labyrinth = 'labyrinth',
  Blitz = 'blitz',
}

export enum SpeedTier {
  Relaxed = 'relaxed',
  Arcade = 'arcade',
  Turbo = 'turbo',
}

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Point {
  x: number;
  y: number;
}

export interface Fruit {
  id: number;
  x: number;
  y: number;
  kind: 'apple' | 'golden';
  spawnedAt: number;
  expiresAt?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface FloatingPopup {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export type GameOverReason =
  | 'wall'
  | 'self'
  | 'obstacle'
  | 'time_up'
  | 'board_cleared';

export interface RunSummary {
  mode: GameMode;
  speed: SpeedTier;
  score: number;
  applesEaten: number;
  goldenEaten: number;
  maxLength: number;
  peakCombo: number;
  durationSeconds: number;
  reason: GameOverReason;
  isNewBest: boolean;
}

export interface MatchRecord {
  id: string;
  mode: GameMode;
  speed: SpeedTier;
  score: number;
  applesEaten: number;
  goldenEaten: number;
  maxLength: number;
  peakCombo: number;
  durationSeconds: number;
  reason: GameOverReason;
  playedAt: string;
}
