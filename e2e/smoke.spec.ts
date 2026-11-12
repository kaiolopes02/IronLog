import { expect, test } from '@playwright/test';

test('accepts consent and reaches the home screen without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao IronLog' })).toBeVisible();

  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Começar' }).click();

  await expect(page.getByText('Bora treinar')).toBeVisible();
  await expect(page.getByText('Iniciar treino')).toBeVisible();
  expect(errors).toEqual([]);
});
