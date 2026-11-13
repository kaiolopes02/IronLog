import { expect, test } from '@playwright/test';

test('creates a 6-digit PIN, locks and unlocks the vault', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.getByText('Bora treinar')).toBeVisible();

  await page.getByRole('button', { name: 'Ajustes' }).click();
  await expect(page.getByRole('heading', { name: 'Segurança' })).toBeVisible();

  const pin = page.getByLabel('Definir PIN', { exact: true });
  const confirm = page.getByLabel('Repita o PIN');
  const submit = page.getByRole('button', { name: 'Definir PIN' });

  await pin.fill('12345');
  await confirm.fill('12345');
  await expect(submit).toBeDisabled();

  await pin.fill('123456');
  await confirm.fill('123456');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText('PIN ativo').first()).toBeVisible();

  await page.getByRole('button', { name: 'Bloquear agora' }).click();
  await expect(page.getByRole('heading', { name: 'IronLog bloqueado' })).toBeVisible();

  await page.getByLabel('PIN', { exact: true }).fill('000000');
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByText('PIN incorreto.')).toBeVisible();

  await page.getByLabel('PIN', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();

  expect(errors).toEqual([]);
});
