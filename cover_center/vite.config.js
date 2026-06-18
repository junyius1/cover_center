import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    proxy: {
      '/webdav': {
        target: 'http://192.168.0.122:5005',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
  preview: {
    proxy: {
      '/webdav': {
        target: 'http://192.168.0.122:5005',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
})
