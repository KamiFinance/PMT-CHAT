// WalletConnect v2 helper — lazy-initialises the provider on first use
import { WC_PROJECT_ID } from '../constants/keys';

let wcProvider: any = null;

export async function getWCProvider() {
  if (wcProvider) return wcProvider;
  // Allow runtime override (set by Landing.tsx when user pastes their project ID)
  const runtimeId = (window as any).__WC_PROJECT_ID_OVERRIDE;
  const effectiveId = runtimeId || WC_PROJECT_ID;
  if (!effectiveId || effectiveId.length < 20) {
    throw new Error('WalletConnect Project ID not configured.');
  }
  const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
  wcProvider = await EthereumProvider.init({
    projectId: effectiveId,
    chains: [1],
    optionalChains: [137, 10, 42161, 56, 43114, 288478],
    showQrModal: false,   // we render our own QR
    metadata: {
      name: 'PMT-Chat',
      description: 'Decentralized encrypted messenger on PMT Chain',
      url: 'https://pmt-chat.vercel.app',
      icons: ['https://pmt-chat.vercel.app/pmt-logo.png'],
    },
  });
  return wcProvider;
}

export function resetWCProvider() {
  if (wcProvider) {
    try { wcProvider.disconnect().catch(() => {}); } catch {}
    wcProvider = null;
  }
}
