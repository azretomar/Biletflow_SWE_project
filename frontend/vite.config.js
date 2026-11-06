import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In dev, forward API calls to the Go backend so the browser sees one origin.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
