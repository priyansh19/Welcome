import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // three.js is most of the bundle; it's one cacheable chunk, so don't warn about it.
  build: { chunkSizeWarningLimit: 1200 },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
})
