import { expect, test } from '@playwright/test';

const S3_ORIGIN = 'http://localhost:9000/';

test('upload d\'un fichier, apparition dans la liste, uniquement des requêtes XHR', async ({ page }) => {
  const transfers = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/') || req.url().startsWith(S3_ORIGIN)) transfers.push(req);
  });

  await page.goto('/');
  await expect(page.getByRole('combobox')).toHaveValue('rustfs-local');

  const name = `e2e-${Date.now()}.txt`;
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from('hello e2e'),
  });
  await page.getByRole('button', { name: 'Uploader' }).click();

  await expect(page.locator('code.url')).toContainText(S3_ORIGIN);
  await expect(page.locator('td.mono', { hasText: name })).toBeVisible();

  expect(transfers.some((req) => req.url().startsWith(S3_ORIGIN) && req.method() === 'PUT')).toBe(true);
  for (const req of transfers) {
    expect(req.resourceType(), `${req.method()} ${req.url()}`).toBe('xhr');
  }
});
