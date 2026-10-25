import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.MEDICYCLE_API_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  }
})
