import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';

if (fs.existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch {
    // fallback
  }
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ||
        'postgresql://restaurant_admin:restaurant_secret_dev@localhost:5432/restaurant_saas_db?schema=public',
      NODE_ENV: 'test',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
