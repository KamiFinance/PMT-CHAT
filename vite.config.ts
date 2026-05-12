import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'

const gitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return Date.now().toString(36); }
})();

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Inject git hash into index.html and sw.js at build time
    {
      name: 'inject-git-hash',
      transformIndexHtml(html) {
        return html.replace('__GIT_HASH__', gitHash);
      },
      // Also patch sw.js in the output
      writeBundle() {
        const fs = require('fs');
        const swPath = 'dist/sw.js';
        if (fs.existsSync(swPath)) {
          const sw = fs.readFileSync(swPath, 'utf8');
          fs.writeFileSync(swPath, sw.replace('__SW_VERSION__', gitHash));
        }
      }
    }
  ],
  resolve: {
    alias: {
      // @walletconnect/modal is a peer dep of @walletconnect/ethereum-provider
      // but we don't need it (showQrModal: false) — stub it out to prevent build errors
      '@walletconnect/modal': path.resolve('./src/stubs/walletconnect-modal-stub.ts'),
    },
  },
})
