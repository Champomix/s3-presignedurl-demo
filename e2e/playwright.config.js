import { defineConfig, devices } from '@playwright/test';

// Suppose la stack démarrée : docker compose up --build
export default defineConfig({
  testDir: '.',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
