// Internal: send a push notification to a user (called from inbox.js)
import { kv } from '@vercel/kv';
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:noreply@pmtchat.app',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export async function sendPushToAddress(toAddress, payload) {
  try {
    const raw = await kv.get(`push:${toAddress.toLowerCase()}`);
    if (!raw) return; // no subscription
    const subscription = typeof raw === 'string' ? JSON.parse(raw) : raw;
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    // Subscription expired or invalid — clean it up
    if (err.statusCode === 410 || err.statusCode === 404) {
      await kv.del(`push:${toAddress.toLowerCase()}`);
    }
    console.error('Push error:', err.message);
  }
}

export default async function handler(req, res) {
  res.status(404).end();
}
