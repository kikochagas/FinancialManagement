import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    globalSetup: ['./vitest.global-setup.ts'],
    setupFiles: ['./setupTests.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    env: {
      DATABASE_URL: 'file:../test.db'
    }
  },
})
