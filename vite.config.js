import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/ar-qc/',
  server: {
    host: true,
    https: false,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        demo: resolve(__dirname, 'demo.html'),
        control: resolve(__dirname, 'control.html'),
        diag: resolve(__dirname, 'diag.html'),
      },
    },
  },
});
