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
  define: {
    '__GIT_HASH__': JSON.stringify(gitHash),
  },
  plugins: [react()],
  resolve: {
    alias: {
      // @walletconnect/modal is a peer dep of @walletconnect/ethereum-provider
      // but we don't need it (showQrModal: false) — stub it out to prevent build errors
      '@walletconnect/modal': path.resolve('./src/stubs/walletconnect-modal-stub.ts'),
    },
  },
})
