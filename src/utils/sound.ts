class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      const saved = localStorage.getItem('ophidian_sound_muted');
      if (saved === 'true') {
        this.muted = true;
      }
    } catch {
      // Ignore storage access errors in restricted frames
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem('ophidian_sound_muted', String(muted));
    } catch {
      // Ignore storage errors
    }
    if (!muted) {
      this.playToggleCue();
    }
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay: number = 0,
    endFreq?: number
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  public playToggleCue(): void {
    this.playTone(523.25, 0.08, 'sine', 0.06, 0, 659.25);
  }

  public playTurn(): void {
    this.playTone(185, 0.032, 'triangle', 0.035, 0, 235);
  }

  public playStart(): void {
    this.playTone(392.0, 0.09, 'triangle', 0.08, 0);
    this.playTone(523.25, 0.14, 'triangle', 0.09, 0.07);
  }

  public playPause(paused: boolean): void {
    if (paused) {
      this.playTone(440, 0.08, 'sine', 0.06, 0);
      this.playTone(330, 0.11, 'sine', 0.06, 0.06);
    } else {
      this.playTone(330, 0.08, 'sine', 0.06, 0);
      this.playTone(440, 0.11, 'sine', 0.06, 0.06);
    }
  }

  public playEatApple(combo: number): void {
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0];
    const base = scale[Math.min(scale.length - 1, Math.max(0, combo - 1))];
    this.playTone(base, 0.09, 'triangle', 0.09, 0);
    this.playTone(base * 1.25, 0.14, 'sine', 0.08, 0.055);
  }

  public playEatGolden(): void {
    this.playTone(587.33, 0.09, 'triangle', 0.1, 0);
    this.playTone(739.99, 0.1, 'triangle', 0.1, 0.06);
    this.playTone(880.0, 0.12, 'triangle', 0.1, 0.12);
    this.playTone(1174.66, 0.22, 'sine', 0.09, 0.18);
  }

  public playGameOver(isNewBest: boolean): void {
    if (isNewBest) {
      this.playTone(523.25, 0.11, 'triangle', 0.09, 0);
      this.playTone(659.25, 0.11, 'triangle', 0.09, 0.09);
      this.playTone(783.99, 0.13, 'triangle', 0.09, 0.18);
      this.playTone(1046.5, 0.28, 'sine', 0.1, 0.27);
    } else {
      this.playTone(311.13, 0.14, 'sawtooth', 0.055, 0, 261.63);
      this.playTone(233.08, 0.26, 'triangle', 0.075, 0.12, 164.81);
    }
  }
}

export const arcadeSound = new SoundSynthesizer();
