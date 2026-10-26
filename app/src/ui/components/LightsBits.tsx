/** Piezas de la pantalla LUCES: vista previa de efectos, vúmetro, paletas. */
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { rgbToCss } from '../../core/color/types';
import type { AudioFrame } from '../../core/audio/analyzer';
import { showPixel, type Palette, type ShowEffect } from '../../core/leds/effects';
import { hasLed } from '../../core/leds/ledModel';

const DEMO_BANDS = [210, 170, 140, 110, 90, 70, 50];

/** Miniatura animada de un efecto: una cara de 7×7 dibujada con el mismo código que el cubo. */
export function EffectPreview({ effect, palette, size = 64, face = 0 }: { effect: ShowEffect; palette: Palette; size?: number; face?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const t0 = performance.now();
    let raf = 0;
    const cell = c.width / 7;
    const draw = () => {
      const t = Math.floor(performance.now() - t0);
      // Para los efectos de audio, un "beat" simulado cada 600 ms.
      const beatAge = t % 600;
      const kick = Math.max(0, 255 - Math.floor((beatAge * 255) / 350));
      const wobble = DEMO_BANDS.map((b, i) =>
        i < 2 ? Math.max(40, kick) : Math.max(0, Math.min(255, b + Math.round(Math.sin(t / 180 + i) * 60))),
      );
      g.fillStyle = '#100f1d';
      g.fillRect(0, 0, c.width, c.height);
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 7; x++) {
          if (!hasLed(face, x, y)) continue;
          const [r, gg, b] = showPixel(effect, t, face, x, y, {
            palette,
            bands: wobble,
            beatAge,
            beatCount: Math.floor(t / 600),
            faceUp: [255, 0, 0, 0, 0, -255],
          });
          g.fillStyle = `rgb(${r},${gg},${b})`;
          g.beginPath();
          g.roundRect(x * cell + cell * 0.1, y * cell + cell * 0.1, cell * 0.8, cell * 0.8, cell * 0.22);
          g.fill();
        }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [effect, palette]);
  return <canvas ref={ref} width={size * 2} height={size * 2} style={{ width: size, height: size }} className="rounded-xl" aria-hidden />;
}

export function PaletteSwatch({ colors, size = 22 }: { colors: Palette; size?: number }) {
  return (
    <span className="flex overflow-hidden rounded-lg" style={{ height: size }}>
      {colors.map((c, i) => (
        <span key={i} style={{ background: rgbToCss(c), width: size }} />
      ))}
    </span>
  );
}

/** Vúmetro: 7 barras (graves → agudos), punto de beat y BPM. */
export function AudioMeter({ frame, palette }: { frame: AudioFrame | null; palette: Palette }) {
  const bands = frame?.bands ?? [0, 0, 0, 0, 0, 0, 0];
  return (
    <div className="flex items-end gap-6 rounded-3xl bg-night p-5">
      <div className="flex h-28 flex-1 items-end gap-2">
        {bands.map((b, i) => (
          <div key={i} className="relative flex h-full flex-1 items-end overflow-hidden rounded-lg bg-white/6">
            <div
              className="w-full rounded-lg transition-[height] duration-75"
              style={{ height: `${(b / 255) * 100}%`, background: rgbToCss(palette[i % 4]!) }}
            />
          </div>
        ))}
      </div>
      <div className="flex w-28 flex-col items-center gap-2">
        <motion.span
          key={frame?.beat ? performance.now() : 'idle'}
          className="h-12 w-12 rounded-full"
          initial={frame?.beat ? { scale: 1.4, backgroundColor: '#F4BE46' } : false}
          animate={{ scale: 1, backgroundColor: 'rgba(255,255,255,0.12)' }}
          transition={{ duration: 0.35 }}
        />
        <span className="font-display text-sm font-bold text-white/70 tabular">{frame?.bpm ? `${frame.bpm} BPM` : 'beat'}</span>
      </div>
    </div>
  );
}
