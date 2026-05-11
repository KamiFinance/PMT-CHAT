// Save/remove push subscription for a user address
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { address, subscription } = req.body || {};
  if (!address) return res.status(400).json({ error: 'address required' });

  if (req.method === 'DELETE') {
    await kv.del(`push:${address.toLowerCase()}`);
    return res.json({ ok: true });
  }

  if (req.method === 'POST') {
    if (!subscription) return res.status(400).json({ error: 'subscription required' });
    await kv.set(`push:${address.toLowerCase()}`, JSON.stringify(subscription), { ex: 60 * 60 * 24 * 365 });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
