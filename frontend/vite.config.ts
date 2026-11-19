import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Desktop app: one bundle loaded from disk, so chunk size doesn't matter.
  build: {chunkSizeWarningLimit: 2000},
})
