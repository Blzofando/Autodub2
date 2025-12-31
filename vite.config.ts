import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path' // Keep path for path.resolve

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Fix: Replace __dirname with import.meta.url for ES module compatibility
      '@': path.resolve(path.dirname(path.fileURLToPath(import.meta.url)), './src'),
    },
  },
})