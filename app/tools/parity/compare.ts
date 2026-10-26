import { readFileSync } from 'node:fs';
import { advanceLedState, applyLedCommand, hasLed, INITIAL_LED_STATE, ledLinkLost, pixelColor, type LedState } from '../../src/core/leds/ledModel';
import { SHOW_EFFECTS } from '../../src/core/leds/effects';
import type { RGB } from '../../src/core/color/types';

const MODES = ['PLAY', 'TARGET', 'IDLE', 'COUNT', 'WIN', 'FAIL', 'SOLID', 'LIGHT', 'LINK_LOST', 'SHOW'];
const fw = readFileSync(process.argv[2]!, "utf8").trim().split('\n').map((l) => JSON.parse(l));
const player: RGB = [200, 90, 40];
let s: LedState = INITIAL_LED_STATE;
const scenes: { name: string; now: number; top: number; faceUp?: number[]; pre?: () => void; state: () => LedState }[] = [];
const at = (name: string, now: number, top = 0, faceUp?: number[], pre?: () => void) =>
  scenes.push({ name, now, top, faceUp, pre, state: () => (s = advanceLedState(s, now)) });

s = applyLedCommand(s, { type: 'ANIM', anim: 'IDLE' }, 1000);
const run: (() => void)[] = [];
for (const t of [0, 333, 5000]) at(`IDLE+${t}`, 1000 + t);
run.push(() => (s = applyLedCommand(s, { type: 'ANIM', anim: 'COUNT' }, 10000)));
for (const t of [0, 400, 999, 1000, 1700, 2500, 3000, 3250, 3499, 3500, 3600]) at(`COUNT+${t}`, 10000 + t);
run.push(() => (s = applyLedCommand(s, { type: 'ANIM', anim: 'WIN' }, 20000)));
for (const t of [0, 95, 1234]) at(`WIN+${t}`, 20000 + t);
run.push(() => (s = applyLedCommand(s, { type: 'ANIM', anim: 'FAIL' }, 30000)));
for (const t of [0, 125, 250, 1600]) at(`FAIL+${t}`, 30000 + t);
run.push(() => {
  s = applyLedCommand(s, { type: 'TARGET', rgb: [10, 220, 130] }, 40000);
  s = applyLedCommand(s, { type: 'ANIM', anim: 'PLAY' }, 40000);
});
at('TARGET-top2', 40000, 2);
at('TARGET-top5', 40010, 5);
run.push(() => (s = applyLedCommand(s, { type: 'TARGET', rgb: null }, 40020)));
at('PLAY', 40020);
run.push(() => (s = applyLedCommand(s, { type: 'LIGHT', face: 4 }, 50000)));
at('LIGHT4', 50000);
run.push(() => (s = ledLinkLost(s, 60000)));
at('LINK+0', 60000);
at('LINK+250', 60250);
at('LINK+1300', 61300);

// Modo LUCES (mismo orden que dump.cpp)
const FU = [255, 120, 0, -60, -200, -255];
SHOW_EFFECTS.forEach((effect, e) => {
  const T = 70000 + e * 10000;
  [100, 160, 250, 1234, 5000].forEach((dt, k) =>
    at(`FX${e}+${dt}`, T + dt, 0, FU, k === 0
      ? () => {
          if (e === 0) s = applyLedCommand(s, { type: 'PAL', palette: [[10, 200, 30], [250, 20, 90], [40, 40, 255], [255, 255, 0]] }, T);
          s = applyLedCommand(s, { type: 'SHOW', effect }, T);
          s = applyLedCommand(s, { type: 'AUDIO', bands: [200, 150, 100, 80, 60, 40, 20], beat: true }, T + 100);
        }
      : undefined),
  );
});

// Ejecutar escenarios intercalando los comandos donde corresponde (mismo orden que el C++).
const cmdBefore: Record<string, number> = { 'COUNT+0': 0, 'WIN+0': 1, 'FAIL+0': 2, 'TARGET-top2': 3, PLAY: 4, LIGHT4: 5, 'LINK+0': 6 };
let maxDiff = 0, compared = 0, mismatches: string[] = [];
scenes.forEach((sc, i) => {
  if (sc.name in cmdBefore) run[cmdBefore[sc.name]!]!();
  sc.pre?.();
  const st = sc.state();
  const f = fw[i];
  if (f.name !== sc.name) throw new Error(`orden distinto: ${f.name} vs ${sc.name}`);
  if (MODES[f.mode] !== st.anim) mismatches.push(`${sc.name}: modo fw=${MODES[f.mode]} web=${st.anim}`);
  let k = 0;
  for (let face = 0; face < 6; face++)
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++, k++) {
        const fp = f.px[k];
        if (!hasLed(face, x, y)) { if (fp !== null) mismatches.push(`${sc.name}: agujero distinto en cara ${face + 1}`); continue; }
        if (fp === null) { mismatches.push(`${sc.name}: fw sin LED en cara ${face + 1} (${x},${y})`); continue; }
        const wp = pixelColor(st, sc.now, face, x, y, { player, topFace: sc.top, faceUp: sc.faceUp ?? [255, 0, 0, 0, 0, -255] });
        const d = Math.max(...wp.map((v, j) => Math.abs(v - fp[j])));
        compared++;
        if (d > maxDiff) maxDiff = d;
        if (d > 1) mismatches.push(`${sc.name}: cara ${face + 1} (${x},${y}) fw=${fp} web=${wp}`);
      }
});
console.log(`escenarios: ${scenes.length}, píxeles comparados: ${compared}, diferencia máxima por canal: ${maxDiff}`);
console.log(mismatches.length ? `DIFERENCIAS (${mismatches.length}):\n` + mismatches.slice(0, 15).join('\n') : 'firmware y web coinciden');
