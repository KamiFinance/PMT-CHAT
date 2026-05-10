import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Force Vite to pre-bundle WalletConnect and its entire dependency tree.
    // Without this, WalletConnect's internal dynamic imports fail on mobile
    // browsers with "importing a module script failed".
    include: [
      '@walletconnect/ethereum-provider',
      '@walletconnect/ethereum-provider > @walletconnect/universal-provider',
      '@walletconnect/ethereum-provider > @walletconnect/universal-provider > @walletconnect/core',
    ],
  },
  build: {
    // Prevent chunk splitting for WalletConnect — keeps it in a single bundle
    // chunk that mobile browsers can load without cross-origin module issues
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@walletconnect') || id.includes('walletconnect')) {
            return 'walletconnect';
          }
        },
      },
    },
  },
})
