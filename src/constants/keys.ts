// Hardcoded default keys — users can override in Settings
// Pinata JWT is now stored as PINATA_JWT server env var — not in client code
// All uploads/downloads go through /api/pinata-upload and /api/ipfs proxies
export const DEFAULT_PINATA_JWT = ''; // kept for backward compat, unused

// AI key: read from env var at build time (set in Vercel dashboard)
// Falls back to empty — user can enter their own key in Settings
export const DEFAULT_AI_KEY: string =
  (import.meta as any).env?.VITE_ANTHROPIC_KEY ?? '';

export const AI_MODEL = 'claude-sonnet-4-5';

// WalletConnect v2 project ID
// Get yours free at https://cloud.walletconnect.com
export const WC_PROJECT_ID: string =
  (import.meta as any).env?.VITE_WC_PROJECT_ID ?? 'c2dba76201be08a0906f59f4d416129b';

export const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
] as const;
