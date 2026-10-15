import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  // libsodium (Argon2id + X25519) ships its WASM inline: ~1 MB, unavoidable for client-side crypto.
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
