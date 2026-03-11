import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Electron loads index.html via file:// so assets must use relative paths
  base: mode === 'electron' ? './' : '/',
}))

