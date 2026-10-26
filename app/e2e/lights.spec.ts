/**
 * Modo LUCES con el cubo simulado: efectos de demo, audio en vivo (con una
 * canción sintética en lugar del micrófono) y salida limpia.
 */
import { expect, test, type Page } from '@playwright/test';
import { FAKE_MUSIC_SCRIPT } from './fakeMusic';

const led = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __RGBCUBE__: { link: { ledState(): { anim: string; effect: string; bands: number[]; beatCount: number } } } }).__RGBCUBE__.link.ledState();
    return { anim: s.anim, effect: s.effect, bands: s.bands, beatCount: s.beatCount };
  });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(FAKE_MUSIC_SCRIPT);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Estado del cubo: Simulador/ })).toBeVisible({ timeout: 10_000 });
  await page.waitForFunction(() => (window as unknown as { __RGBCUBE__?: unknown }).__RGBCUBE__ !== undefined);
});

test('Demo: elegir un efecto lo manda al cubo; las flechas lo cambian', async ({ page }) => {
  await page.getByRole('button', { name: /LUCES/ }).click();
  await expect(page.getByRole('heading', { name: 'LUCES' })).toBeVisible();
  await expect.poll(() => led(page).then((s) => s.anim)).toBe('SHOW');
  await page.getByRole('button', { name: /Fuego Llamas/ }).click();
  await expect.poll(() => led(page).then((s) => s.effect)).toBe('FIRE');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => led(page).then((s) => s.effect)).toBe('TWINKLE');
});

test('Sonido: el audio llega al cubo con bandas y beats', async ({ page }) => {
  await page.keyboard.press('m');
  await page.keyboard.press('2');
  await expect.poll(() => led(page).then((s) => s.effect)).toBe('KICK');
  await page.getByRole('button', { name: /Micrófono/ }).click();
  await expect.poll(() => led(page).then((s) => Math.max(...s.bands)), { timeout: 5000 }).toBeGreaterThan(100);
  await expect.poll(() => led(page).then((s) => s.beatCount), { timeout: 8000 }).toBeGreaterThanOrEqual(4);
  await expect(page.getByText(/\d+ BPM/)).toBeVisible({ timeout: 8000 });
});

test('Salir de LUCES apaga el audio y deja el cubo en espera', async ({ page }) => {
  await page.keyboard.press('m');
  await page.keyboard.press('2');
  await page.getByRole('button', { name: /Micrófono/ }).click();
  await expect.poll(() => led(page).then((s) => Math.max(...s.bands)), { timeout: 5000 }).toBeGreaterThan(50);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /PLAY/ })).toBeVisible();
  await expect.poll(() => led(page).then((s) => s.anim)).toBe('IDLE');
  const status = await page.evaluate(() => (window as unknown as { __RGBCUBE__: { show: { getState(): { audioStatus: string } } } }).__RGBCUBE__.show.getState().audioStatus);
  expect(status).toBe('idle');
});
