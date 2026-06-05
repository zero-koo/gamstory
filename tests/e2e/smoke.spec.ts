import { test, expect } from '@playwright/test';

test('home shows the new-play affordance', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('home-root')).toBeVisible();
  await expect(page.getByTestId('new-play-button')).toBeVisible();
});
