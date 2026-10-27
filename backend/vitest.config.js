import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      RUSTFS_ACCESS_KEY: 'test-access',
      RUSTFS_SECRET_KEY: 'test-secret',
      MINIO_TLS_ENDPOINT: 'https://minio.test:9000',
      MINIO_TLS_REGION: 'us-east-1',
      MINIO_TLS_BUCKET: 'test-bucket',
      MINIO_TLS_ACCESS_KEY: 'minio-access',
      MINIO_TLS_SECRET_KEY: 'minio-secret',
      MAX_UPLOAD_SIZE: '1000',
      PRESIGN_EXPIRES_DEFAULT: '300',
    },
  },
});
