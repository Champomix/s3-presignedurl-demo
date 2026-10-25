import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      RUSTFS_ACCESS_KEY: 'test-access',
      RUSTFS_SECRET_KEY: 'test-secret',
      MAX_UPLOAD_SIZE: '1000',
      PRESIGN_EXPIRES_DEFAULT: '300',
    },
  },
});
