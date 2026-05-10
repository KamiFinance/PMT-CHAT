// All Pinata operations go through server-side API proxies.
// The JWT never appears in client-side code.

export function getIpfsUrl(cid: string): string {
  // Route through our server proxy — adds auth header for private Pinata pins
  return `/api/ipfs?cid=${encodeURIComponent(cid)}`;
}

export async function uploadToPinata(file: File | Blob, fileName: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file, fileName);
  formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
  formData.append('pinataMetadata', JSON.stringify({ name: fileName }));

  const res = await fetch('/api/pinata-upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload failed: ${res.status} ${err.slice(0, 100)}`);
  }

  const data = await res.json();
  return data.IpfsHash as string;
}

export async function fetchFromIpfs(cid: string): Promise<Response> {
  const res = await fetch(getIpfsUrl(cid), { signal: AbortSignal.timeout(8000) });
  if (res.ok) return res;
  throw new Error(`Failed to fetch from IPFS: ${cid}`);
}

export function isConfigured(): boolean {
  return true; // Server handles auth
}
