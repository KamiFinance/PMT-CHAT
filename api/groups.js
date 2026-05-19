// Group management API — create groups, invite links, join via link
import { rateLimit, securityHeaders } from './_security.js';
export const config = { api: { bodyParser: false } };

async function redis(cmd, ...args) {
  const url = process.env.UPSTASH_KV_REST_API_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('No Redis credentials');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([cmd, ...args]),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  return (await res.json()).result;
}

async function readBody(req) {
  let body = '';
  await new Promise(r => { req.on('data', c => body += c); req.on('end', r); });
  return JSON.parse(body);
}

export default async function handler(req, res) {
  securityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Rate limit: 60 req/min per IP
  const rl = await rateLimit(req, 'groups', 60, 60);
  if (!rl.allowed) { res.status(429).json({ error: 'Too many requests' }); return; }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, id, link } = req.query;

  // GET group info
  if (req.method === 'GET' && id) {
    const data = await redis('GET', `pmt:group:${id}`);
    if (!data) return res.status(404).json({ error: 'Group not found' });
    const grp = JSON.parse(data);
    // Ensure pinnedMsgs is always returned
    return res.json({ ...grp, pinnedMsgs: grp.pinnedMsgs || [] });
  }

  // GET invite link info
  if (req.method === 'GET' && link) {
    const data = await redis('GET', `pmt:invite:${link}`);
    if (!data) return res.status(404).json({ error: 'Invalid or expired link' });
    const inv = JSON.parse(data);
    if (inv.expiresAt && Date.now() > inv.expiresAt) return res.status(410).json({ error: 'This invite link has expired' });
    // Get group info
    const grpData = await redis('GET', `pmt:group:${inv.groupId}`);
    if (!grpData) return res.status(404).json({ error: 'Group no longer exists' });
    const grp = JSON.parse(grpData);
    return res.json({ ...inv, group: { name: grp.name, bio: grp.bio, avatarUrl: grp.avatarUrl, memberCount: (grp.members||[]).length, minPMT: inv.minPMT||0 } });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);

    // Create group
    if (action === 'create') {
      const { name, bio, avatarUrl, createdBy, isAnnouncement } = body;
      if (!name || !createdBy) return res.status(400).json({ error: 'name and createdBy required' });
      const groupId = 'g' + Date.now() + Math.random().toString(36).slice(2,6);
      const group = { id: groupId, name, bio: bio||'', avatarUrl: avatarUrl||null, members: [createdBy], createdBy, createdAt: Date.now(), inviteLinks: [], isAnnouncement: !!isAnnouncement };
      await redis('SET', `pmt:group:${groupId}`, JSON.stringify(group));
      // Index: user → groups for recovery
      await redis('SADD', `pmt:user:groups:${createdBy.toLowerCase()}`, groupId);
      return res.json({ ok: true, group });
    }

    // Create invite link
    if (action === 'createLink') {
      const { groupId, maxMembers, expiresIn, minPMT, createdBy } = body; // expiresIn in hours (0 = never)
      const data = await redis('GET', `pmt:group:${groupId}`);
      if (!data) return res.status(404).json({ error: 'Group not found' });
      const grp = JSON.parse(data);
      if (grp.createdBy?.toLowerCase() !== createdBy?.toLowerCase()) return res.status(403).json({ error: 'Only group creator can create invite links' });
      const linkId = Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,6);
      const expiresAt = expiresIn > 0 ? Date.now() + expiresIn * 3600000 : 0;
      const inv = { linkId, groupId, maxMembers: maxMembers||0, minPMT: Number(minPMT)||0, expiresAt, usedBy: [], createdAt: Date.now(), createdBy };
      await redis('SET', `pmt:invite:${linkId}`, JSON.stringify(inv));
      // Add to group's link list
      grp.inviteLinks = [...(grp.inviteLinks||[]), linkId];
      await redis('SET', `pmt:group:${grp.id}`, JSON.stringify(grp));
      return res.json({ ok: true, linkId, url: `https://${req.headers.host}/?join=${linkId}` });
    }

    // Delete invite link
    if (action === 'deleteLink') {
      const { groupId, linkId, requestedBy } = body;
      const data = await redis('GET', `pmt:group:${groupId}`);
      if (!data) return res.status(404).json({ error: 'Group not found' });
      const grp = JSON.parse(data);
      if (grp.createdBy?.toLowerCase() !== requestedBy?.toLowerCase()) return res.status(403).json({ error: 'Only group creator can delete links' });
      await redis('DEL', `pmt:invite:${linkId}`);
      grp.inviteLinks = (grp.inviteLinks||[]).filter(l => l !== linkId);
      await redis('SET', `pmt:group:${grp.id}`, JSON.stringify(grp));
      return res.json({ ok: true });
    }

    // Join group via link
    if (action === 'join') {
      const { linkId, address } = body;
      const invData = await redis('GET', `pmt:invite:${linkId}`);
      if (!invData) return res.status(404).json({ error: 'Invalid or expired link' });
      const inv = JSON.parse(invData);
      if (inv.expiresAt && Date.now() > inv.expiresAt) return res.status(410).json({ error: 'This invite link has expired' });
      const grpData = await redis('GET', `pmt:group:${inv.groupId}`);
      if (!grpData) return res.status(404).json({ error: 'Group no longer exists' });
      const grp = JSON.parse(grpData);
      if (grp.members.includes(address)) return res.json({ ok: true, group: grp, alreadyMember: true });
      if ((grp.bannedMembers || []).includes(address)) return res.status(403).json({ error: 'You have been banned from this group' });
      if (inv.maxMembers > 0 && grp.members.length >= inv.maxMembers) return res.status(403).json({ error: `This group is full (max ${inv.maxMembers} members)` });
      // Check PMT balance requirement
      if (inv.minPMT > 0) {
        try {
          const balRes = await fetch('https://node1-ipm.dweb3.wtf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [address, 'latest'], id: 1 }),
          });
          const balData = await balRes.json();
          const balPMT = balData.result ? parseInt(balData.result, 16) / 1e18 : 0;
          if (balPMT < inv.minPMT) {
            return res.status(403).json({ error: `You need at least ${inv.minPMT} PMT to join this group. Your balance: ${balPMT.toFixed(4)} PMT` });
          }
        } catch {
          return res.status(500).json({ error: 'Could not verify PMT balance. Please try again.' });
        }
      }
      grp.members.push(address);
      inv.usedBy.push(address);
      await redis('SET', `pmt:group:${grp.id}`, JSON.stringify(grp));
      await redis('SET', `pmt:invite:${linkId}`, JSON.stringify(inv));
      // Index: user → groups for recovery
      await redis('SADD', `pmt:user:groups:${address.toLowerCase()}`, grp.id);
      return res.json({ ok: true, group: grp });
    }

    // Leave group (self-initiated)
    if (action === 'leave') {
      const { groupId, address } = body;
      if (!groupId || !address) return res.status(400).json({ error: 'groupId and address required' });
      const data = await redis('GET', `pmt:group:${groupId}`);
      if (!data) return res.status(404).json({ error: 'Group not found' });
      const grp = JSON.parse(data);
      // Owner cannot leave — they must delete the group
      if (grp.createdBy?.toLowerCase() === address.toLowerCase())
        return res.status(403).json({ error: 'Owner cannot leave. Delete the group instead.' });
      // Remove from members list
      grp.members = (grp.members || []).filter(m => m.toLowerCase() !== address.toLowerCase());
      // Remove any role
      if (grp.roles) delete grp.roles[address.toLowerCase()];
      await redis('SET', `pmt:group:${groupId}`, JSON.stringify(grp));
      // Remove from user's group index
      await redis('SREM', `pmt:user:groups:${address.toLowerCase()}`, groupId);
      return res.json({ ok: true });
    }

    // Ban a member
    if (action === 'banMember') {
      const { groupId, address, requestedBy } = body;
      const data = await redis('GET', `pmt:group:${groupId}`);
      if (!data) return res.status(404).json({ error: 'Group not found' });
      const grp = JSON.parse(data);
      if (grp.createdBy?.toLowerCase() !== requestedBy?.toLowerCase()) return res.status(403).json({ error: 'Only group creator can ban members' });
      if (address?.toLowerCase() === grp.createdBy?.toLowerCase()) return res.status(400).json({ error: 'Cannot ban the group creator' });
      grp.bannedMembers = [...new Set([...(grp.bannedMembers || []), address])];
      grp.members = (grp.members || []).filter(m => m !== address);
      await redis('SET', `pmt:group:${grp.id}`, JSON.stringify(grp));
      return res.json({ ok: true, bannedMembers: grp.bannedMembers, members: grp.members });
    }

    // Unban a member
    if (action === 'unbanMember') {
      const { groupId, address, requestedBy } = body;
      const data = await redis('GET', `pmt:group:${groupId}`);
      if (!data) return res.status(404).json({ error: 'Group not found' });
      const grp = JSON.parse(data);
      if (grp.createdBy?.toLowerCase() !== requestedBy?.toLowerCase()) return res.status(403).json({ error: 'Only group creator can unban members' });
      grp.bannedMembers = (grp.bannedMembers || []).filter(m => m !== address);
      await redis('SET', `pmt:group:${grp.id}`, JSON.stringify(grp));
      return res.json({ ok: true, bannedMembers: grp.bannedMembers });
    }

    // Set member role (admin/moderator/none)
    if (action === 'setRole') {
      const { groupId, address, role, requestedBy } = body; // role: 'admin' | 'moderator' | null
      const data = await redis('GET', `pmt:group:${groupId}`);
      if (!data) return res.status(404).json({ error: 'Group not found' });
      const grp = JSON.parse(data);
      if (grp.createdBy?.toLowerCase() !== requestedBy?.toLowerCase()) return res.status(403).json({ error: 'Only group creator can assign roles' });
      if (address?.toLowerCase() === grp.createdBy?.toLowerCase()) return res.status(400).json({ error: 'Cannot change owner role' });
      grp.roles = grp.roles || {};
      if (role) grp.roles[address.toLowerCase()] = role;
      else delete grp.roles[address.toLowerCase()];
      await redis('SET', `pmt:group:${grp.id}`, JSON.stringify(grp));
      return res.json({ ok: true, roles: grp.roles });
    }

    // Get all groups the user is a member of (for backup recovery)
    if (action === 'getMyGroups') {
      const { address: userAddr } = body;
      if (!userAddr) return res.status(400).json({ error: 'address required' });
      const addr = userAddr.toLowerCase();

      // Primary: indexed lookup via user→groups set
      const groupIds = await redis('SMEMBERS', `pmt:user:groups:${addr}`);
      let groups = [];
      if (groupIds?.length) {
        const raw = await Promise.all(groupIds.map(gid => redis('GET', `pmt:group:${gid}`)));
        groups = raw.filter(Boolean).map(d => JSON.parse(d))
                    .filter(g => (g.members || []).some(m => m.toLowerCase() === addr));
      }

      // Fallback: if nothing found via index, scan all pmt:group:* keys
      // (handles groups seeded without SADD, or Redis failures at join time)
      if (!groups.length) {
        let cursor = '0';
        const allKeys = [];
        do {
          const result = await redis('SCAN', cursor, 'MATCH', 'pmt:group:*', 'COUNT', '200');
          cursor = result[0];
          allKeys.push(...(result[1] || []).filter(k => !k.includes(':history:')));
        } while (cursor !== '0');

        const allRaw = await Promise.all(allKeys.map(k => redis('GET', k)));
        groups = allRaw.filter(Boolean).map(d => JSON.parse(d))
                       .filter(g => g && (g.members || []).some(m => m.toLowerCase() === addr));

        // Repair the index so future calls use the fast path
        if (groups.length) {
          await Promise.all(groups.map(g =>
            redis('SADD', `pmt:user:groups:${addr}`, g.id)
          ));
        }
      }

      return res.json({ ok: true, groups });
    }

    // Get members + banned list
    if (action === 'getMembers') {
      const { groupId, requestedBy } = body;
      const data = await redis('GET', `pmt:group:${groupId}`);
      if (!data) return res.status(404).json({ error: 'Group not found' });
      const grp = JSON.parse(data);
      if (grp.createdBy?.toLowerCase() !== requestedBy?.toLowerCase()) return res.status(403).json({ error: 'Only group creator can view member details' });
      return res.json({ ok: true, members: grp.members || [], bannedMembers: grp.bannedMembers || [], createdBy: grp.createdBy, roles: grp.roles || {} });
    }

    // Update group
    if (action === 'update') {
      const { groupId, name, bio, avatarUrl, requestedBy } = body;
      const data = await redis('GET', `pmt:group:${groupId}`);
      if (!data) return res.status(404).json({ error: 'Group not found' });
      const grp = JSON.parse(data);
      if (grp.createdBy?.toLowerCase() !== requestedBy?.toLowerCase()) return res.status(403).json({ error: 'Only group creator can edit' });
      if (name) grp.name = name;
      if (bio !== undefined) grp.bio = bio;
      if (avatarUrl !== undefined) grp.avatarUrl = avatarUrl;
      await redis('SET', `pmt:group:${grp.id}`, JSON.stringify(grp));
      return res.json({ ok: true, group: grp });
    }

    // Get all links for a group
    if (action === 'getLinks') {
      const { groupId } = body;
      const data = await redis('GET', `pmt:group:${groupId}`);
      if (!data) return res.status(404).json({ error: 'Group not found' });
      const grp = JSON.parse(data);
      const links = await Promise.all((grp.inviteLinks||[]).map(async lid => {
        const ld = await redis('GET', `pmt:invite:${lid}`);
        return ld ? JSON.parse(ld) : null;
      }));
      return res.json({ links: links.filter(Boolean) });
    }

    // Store a group message in server-side history (fire-and-forget from client)
    if (action === 'storeMessage') {
      const { groupId, message } = body;
      if (!groupId || !message) return res.status(400).json({ error: 'groupId and message required' });
      // Strip heavy fields to keep Redis lean (images, audio stored in IPFS)
      const { b64Data, audioUrl, audioB64, fileData, imgData, uploading, _toAddr, ...lean } = message;
      const key = `pmt:group:history:${groupId}`;
      await redis('RPUSH', key, JSON.stringify(lean));
      await redis('LTRIM', key, -2000, -1); // keep last 2000 messages
      // Auto-add sender to member list if missing (fixes mismatched accounts)
      if (message.from) {
        const senderAddr = message.from.toLowerCase();
        try {
          const grpRaw = await redis('GET', `pmt:group:${groupId}`);
          if (grpRaw) {
            const grp = JSON.parse(grpRaw);
            if (!grp.members.map(m => m.toLowerCase()).includes(senderAddr)) {
              grp.members.push(senderAddr);
              await redis('SET', `pmt:group:${groupId}`, JSON.stringify(grp));
              await redis('SADD', `pmt:user:groups:${senderAddr}`, groupId);
            }
          }
        } catch { /* non-fatal */ }
      }
      return res.json({ ok: true });
    }

    // Fetch group message history (for new members)
    if (action === 'getHistory') {
      const { groupId } = body;
      const key = `pmt:group:history:${groupId}`;
      const raw = await redis('LRANGE', key, 0, -1);
      const messages = (raw || []).map(m => { try { return JSON.parse(m); } catch { return null; } }).filter(Boolean);
      return res.json({ ok: true, messages });
    }

    // Pin a message in a group (server-side, so all members see it)
    if (action === 'pinMsg') {
      const { groupId, pin, requestedBy } = body; // pin: { id, text, pinnedAt, pinnedBy, msgTs }
      const data = await redis('GET', `pmt:group:${groupId}`);
      if (!data) return res.status(404).json({ error: 'Group not found' });
      const grp = JSON.parse(data);
      const current = grp.pinnedMsgs || [];
      const exists = current.some(p => p.id === pin.id);
      if (!exists) {
        grp.pinnedMsgs = [...current, pin].sort((a, b) => (a.msgTs || 0) - (b.msgTs || 0));
        await redis('SET', `pmt:group:${groupId}`, JSON.stringify(grp));
      }
      return res.json({ ok: true, pinnedMsgs: grp.pinnedMsgs });
    }

    // Unpin a message in a group
    if (action === 'unpinMsg') {
      const { groupId, pinId, requestedBy } = body;
      const data = await redis('GET', `pmt:group:${groupId}`);
      if (!data) return res.status(404).json({ error: 'Group not found' });
      const grp = JSON.parse(data);
      grp.pinnedMsgs = (grp.pinnedMsgs || []).filter(p => p.id !== pinId);
      await redis('SET', `pmt:group:${groupId}`, JSON.stringify(grp));
      return res.json({ ok: true, pinnedMsgs: grp.pinnedMsgs });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
