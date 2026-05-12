// PWA utilities: push notifications + install prompt

const VAPID_PUBLIC_KEY = 'BHHE8YWwQ-uGFeJeNuq8xhP5CiXZiBetGobT94SMfM-HRITxBk0vlJB-8RbatAxdoBfic9A-APAb0ztiES8pw3w';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// ── Push Notifications ──────────────────────────────────────────────────────

export async function requestPushPermission(address: string): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;
    const reg = await navigator.serviceWorker.ready;

    // Reuse existing subscription if it's still valid — only create new one if missing
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    // Always save to server (may not have been saved previously due to API bug)
    const resp = await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address.toLowerCase(), subscription }),
    });
    if (!resp.ok) throw new Error('Failed to save subscription');
    return true;
  } catch (e) {
    console.warn('Push subscription failed:', e);
    return false;
  }
}

export async function unsubscribePush(address: string) {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    await fetch('/api/push-subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
  } catch (e) { /* ignore */ }
}

export function getPushPermissionState(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// ── PWA Install Prompt ──────────────────────────────────────────────────────

let deferredPrompt: any = null;
let installListeners: Array<() => void> = [];

window.addEventListener('beforeinstallprompt', (e: any) => {
  e.preventDefault();
  deferredPrompt = e;
  installListeners.forEach(fn => fn());
});

export function onInstallAvailable(fn: () => void) {
  installListeners.push(fn);
  if (deferredPrompt) fn(); // already available
  return () => { installListeners = installListeners.filter(f => f !== fn); };
}

export function isInstallAvailable() { return !!deferredPrompt; }

export async function triggerInstallPrompt(): Promise<boolean> {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

export function isRunningAsPWA(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
}
