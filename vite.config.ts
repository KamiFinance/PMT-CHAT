import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @walletconnect/modal is a peer dep of @walletconnect/ethereum-provider
      // but we don't need it (showQrModal: false) — stub it out to prevent build errors
      '@walletconnect/modal': path.resolve('./src/stubs/walletconnect-modal-stub.ts'),
    },
  },
})
