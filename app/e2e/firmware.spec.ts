/** Actualización de firmware por Bluetooth, con el cubo simulado. */
import { expect, test } from '@playwright/test';

test('instalar el firmware empaquetado: progreso, reinicio y reconexión', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Estado del cubo: Simulador/ })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('s');
  await expect(page.getByText('Firmware del cubo')).toBeVisible();
  const install = page.getByRole('button', { name: /Instalar v\d+/ });
  await expect(install).toBeEnabled({ timeout: 5000 });
  await install.click();
  await expect(page.getByText(/% · \d+ KB de \d+ KB/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/Listo: el cubo está con el firmware v3/)).toBeVisible({ timeout: 70_000 });
});
