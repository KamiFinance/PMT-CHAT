import { useEffect, useCallback } from 'react';
import type { Wallet, Contact, MsgsMap, Message, InboxMessage } from '../types';
import { STORAGE_KEYS } from '../types';
import { storage } from '../lib/storage';
import { getIpfsUrl } from '../lib/pinata';
import { now, rndHash, uid, normalizeAddress } from '../lib/utils';

// Extend InboxMessage locally with profile fields
interface InboxMsgWithProfile extends InboxMessage {
  fromAvatarUrl?: string | null;
  fromBio?: string;
  msgHash?: string; // reaction fallback: block hash (consistent across devices)
  // Group message fields
  groupId?: string;
  groupName?: string;
  groupAvatarUrl?: string | null;
}

interface UseInboxPollParams {
  wallet: Wallet | null;
  isDemo: boolean;
  setMsgs: React.Dispatch<React.SetStateAction<MsgsMap>>;
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  setPinnedMsgs: React.Dispatch<React.SetStateAction<Record<string, any[]>>>;
  pushNotif: (contact: Contact, text: string) => void;
}

function reconstructVoiceMsg(inboxMsg: InboxMessage): Partial<Message> {
  let audioUrl: string | null = null;
  // Prefer base64 (immediate, no network) over IPFS (requires gateway fetch)
  if ((inboxMsg as any).audioB64) {
    try {
      const b64 = (inboxMsg as any).audioB64 as string;
      // Extract full MIME type including codecs (e.g. audio/webm;codecs=opus)
      const mimeMatch = b64.match(/^data:([^;]+(?:;codecs=[^;]+)?);base64,/);
      const mime = mimeMatch ? mimeMatch[1] : 'audio/mp4';
      const dec = atob(b64.split(',')[1]);
      const bytes = new Uint8Array(dec.length);
      for (let i = 0; i < dec.length; i++) bytes[i] = dec.charCodeAt(i);
      audioUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
    } catch { /* fall through to IPFS */ }
  }
  if (!audioUrl && inboxMsg.ipfsCid) {
    audioUrl = getIpfsUrl(inboxMsg.ipfsCid);
  } else if (!audioUrl && inboxMsg.ipfsUrl) {
    audioUrl = inboxMsg.ipfsUrl;
  } else if (!audioUrl && inboxMsg.audioMsgId) {
    // Same-device fallback (audioMsgId in localStorage — only works on sender device)
    try {
      const b64 = storage.getAudio(inboxMsg.audioMsgId);
      if (b64) {
        const mime = b64.split(';')[0].split(':')[1] || 'audio/webm';
        const dec = atob(b64.split(',')[1]);
        const bytes = new Uint8Array(dec.length);
        for (let i = 0; i < dec.length; i++) bytes[i] = dec.charCodeAt(i);
        audioUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      }
    } catch { /* ignore */ }
  }
  return {
    duration: inboxMsg.duration ?? 0,
    waveform: inboxMsg.waveform ?? [],
    audioUrl,
    audioB64: (inboxMsg as any).audioB64 ?? null,
    audioMsgId: inboxMsg.audioMsgId,
    ipfsCid: inboxMsg.ipfsCid,
    ipfsUrl: inboxMsg.ipfsUrl,
    replyTo: (inboxMsg as any).replyTo ?? null,
  };
}

function reconstructMediaMsg(inboxMsg: InboxMessage): Partial<Message> {
  const ipfsCid = inboxMsg.ipfsCid ?? null;
  const rawData = inboxMsg.b64Data ?? inboxMsg.imgData ?? inboxMsg.fileData ?? null;
  let fileUrl: string | null = null;

  if (ipfsCid) {
    fileUrl = getIpfsUrl(ipfsCid);
  } else if (rawData) {
    // Store for persistence
    const mediaKey = inboxMsg.mediaMsgId ?? inboxMsg.imgMsgId;
    if (mediaKey) storage.setMedia(mediaKey, rawData);
    fileUrl = rawData;
  }

  return {
    fileUrl,
    ipfsCid: ipfsCid ?? undefined,
    b64Data: rawData ?? undefined,
    mediaMsgId: inboxMsg.mediaMsgId,
    imgMsgId: inboxMsg.imgMsgId,
    fileName: inboxMsg.fileName,
    fileSize: inboxMsg.fileSize,
    mimeType: inboxMsg.mimeType,
  };
}

