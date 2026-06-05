import { test, expect } from '@playwright/test';

test('home renders the boot message', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('home-root')).toBeVisible();
  await expect(page.getByTestId('home-boot-msg')).toBeVisible();
});
