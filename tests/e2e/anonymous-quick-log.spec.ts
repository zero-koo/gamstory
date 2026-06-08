import { test, expect } from '@playwright/test';

// Helper: clear IndexedDB before each test so runs are isolated. Also
// persist the English locale to localStorage so the regex-based name
// matchers below (back / calendar) are stable across navigations — the
// app's default locale is ko-KR and URL ?lang=en only sticks while the
// query string is present.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('gamstory');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    localStorage.clear();
    localStorage.setItem('gamstory:locale', 'en');
  });
  // Reload to ensure the app reconnects to a clean DB with English locale.
  await page.reload();
});

test('anonymous user logs a play and sees it in list + calendar', async ({ page }) => {
  await expect(page.getByTestId('list-empty')).toBeVisible();

  // Open the new-play form
  await page.getByTestId('new-play-button').click();
  await expect(page).toHaveURL(/\/plays\/new/);

  // Date defaults to today; verify the input is populated
  await expect(page.getByTestId('play-form-date')).not.toHaveValue('');

  // Add a game by typing + create
  await page.getByTestId('game-picker-input').fill('Catan');
  await page.getByTestId('game-picker-create').click();

  // Add two members. After each create, wait for the corresponding winner
  // checkbox to be added — that's a synchronous signal that the form's
  // memberIds state updated, so the next fill/click won't race the
  // member-picker's useLiveQuery refresh.
  // Match only the checkbox inputs, not the surrounding <ul data-testid="play-form-winner-list">.
  const winnerCheckboxes = page.locator('input[data-testid^="play-form-winner-"]');
  await page.getByTestId('member-picker-input').fill('Alice');
  await page.getByTestId('member-picker-create').click();
  await expect(winnerCheckboxes).toHaveCount(1);
  await page.getByTestId('member-picker-input').fill('Bob');
  await page.getByTestId('member-picker-create').click();
  await expect(winnerCheckboxes).toHaveCount(2);

  // Pick one winner — first winner checkbox
  await winnerCheckboxes.first().check();

  // Description
  await page.getByTestId('play-form-description').fill('First recorded game');

  // Submit
  await page.getByTestId('play-form-submit').click();

  // Detail view
  await expect(page).toHaveURL(/\/plays\/[A-Z0-9]+/i);
  await expect(page.getByTestId('play-detail')).toBeVisible();
  await expect(page.getByText('Catan')).toBeVisible();
  await expect(page.getByText('First recorded game')).toBeVisible();

  // Back to list
  await page.getByRole('link', { name: /back/i }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('list-rows')).toBeVisible();
  // Scope to the list rows — "Catan" also appears in the game filter <select>.
  await expect(page.getByTestId('list-rows').getByText('Catan')).toBeVisible();

  // Switch to calendar and see today's badge
  await page.getByRole('link', { name: /calendar/i }).click();
  await expect(page).toHaveURL(/\/calendar/);
  const today = new Date();
  await expect(page.getByTestId(`calendar-day-${today.getDate()}-badge`)).toHaveText('1');
});