export function useInboxPoll({
  wallet,
  isDemo,
  setMsgs,
  setContacts,
  setPinnedMsgs,
  pushNotif,
}: UseInboxPollParams) {
  const COLORS = ['#a78bfa', '#f59e0b', '#34d399', '#63d2ff', '#f43f5e', '#06b6d4'];
  const BGS    = ['#1e1b30', '#2a1f0a', '#0a2a1f', '#0a1f2a', '#2a0a14', '#0a2028'];

  const previewText = (msg: InboxMessage) => {
    if (msg.type === 'voice') return '🎙 Voice message';
    if (msg.type === 'image') return '🖼 Image';
    if (msg.type === 'file')  return `📄 ${msg.fileName ?? 'File'}`;
    return msg.text;
  };

  const processInbox = useCallback(() => {
    if (!wallet?.address) return;
    const inboxKey = STORAGE_KEYS.inbox(wallet.address);

    try {
      const raw = localStorage.getItem(inboxKey);
      if (!raw) return;
      const incoming: InboxMsgWithProfile[] = JSON.parse(raw);
      if (!incoming.length) return;

      // Clear inbox immediately to prevent reprocessing
      localStorage.removeItem(inboxKey);

      incoming.forEach(inboxMsg => {
        const senderAddr = normalizeAddress(inboxMsg.from ?? '');
        if (!senderAddr) return;

        // ── Reaction ──────────────────────────────────────────────────────
        if (inboxMsg.type === 'reaction') {
          setMsgs(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(addr => {
              updated[addr] = (updated[addr] ?? []).map(m => {
                // Primary match: by message ID (same across devices when relay preserved it)
                // Fallback match: by message hash (block hash, always consistent)
                const idMatch = m.id === inboxMsg.msgId;
                const hashMatch = inboxMsg.msgHash && m.hash && m.hash === inboxMsg.msgHash;
                if (!idMatch && !hashMatch) return m;
                // Merge address-keyed reactions: deep merge per-emoji per-address
                // {emoji: {addr: 1}} — each address's reaction is independent
                const existing: Record<string,any> = { ...(m.reactions ?? {}) };
                const incoming: Record<string,any> = inboxMsg.reactions ?? {};
                const merged: Record<string,any> = { ...existing };
                Object.entries(incoming).forEach(([emoji, val]) => {
                  if (typeof val === 'object' && val !== null) {
                    // New format: merge per-address
                    merged[emoji] = { ...(typeof existing[emoji]==='object'?existing[emoji]:{}), ...val };
                  } else {
                    // Old format: keep higher value
                    merged[emoji] = Math.max(Number(existing[emoji]??0), Number(val??0));
                  }
                });
                return { ...m, reactions: merged };
              });
            });
            return updated;
          });
          return;
        }

                // ── Early exit for system-only messages (never shown in chat) ──────
        if ((inboxMsg as any).type === 'pin' || (inboxMsg as any).type === 'pin_notify') {
          if ((inboxMsg as any).type === 'pin') {
            // Update pinned banner state from incoming pin sync
            const pinAddr = (inboxMsg as any).groupId
              ? normalizeAddress('group_' + (inboxMsg as any).groupId)
              : normalizeAddress(inboxMsg.from ?? '');
            const pinMsgId = (inboxMsg as any).pinMsgId;
            const pinAction = (inboxMsg as any).pinAction;
            const pinText = (inboxMsg as any).pinMsgText || '';
            const pinnedBy = (inboxMsg as any).pinnedBy || normalizeAddress(inboxMsg.from ?? '');
            setPinnedMsgs(prev => {
              const current: any[] = prev[pinAddr] || [];
              const updated = pinAction === 'unpin'
                ? current.filter(p => p.id !== pinMsgId)
                : current.some(p => p.id === pinMsgId) ? current
                  : [...current, {
                    id: pinMsgId, text: pinText, pinnedAt: Date.now(), pinnedBy,
                    // Extract original message send time from its uid
                    msgTs: (inboxMsg as any).msgTs
                      || (pinMsgId?.startsWith('u') ? parseInt(pinMsgId.slice(1)) : 0)
                      || Date.now(),
                  }].sort((a: any, b: any) =>
                    (a.msgTs || a.pinnedAt || 0) - (b.msgTs || b.pinnedAt || 0)
                  );
              return { ...prev, [pinAddr]: updated };
            });
            setMsgs(prev => ({
              ...prev,
              [pinAddr]: (prev[pinAddr] || []).map(m => m.id === pinMsgId
                ? { ...m, pinned: pinAction !== 'unpin' }
                : m
              )
            }));
          }
          // pin_notify: push was already delivered by server — nothing else to do
          return; // never show any pin messages as chat bubbles
        }

// ── Build new message ──────────────────────────────────────────────
        // Try to read sender's saved profile from localStorage
        let senderAvatarUrl: string | null = inboxMsg.fromAvatarUrl ?? null;
        let senderBio: string = inboxMsg.fromBio ?? '';
        try {
          const profileKey = `pmt_profile_${senderAddr}`;
          const savedProfile = localStorage.getItem(profileKey);
          const existing = savedProfile ? JSON.parse(savedProfile) : {};
          // Prefer incoming data (fresher) over cached data
          if (!inboxMsg.fromAvatarUrl && existing.avatarUrl) senderAvatarUrl = existing.avatarUrl;
          if (!inboxMsg.fromBio && existing.bio) senderBio = existing.bio;
          // Always update cache with latest incoming data
          if (inboxMsg.fromAvatarUrl || inboxMsg.fromBio || inboxMsg.fromName) {
            localStorage.setItem(profileKey, JSON.stringify({
              ...existing,
              ...(inboxMsg.fromAvatarUrl ? { avatarUrl: inboxMsg.fromAvatarUrl } : {}),
              ...(inboxMsg.fromBio ? { bio: inboxMsg.fromBio } : {}),
              ...(inboxMsg.fromName ? { name: inboxMsg.fromName } : {}),
              address: senderAddr,
            }));
          }
        } catch { /* ignore */ }

        const base: Message = {
          id: inboxMsg.id || uid(),
          out: false,
          type: inboxMsg.type as Message['type'],
          text: inboxMsg.text,
          time: inboxMsg.time ?? now(),
          block: 0, // will be incremented
          confirms: 3,
          hash: inboxMsg.hash ?? rndHash(),
          read: false,
          onChain: !!(inboxMsg.chain || inboxMsg.onChain),
          chain: inboxMsg.chain ?? 'pmt',
          senderName: (inboxMsg as any).fromName ?? (inboxMsg as any).senderName ?? senderAddr.slice(0, 8),
          senderAddress: senderAddr,
          senderAvatarUrl,
          senderBio,
          replyTo: (inboxMsg as any).replyTo ?? null,
          senderRole: (inboxMsg as any).senderRole ?? null,
        };

        let extra: Partial<Message> = {};
        if (inboxMsg.type === 'voice') extra = reconstructVoiceMsg(inboxMsg);
        if (inboxMsg.type === 'image' || inboxMsg.type === 'file') extra = reconstructMediaMsg(inboxMsg);
        if (inboxMsg.type === 'video') extra = {
          ipfsCid: (inboxMsg as any).ipfsCid ?? null,
          ipfsUrl: (inboxMsg as any).ipfsUrl ?? null,
          fileName: (inboxMsg as any).fileName,
          fileSize: (inboxMsg as any).fileSize,
          mimeType: (inboxMsg as any).mimeType,
        };
        if (inboxMsg.type === 'tx') extra = {
          amount: (inboxMsg as any).amount,
          coin: (inboxMsg as any).coin ?? 'PMT',
          senderName: (inboxMsg as any).senderName ?? (inboxMsg as any).fromName ?? senderAddr.slice(0, 8),
          senderAvatarUrl: (inboxMsg as any).senderAvatarUrl ?? senderAvatarUrl,
        };

        const newMsg: Message = { ...base, ...extra };


        // ── Group message routing ──────────────────────────────────────────
        if (inboxMsg.groupId) {
          const groupAddr = `group_${inboxMsg.groupId}`;
          setContacts(prev => {
            const exists = prev.find(c => c.groupId === inboxMsg.groupId || normalizeAddress(c.address) === normalizeAddress(groupAddr));
            let updated = prev;
            if (!exists) {
              // Auto-add group contact if not known yet
              const gName = inboxMsg.groupName ?? 'Group';
              updated = [{ id: inboxMsg.groupId, address: groupAddr, name: gName,
                avatar: gName.slice(0,2).toUpperCase(), avatarUrl: inboxMsg.groupAvatarUrl ?? null,
                color: '#a78bfa', bg: '#1e1b30', online: false, isGroup: true,
                groupId: inboxMsg.groupId, members: [senderAddr],
                preview: previewText(inboxMsg), unread: 1,
              } as any, ...prev];
            } else {
              // Update and bubble to top
              const target = prev.find(c => c.groupId === inboxMsg.groupId || normalizeAddress(c.address) === normalizeAddress(groupAddr));
              const updatedTarget = target ? { ...target, preview: previewText(inboxMsg), unread: (target.unread ?? 0) + 1 } : null;
              updated = updatedTarget
                ? [updatedTarget, ...prev.filter(c => c.groupId !== inboxMsg.groupId && normalizeAddress(c.address) !== normalizeAddress(groupAddr))]
                : prev;
            }
            const grp = updated.find(c => c.groupId === inboxMsg.groupId);
            if (grp) pushNotif(grp, previewText(inboxMsg));
            return updated;
          });
          setMsgs(prev => {
            const key = normalizeAddress(groupAddr);
            if ((prev[key] ?? []).some(m => m.id === newMsg.id)) return prev;
            return { ...prev, [key]: [...(prev[key] ?? []), newMsg] };
          });
          return;
        }

        // Auto-add sender as contact
        setContacts(prev => {
          const exists = prev.find(c => normalizeAddress(c.address) === senderAddr);
          let updated = prev;

          if (!exists) {
            const i = prev.length % COLORS.length;
            const name = inboxMsg.fromName ?? `${senderAddr.slice(0, 8)}...`;
            updated = [{
              id: Date.now() + Math.random(),
              address: senderAddr,
              name,
              avatar: name.slice(0, 2).toUpperCase(),
              avatarUrl: senderAvatarUrl || null,
              bio: senderBio || '',
              color: COLORS[i],
              bg: BGS[i],
              online: true,
              preview: previewText(inboxMsg),
              unread: 1,
            } as Contact, ...prev];
          } else {
            // Update and bubble to top
            const target = prev.find(c => normalizeAddress(c.address) === senderAddr);
            if (target) {
              const updatedTarget = { ...target, preview: previewText(inboxMsg), unread: (target.unread ?? 0) + 1,
                ...(senderAvatarUrl ? { avatarUrl: senderAvatarUrl } : {}),
                ...(senderBio ? { bio: senderBio } : {}),
                ...(inboxMsg.fromName ? { name: inboxMsg.fromName } : {}) };
              updated = [updatedTarget, ...prev.filter(c => normalizeAddress(c.address) !== senderAddr)];
            }
          }

          // Show notification
          const sender = updated.find(c => normalizeAddress(c.address) === senderAddr);
          if (sender) pushNotif(sender, previewText(inboxMsg));

          return updated;
        });

        setMsgs(prev => {
          // Group message: route to group conversation
          if (inboxMsg.groupId) {
            const groupAddr = normalizeAddress(`group_${inboxMsg.groupId}`);
            if ((prev[groupAddr] ?? []).some(m => m.id === newMsg.id)) return prev;
            return { ...prev, [groupAddr]: [...(prev[groupAddr] ?? []), newMsg] };
          }
          if ((prev[senderAddr] ?? []).some(m => m.id === newMsg.id)) return prev;
          return { ...prev, [senderAddr]: [...(prev[senderAddr] ?? []), newMsg] };
        });
      });
    } catch { /* ignore poll errors */ }
  }, [wallet?.address, setMsgs, setContacts, pushNotif]);

  // Also poll the cross-device API relay
  const processApiInbox = useCallback(async () => {
    if (!wallet?.address) return;
    try {
      const res = await fetch(`/api/inbox?address=${wallet.address.toLowerCase()}&t=${Date.now()}`);
      if (!res.ok) return;
      const msgs: InboxMessage[] = await res.json();
      if (!msgs.length) return;
      // Write to localStorage inbox so processInbox handles them
      const inboxKey = `pmt_inbox_${wallet.address.toLowerCase()}`;
      const existing = JSON.parse(localStorage.getItem(inboxKey) ?? '[]');
      localStorage.setItem(inboxKey, JSON.stringify([...existing, ...msgs]));
      processInbox();
    } catch { /* offline or API not configured */ }
  }, [wallet?.address, processInbox]);

  useEffect(() => {
    if (!wallet?.address || isDemo) return;
    // Same-device: listen to storage events for instant delivery
    const onStorage = (e: StorageEvent) => {
      if (e.key === `pmt_inbox_${wallet.address.toLowerCase()}`) processInbox();
    };
    window.addEventListener('storage', onStorage);
    // Polling: local every 1s, cross-device API every 3s
    const localInterval = setInterval(processInbox, 1000);
    const apiInterval = setInterval(processApiInbox, 3000);
    processApiInbox(); // immediate first check
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(localInterval);
      clearInterval(apiInterval);
    };
  }, [wallet?.address, isDemo, processInbox, processApiInbox]);
}
