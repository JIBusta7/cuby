/**
 * Análisis de audio para las luces: de un espectro (AnalyserNode de Web
 * Audio, 0–255 por bin) a 7 bandas listas para el cubo y detección de beat.
 * Código puro (sin Web Audio) para poder probarlo con señales sintéticas.
 *
 *  - Bandas: 7 rangos logarítmicos de 40 Hz a 12 kHz, uno por columna de cada cara.
 *  - Ganancia automática por banda: cada banda se normaliza contra su propio
 *    pico reciente y su piso de ruido. Funciona igual con música fuerte o con
 *    el micrófono lejos.
 *  - Suavizado: sube rápido y baja lento, como un vúmetro. Las dos bandas
 *    graves bajan más rápido, para que cada bombo se vea como un golpe.
 *  - Beat = bombo: solo la banda del kick (40–140 Hz). Se busca el ATAQUE
 *    (cuánto subió la energía respecto de los cuadros anteriores), con un
 *    umbral que se adapta a la canción y un período refractario de 200 ms.
 *    Así un hi-hat, una voz o un bajo sostenido no cuentan como beat.
 *    El BPM sale de la mediana de los intervalos entre bombos.
 */
export const BAND_EDGES_HZ = [40, 90, 200, 450, 1000, 2200, 5000, 12000] as const;
/** Rango del bombo para detectar los golpes. */
export const KICK_HZ = [40, 140] as const;
const REFRACTORY_MS = 200;
export const BANDS = BAND_EDGES_HZ.length - 1;

export interface AudioFrame {
  /** 7 bandas 0–255, normalizadas y suavizadas. */
  readonly bands: readonly number[];
  /** Nivel general 0–255. */
  readonly level: number;
  readonly beat: boolean;
  readonly bpm: number | null;
}

export interface AnalyzerOptions {
  readonly sampleRate: number;
  /** fftSize del AnalyserNode (la cantidad de bins es la mitad). */
  readonly fftSize: number;
  /** 0,5 = menos sensible, 2 = más sensible. */
  sensitivity?: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class AudioAnalyzer {
  private readonly ranges: readonly [number, number][];
  private readonly kickRange: readonly [number, number];
  private kickPrev: number[] = [];
  private kickFloor = 255;
  private fluxHistory: { t: number; f: number }[] = [];
  private readonly peak = new Array<number>(BANDS).fill(0);
  private readonly noise = new Array<number>(BANDS).fill(255);
  private readonly out = new Array<number>(BANDS).fill(0);
  private lastBeat = -Infinity;
  private intervals: number[] = [];
  sensitivity: number;

  constructor(opts: AnalyzerOptions) {
    this.sensitivity = opts.sensitivity ?? 1;
    const binHz = opts.sampleRate / opts.fftSize;
    const bins = opts.fftSize / 2;
    this.ranges = Array.from({ length: BANDS }, (_, i) => {
      const lo = Math.max(1, Math.floor(BAND_EDGES_HZ[i]! / binHz));
      const hi = Math.min(bins - 1, Math.max(lo, Math.ceil(BAND_EDGES_HZ[i + 1]! / binHz) - 1));
      return [lo, hi] as [number, number];
    });
    const klo = Math.max(1, Math.floor(KICK_HZ[0] / binHz));
    this.kickRange = [klo, Math.max(klo, Math.min(bins - 1, Math.ceil(KICK_HZ[1] / binHz)))];
  }

  /** Procesa un cuadro del espectro (getByteFrequencyData) tomado en `now` (ms). */
  process(spectrum: ArrayLike<number>, now: number): AudioFrame {
    const raw = this.ranges.map(([lo, hi]) => {
      let sum = 0;
      for (let k = lo; k <= hi; k++) sum += spectrum[k] ?? 0;
      return sum / (hi - lo + 1);
    });

    const bands = raw.map((v, i) => {
      // Piso de ruido: baja enseguida, sube muy despacio.
      this.noise[i] = v < this.noise[i]! ? v : this.noise[i]! + 0.04;
      // Pico reciente: sube enseguida, decae en ~3 s.
      this.peak[i] = Math.max(v, this.peak[i]! * 0.996);
      const span = Math.max(24, this.peak[i]! - this.noise[i]!);
      const n = clamp01(((v - this.noise[i]!) / span) * this.sensitivity);
      const prev = this.out[i]!;
      const release = i < 2 ? 0.4 : 0.16; // graves: caen rápido, cada bombo se ve como un golpe
      this.out[i] = n > prev ? prev + (n - prev) * 0.7 : prev + (n - prev) * release;
      return Math.round(this.out[i]! * 255);
    });

    const beat = this.detectKick(spectrum, now);
    const level = Math.round(bands.reduce((a, b) => a + b, 0) / BANDS);
    return { bands, level, beat, bpm: this.bpm() };
  }

  /** Ataque del bombo: subida de energía en 40–140 Hz contra un umbral adaptativo. */
  private detectKick(spectrum: ArrayLike<number>, now: number): boolean {
    const [lo, hi] = this.kickRange;
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += spectrum[k] ?? 0;
    const kick = sum / (hi - lo + 1);
    const prevAvg = this.kickPrev.length ? this.kickPrev.reduce((a, b) => a + b, 0) / this.kickPrev.length : kick;
    this.kickPrev.push(kick);
    if (this.kickPrev.length > 3) this.kickPrev.shift();
    this.kickFloor = kick < this.kickFloor ? kick : this.kickFloor + 0.05;

    const flux = Math.max(0, kick - prevAvg);
    this.fluxHistory.push({ t: now, f: flux });
    while (this.fluxHistory.length > 0 && now - this.fluxHistory[0]!.t > 1500) this.fluxHistory.shift();
    if (this.fluxHistory.length < 10) return false;
    const mean = this.fluxHistory.reduce((a, h) => a + h.f, 0) / this.fluxHistory.length;
    const std = Math.sqrt(this.fluxHistory.reduce((a, h) => a + (h.f - mean) ** 2, 0) / this.fluxHistory.length);
    const k = 1.6 / Math.max(0.4, this.sensitivity);
    const minJump = 6 / Math.max(0.4, this.sensitivity);
    const isKick =
      flux > mean + k * std && flux > minJump && kick > this.kickFloor + 10 && now - this.lastBeat > REFRACTORY_MS;
    if (!isKick) return false;
    if (Number.isFinite(this.lastBeat)) {
      const iv = now - this.lastBeat;
      if (iv >= 250 && iv <= 1500) {
        this.intervals.push(iv);
        if (this.intervals.length > 12) this.intervals.shift();
      }
    }
    this.lastBeat = now;
    return true;
  }

  private bpm(): number | null {
    if (this.intervals.length < 4) return null;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    return Math.round(60000 / median);
  }
}
