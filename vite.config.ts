import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Served at winder.works/vigil/. Building into dist/vigil/ makes the
  // standalone Vercel deployment answer on the same path, so winder.works can
  // proxy /vigil/* straight through.
  base: '/vigil/',
  build: {
    outDir: 'dist/vigil',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
