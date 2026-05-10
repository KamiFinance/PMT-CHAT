import { normalizeAddress } from './utils';

// ── Hash a message for on-chain record ─────────────────────────────────────
export async function hashMessage(
  from: string,
  to: string,
  content: string,
  timestamp: number
): Promise<string> {
  const data = `${from}:${to}:${content}:${timestamp}`;
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return '0x' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

interface BroadcastParams {
  from: string;
  to: string;
  msgHash: string;
  msgType: string;
  blockNum: number;
  // useMetaMask and metaMaskProvider kept for API compat but always ignored —
  // we never ask the wallet to sign individual messages (would popup on every send)
  useMetaMask?: boolean;
  metaMaskProvider?: unknown;
}

// ── Broadcast message via PMT chain (localStorage ledger) ─────────────────
export async function broadcastMessage(params: BroadcastParams): Promise<{ txHash: string; chain: string }> {
  const { from, to, msgHash, msgType, blockNum } = params;
  // Always use PMTchain local ledger — no wallet popup per message
  return broadcastViaPMTChain(from, to, msgHash, msgType, blockNum);
}

function broadcastViaPMTChain(
  from: string,
  to: string,
  msgHash: string,
  msgType: string,
  blockNum: number
): { txHash: string; chain: string } {
  const seed = from + to + msgHash + Date.now();
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h) ^ seed.charCodeAt(i);
  const txHash = '0x' + Math.abs(h).toString(16).padStart(64, '0');

  try {
    const ledger: object[] = JSON.parse(localStorage.getItem('pmt_chain_messages') ?? '[]');
    ledger.push({
      txHash,
      from: normalizeAddress(from),
      to: normalizeAddress(to),
      msgHash,
      msgType,
      block: blockNum,
      timestamp: Date.now(),
      confirms: 0,
    });
    if (ledger.length > 10000) ledger.splice(0, ledger.length - 10000);
    localStorage.setItem('pmt_chain_messages', JSON.stringify(ledger));

    setTimeout(() => {
      try {
        const l2: Array<{ txHash: string; confirms: number }> =
          JSON.parse(localStorage.getItem('pmt_chain_messages') ?? '[]');
        const tx = l2.find(t => t.txHash === txHash);
        if (tx) { tx.confirms = 12; localStorage.setItem('pmt_chain_messages', JSON.stringify(l2)); }
      } catch { /* ignore */ }
    }, 7000);
  } catch { /* ignore */ }

  return { txHash, chain: 'pmt' };
}
