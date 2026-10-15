import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  imports: false,
  manifest: {
    name: 'Secure Vault',
    description: 'Zero-knowledge password manager: autofill, capture and team sharing.',
    permissions: ['storage', 'activeTab', 'scripting', 'alarms', 'idle', 'offscreen', 'clipboardWrite'],
    host_permissions: ['<all_urls>'],
    // libsodium (Argon2id / XChaCha20 / X25519) is WebAssembly.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    action: { default_title: 'Secure Vault (Ctrl+Shift+L)' },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Ctrl+Shift+L', mac: 'Command+Shift+L' },
        description: 'Open vault quick search',
      },
    },
  },
  zip: { artifactTemplate: 'secure-vault-{{version}}-{{browser}}.zip' },
  vite: () => ({
    plugins: [tailwindcss()],
    build: { chunkSizeWarningLimit: 2000 },
  }),
});
