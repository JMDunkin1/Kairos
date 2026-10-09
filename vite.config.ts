import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      input: { ngas: 'index.html', desktop: 'desktop.html' },
    },
  },
  plugins: [react()],
})
