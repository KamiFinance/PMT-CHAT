/**
 * Shared wallet provider utilities — works with any EVM wallet.
 * Priority: MetaMask (io.metamask) → any EIP-6963 wallet → window.ethereum fallback
 *
 * Supports: MetaMask, Coinbase Wallet, Rainbow, Trust Wallet, Brave Wallet,
 *           OKX Wallet, Rabby, Phantom (EVM), and any EIP-6963 compliant wallet.
 */

export interface WalletProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
}

/**
 * Discover all available EIP-6963 wallet providers.
 * Returns array of { info: { name, rdns, icon }, provider } sorted by priority.
 */
export function discoverProviders(timeoutMs = 400): Promise<Array<{ info: any; provider: WalletProvider }>> {
  return new Promise((resolve) => {
    const found: Array<{ info: any; provider: WalletProvider }> = [];
    const h = (e: any) => found.push(e.detail);
    window.addEventListener('eip6963:announceProvider', h);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', h);
      resolve(found);
    }, timeoutMs);
  });
}

/**
 * Get the best available wallet provider.
 * Prefers MetaMask, then any EIP-6963 wallet, then window.ethereum.
 */
export async function getWalletProvider(): Promise<WalletProvider | null> {
  const found = await discoverProviders();
  // Prefer MetaMask, then any other EIP-6963 wallet
  const mm = found.find((p) => p.info?.rdns === 'io.metamask');
  const best = mm ?? found[0];
  if (best?.provider) return best.provider;
  // Fallback to window.ethereum for legacy wallets
  return (window as any).ethereum ?? null;
}

/**
 * Get the wallet name from an EIP-6963 discovery.
 * Falls back to inspecting window.ethereum flags for legacy wallets.
 */
export async function getWalletName(): Promise<string> {
  const found = await discoverProviders();
  if (found.length > 0) {
    const mm = found.find((p) => p.info?.rdns === 'io.metamask');
    return (mm ?? found[0]).info?.name ?? 'Wallet';
  }
  const eth = (window as any).ethereum;
  if (!eth) return 'Wallet';
  if (eth.isMetaMask) return 'MetaMask';
  if (eth.isCoinbaseWallet) return 'Coinbase Wallet';
  if (eth.isTrust || eth.isTrustWallet) return 'Trust Wallet';
  if (eth.isBraveWallet) return 'Brave Wallet';
  if (eth.isRainbow) return 'Rainbow';
  return 'Wallet';
}

const PMT_CHAIN = {
  chainId: '0x46df2',
  chainName: 'PMTchain',
  nativeCurrency: { name: 'PM', symbol: 'PMT', decimals: 18 },
  rpcUrls: ['https://node1-ipm.dweb3.wtf'],
  blockExplorerUrls: ['https://pmtscan.com'],
};

/**
 * Ensure the connected wallet is on PMTchain.
 * Auto-adds the chain if not present (EIP-3085).
 */
export async function ensurePMTchain(eth: WalletProvider): Promise<void> {
  const current = await eth.request({ method: 'eth_chainId' });
  if (current === '0x46df2') return;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x46df2' }] });
  } catch (sw: any) {
    if (sw.code === 4902 || sw.code === -32603) {
      await eth.request({ method: 'wallet_addEthereumChain', params: [PMT_CHAIN] });
    } else if (sw.code !== 4001) {
      throw sw;
    }
  }
}
