/**
 * Criterios de aceptación de la primera versión, con el cubo simulado:
 * abrir, elegir Precision Challenge, ingresar nombre, ver la cuenta regresiva,
 * cambiar el color del cubo, compararlo con el objetivo, confirmar con SPACE,
 * obtener una precisión calculada, guardarla, verla en el ranking y volver a
 * jugar sin recargar. También Timed Match, Speed Challenge, Physical Target y
 * la anulación por desconexión.
 */
import { expect, test, type Page } from '@playwright/test';

/** Pone el cubo simulado en la orientación que produce `rgb` (modo SIGNED). */
async function aimAt(page: Page, rgb: readonly number[]) {
  await page.evaluate((c) => {
    const w = window as unknown as {
      __RGBCUBE__: { link: { mock: { setOrientation(q: number[]): void } | null } };
    };
    // Inverso del modo SIGNED: canal = (eje + 1) · 127,5
    let x = c[0]! / 127.5 - 1, y = c[1]! / 127.5 - 1, z = c[2]! / 127.5 - 1;
    const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
    // three = (x, z, −y); rotación mínima que lleva ese vector a (0,1,0):
    // eje = a × (0,1,0) = (−a.z, 0, a.x), w = a·(0,1,0) + 1
    const a = { x, y: z, z: -y };
    const r = a.y + 1;
    const q = r < 1e-8 ? [1, 0, 0, 0] : [-a.z, 0, a.x, r];
    const n = Math.hypot(q[0]!, q[1]!, q[2]!, q[3]!);
    w.__RGBCUBE__.link.mock!.setOrientation(q.map((v) => v / n));
  }, rgb);
}

async function currentTargets(page: Page): Promise<number[][]> {
  return page.evaluate(() => {
    const w = window as unknown as { __RGBCUBE__: { game: { getState(): { session: { targets: number[][] } | null } } } };
    return w.__RGBCUBE__.game.getState().session?.targets ?? [];
  });
}

async function currentIndex(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __RGBCUBE__: { game: { getState(): { session: { index: number } | null } } } };
    return w.__RGBCUBE__.game.getState().session?.index ?? -1;
  });
}

async function startMode(page: Page, title: string, player: string) {
  await page.getByRole('button', { name: /PLAY/ }).click();
  await page.getByRole('button', { name: new RegExp(title) }).click();
  const input = page.getByLabel('Nombre del jugador');
  await input.fill(player);
  await page.keyboard.press('Enter');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('button', { name: /Estado del cubo: Simulador/ })).toBeVisible({ timeout: 10_000 });
  await page.waitForFunction(() => (window as unknown as { __RGBCUBE__?: unknown }).__RGBCUBE__ !== undefined);
});

test('Precision Challenge completo, ranking y revancha sin recargar', async ({ page }) => {
  await startMode(page, 'Precision Challenge', 'Tester');

  // Cuenta regresiva
  await expect(page.getByText('PRECISION CHALLENGE', { exact: true }).first()).toBeVisible();
  for (const n of ['2', '1']) await expect(page.locator('span.text-\\[420px\\]', { hasText: n })).toBeVisible({ timeout: 2500 });
  await expect(page.getByText('GO!')).toBeVisible({ timeout: 2500 });
  await expect(page.getByText('OBJETIVO', { exact: true })).toBeVisible({ timeout: 5000 });

  // Comparación en tiempo real: girar el cubo hasta el objetivo
  const [target] = await currentTargets(page);
  expect(target).toBeDefined();
  await aimAt(page, target!);
  await page.waitForTimeout(1200); // filtro de gravedad + 20 Hz

  await page.keyboard.press('Space');
  await expect(page.getByText(/de precisión en/)).toBeVisible({ timeout: 5000 });
  const pct = Number((await page.locator('span.tabular').filter({ hasText: '%' }).first().innerText()).replace(/[^\d.]/g, ''));
  expect(pct).toBeGreaterThan(95);
  await expect(page.getByText(/pts/)).toBeVisible();

  // Ranking
  await page.keyboard.press('l');
  await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
  await expect(page.locator('main:not([inert])').getByText('Tester', { exact: true })).toBeVisible();

  // Volver a resultados y jugar de nuevo sin recargar
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Jugar de nuevo/ }).click();
  await expect(page.getByText('GO!')).toBeVisible({ timeout: 6000 });
  await expect(page.getByText('OBJETIVO', { exact: true })).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Elegí cómo jugar' })).toBeVisible();
});

test('Timed Match: gana al sostener el umbral', async ({ page }) => {
  await startMode(page, 'Timed Match', 'Rápida');
  await expect(page.getByText('OBJETIVO', { exact: true })).toBeVisible({ timeout: 6000 });
  const [target] = await currentTargets(page);
  await aimAt(page, target!);
  await expect(page.getByText('¡Lo lograste!')).toBeVisible({ timeout: 8000 });
});

test('Speed Challenge Easy: avanza solo por los 3 colores', async ({ page }) => {
  await startMode(page, 'Easy', 'Speedy');
  await expect(page.getByText(/OBJETIVO 1\/3/)).toBeVisible({ timeout: 6000 });
  const targets = await currentTargets(page);
  expect(targets).toHaveLength(3);
  for (let i = 0; i < 3; i++) {
    await aimAt(page, targets[i]!);
    if (i < 2) await expect.poll(() => currentIndex(page), { timeout: 6000 }).toBe(i + 1);
  }
  await expect(page.getByText('¡Lo lograste!')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/3 colores · precisión/)).toBeVisible();
});

test('Physical Target: el objetivo no aparece en pantalla', async ({ page }) => {
  await startMode(page, 'Physical Target', 'Física');
  await expect(page.getByText('TU COLOR', { exact: true })).toBeVisible({ timeout: 6000 });
  await expect(page.getByText(/El objetivo está en la/)).toBeVisible();
  await expect(page.getByText('OBJETIVO', { exact: true })).toHaveCount(0);
  const [target] = await currentTargets(page);
  await aimAt(page, target!);
  await expect(page.getByText('¡Lo lograste!')).toBeVisible({ timeout: 8000 });
});

test('desconectar el cubo anula la partida', async ({ page }) => {
  await startMode(page, 'Timed Match', 'Corte');
  await expect(page.getByText('OBJETIVO', { exact: true })).toBeVisible({ timeout: 6000 });
  await page.evaluate(() => {
    const w = window as unknown as { __RGBCUBE__: { link: { disconnect(): Promise<void> } } };
    return w.__RGBCUBE__.link.disconnect();
  });
  await expect(page.getByText('Partida anulada')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('No entra al ranking')).toBeVisible();
});
