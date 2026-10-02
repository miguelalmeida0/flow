import { expect, test } from '@playwright/test';

async function command(page, text) {
  await expect(page.getByLabel('Global Flow command')).toBeVisible();
  await page.keyboard.press('Control+k');
  const input = page.getByRole('textbox', { name: 'Tell Flow what to change' });
  await input.fill(text);
  await input.press('Enter');
  await expect(page.getByLabel('Global Flow command')).toHaveAttribute('data-last-transcript', text);
}

test('private preview identifies its commit and keeps every application space usable without providers', async ({ page }, info) => {
  const errors = [], providerRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/api\.openai\.com|api\.deepgram\.com|127\.0\.0\.1:(8765|8766|11434)|localhost:(8765|8766|11434)|\/api\/(interpret|session)/.test(request.url())) providerRequests.push(request.url());
  });
  const response = await page.goto('/');
  expect(response.status()).toBe(200);
  expect(response.headers()['x-flow-commit']).toBe(info.config.metadata.expectedCommit);
  await expect(page).toHaveTitle(/WIP preview/);
  expect(await page.evaluate(() => window.__FLOW_RUNTIME__)).toEqual({ mode: 'typed-only', inferenceEnabled: false, releaseId: `wip-${info.config.metadata.expectedCommit}` });
  await expect(page.getByRole('button', { name: 'Open Calendar', exact: true })).toBeVisible();
  await command(page, 'Open my journal');
  await expect(page.getByTestId('journal-space')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Flow Live' })).toBeDisabled();
  await page.getByRole('button', { name: 'New entry' }).click();
  const editor = page.getByRole('textbox', { name: 'Journal text' });
  await editor.fill('Private WIP verification entry.');
  await editor.blur();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Journal text' })).toHaveValue('Private WIP verification entry.');
  for (const [route, space] of [['/today', 'calendar'], ['/people', 'friends'], ['/people?view=commitments', 'people'], ['/outcomes', 'plans'], ['/inbox', 'inbox'], ['/atmosphere', 'atmosphere'], ['/memories', 'memories']]) {
    await page.goto(route);
    await expect(page.getByLabel('Global Flow command')).toBeVisible();
    await expect(page.locator('main > [data-space-shell]')).toHaveCount(1);
    await expect(page.getByTestId(`${space}-space`)).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(providerRequests).toEqual([]);
  await page.goto('/');
  await page.screenshot({ path: info.outputPath('wip-home.png'), fullPage: true });
});

test('typed capture persists with exact undo and redo on the preview origin', async ({ page }) => {
  await page.goto('/inbox');
  const captures = () => page.evaluate(() => JSON.parse(localStorage.getItem('flow.life.v3')).document.captures);
  await command(page, 'Capture Renew passport before Senegal');
  await expect.poll(async () => (await captures()).length).toBe(1);
  const created = await captures();
  await command(page, 'Undo that');
  await expect.poll(captures).toEqual([]);
  await command(page, 'Redo that');
  await expect.poll(captures).toEqual(created);
  await page.reload();
  await expect.poll(captures).toEqual(created);
});

test('mobile preview remains usable with voice explicitly unavailable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await command(page, 'Open the calendar');
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByTestId('calendar-space')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Flow Live' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('wip-mobile.png'), fullPage: true });
});
