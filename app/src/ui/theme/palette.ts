/** Paleta de la interfaz (igual a las variables de index.css). */
export const PALETTE = {
  grape: '#6544D8',
  grapeDeep: '#4B2FB3',
  ocean: '#3478D4',
  coral: '#F16B63',
  sun: '#F4BE46',
  mint: '#27B88A',
  night: '#171629',
  night2: '#22203A',
  night3: '#2E2B4D',
  ink: '#0E0D1C',
} as const;

/** Fondo de cada número de la cuenta regresiva (los LEDs usan la misma secuencia). */
export const COUNTDOWN_BG = { 3: PALETTE.coral, 2: PALETTE.sun, 1: PALETTE.mint, GO: PALETTE.grape } as const;
