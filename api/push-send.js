// Internal: send a push notification to a user (called from inbox.js)
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:noreply@pmtchat.app',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function redis(cmd, ...args) {
  const url = process.env.UPSTASH_KV_REST_API_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([cmd, ...args]),
  });
  const data = await res.json();
  return data.result;
}

export async function sendPushToAddress(toAddress, payload) {
  try {
    const raw = await redis('GET', `push:${toAddress.toLowerCase()}`);
    if (!raw) return; // no subscription
    const subscription = typeof raw === 'string' ? JSON.parse(raw) : raw;
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    // Subscription expired or invalid — clean it up
    if (err.statusCode === 410 || err.statusCode === 404) {
      await redis('DEL', `push:${toAddress.toLowerCase()}`);
    }
    console.error('Push error:', err.message);
  }
}

export default async function handler(req, res) {
  res.status(404).end();
}
