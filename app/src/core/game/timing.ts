/**
 * Tiempos de la cuenta regresiva, compartidos con el firmware (anim.cpp).
 * 3, 2, 1 duran BEAT_MS cada uno; después "GO" dura GO_MS. El juego y el
 * cronómetro arrancan al terminar GO, que es cuando el cubo vuelve a mostrar el
 * color del jugador.
 */
export const BEAT_MS = 1000;
export const GO_MS = 500;
export const COUNTDOWN_MS = 3 * BEAT_MS + GO_MS;

export type CountdownStep = 3 | 2 | 1 | 'GO' | null;

/** Qué se muestra `elapsed` ms después de empezar la cuenta. null = terminó. */
export function countdownStep(elapsed: number): CountdownStep {
  if (elapsed < 0) return 3;
  if (elapsed < BEAT_MS) return 3;
  if (elapsed < 2 * BEAT_MS) return 2;
  if (elapsed < 3 * BEAT_MS) return 1;
  if (elapsed < COUNTDOWN_MS) return 'GO';
  return null;
}
