// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react';
import ProfilePic from '../ui/ProfilePic';

const EXPIRY_OPTIONS = [
  { label: 'Never', value: 0 },
  { label: '1 hour', value: 1 },
  { label: '6 hours', value: 6 },
  { label: '24 hours', value: 24 },
  { label: '7 days', value: 168 },
  { label: '30 days', value: 720 },
];

function formatExpiry(expiresAt) {
  if (!expiresAt) return 'Never expires';
  const diff = expiresAt - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `Expires in ${d}d ${h % 24}h`;
  const m = Math.floor((diff % 3600000) / 60000);
  return `Expires in ${h}h ${m}m`;
}

export default function GroupChatModal({ contacts, onClose, onCreate, myAddress, existingGroup, onRolesUpdated }) {


  // If existingGroup passed, start in manage mode (links tab)
  const [tab, setTab] = useState(existingGroup ? 'links' : 'info');
  const [name, setName] = useState(existingGroup?.name || '');
  const [bio, setBio] = useState(existingGroup?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(existingGroup?.avatarUrl || null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [group, setGroup] = useState(existingGroup ? {
    id: existingGroup.groupId || existingGroup.id?.replace('g',''),
    ...existingGroup
  } : null); // created group from server

  // Invite links state
  const [links, setLinks] = useState([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [newMaxMembers, setNewMaxMembers] = useState(0);
  const [newExpiry, setNewExpiry] = useState(0);
  const [newMinPMT, setNewMinPMT] = useState(0);
  const [creatingLink, setCreatingLink] = useState(false);
  const [copied, setCopied] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [bannedMembers, setBannedMembers] = useState<string[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [banningAddr, setBanningAddr] = useState('');
  const [memberProfiles, setMemberProfiles] = useState<Record<string,{name:string,avatarUrl:string|null,color:string,bg:string}>>({});
  const [groupRoles, setGroupRoles] = useState<Record<string,string>>({});
  const [isAnnouncement, setIsAnnouncement] = useState(existingGroup?.isAnnouncement || false);

  const fileRef = useRef(null);

  // Auto-load links when managing existing group
  const getProfile = (addr: string) => {
    // Priority: contacts list > localStorage profile > truncated address
    const ct = (contacts || []).find((c: any) => c.address?.toLowerCase() === addr.toLowerCase());
    if (ct?.name) return { name: ct.name, avatarUrl: ct.avatarUrl || null, color: ct.color || 'var(--accent)', bg: ct.bg || '#1e2438' };
    try {
      const stored = localStorage.getItem('pmt_profile_' + addr.toLowerCase());
      if (stored) {
        const p = JSON.parse(stored);
        if (p?.name) return { name: p.name, avatarUrl: p.avatarUrl || null, color: ct?.color || 'var(--accent2)', bg: ct?.bg || '#1e1b30' };
      }
    } catch {}
    return { name: addr.slice(0,8)+'...'+addr.slice(-4), avatarUrl: null, color: 'var(--accent2)', bg: '#1e1b30' };
  };

  const loadMembers = async (gId: string) => {
    setLoadingMembers(true);
    try {
      const r = await fetch('/api/groups?action=getMembers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: gId, requestedBy: myAddress }),
      });
      const d = await r.json();
      if (d.ok) {
        const allAddrs = [...(d.members || []), ...(d.bannedMembers || [])];
        const profiles: Record<string,any> = {};
        allAddrs.forEach((addr: string) => { profiles[addr.toLowerCase()] = getProfile(addr); });
        setMemberProfiles(profiles);
        setMembers(d.members || []);
        setBannedMembers(d.bannedMembers || []);
        setGroupRoles(d.roles || {});
      }
    } catch {} finally { setLoadingMembers(false); }
  };

  React.useEffect(() => {
    if (existingGroup) {
      const gid = existingGroup.groupId || existingGroup.id;
      loadLinks(gid);
    }
  }, []);

  // Handle avatar selection
  const handleAvatar = (file) => {
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const SIZE = 128;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, SIZE, SIZE);
      setAvatarUrl(canvas.toDataURL('image/jpeg', 0.8));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // Create group on server
  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true); setErr('');
    try {
      const r = await fetch('/api/groups?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), bio, avatarUrl, createdBy: myAddress, isAnnouncement }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to create group');
      const g = data.group;
      setGroup(g);
      // Build contact object for local state
      const contact = {
        id: g.id,
        address: 'group_' + g.id,
        name: g.name,
        bio: g.bio,
        avatarUrl: g.avatarUrl,
        avatar: g.name.slice(0, 2).toUpperCase(),
        color: '#a78bfa',
        bg: '#1e1b30',
        online: false,
        isGroup: true,
        members: g.members,
        groupId: g.id,
        createdBy: g.createdBy,
        isAnnouncement: g.isAnnouncement || false,
        preview: 'Group created',
        unread: 0,
      };
      onCreate(contact);
      setTab('links');
      loadLinks(g.id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const loadLinks = async (gid) => {
    setLoadingLinks(true);
    try {
      const r = await fetch('/api/groups?action=getLinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: gid }),
      });
      const data = await r.json();
      setLinks(data.links || []);
    } catch { /* silent */ }
    finally { setLoadingLinks(false); }
  };

  const createLink = async () => {
    if (!group) return;
    setCreatingLink(true);
    try {
      const r = await fetch('/api/groups?action=createLink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: group.id, maxMembers: Number(newMaxMembers), expiresIn: Number(newExpiry), minPMT: Number(newMinPMT), createdBy: myAddress }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await loadLinks(group.id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setCreatingLink(false);
    }
  };

  const deleteLink = async (linkId) => {
    if (!group) return;
    try {
      await fetch('/api/groups?action=deleteLink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: group.id, linkId, requestedBy: myAddress }),
      });
      setLinks(p => p.filter(l => l.linkId !== linkId));
    } catch { /* silent */ }
  };

  const copyLink = (linkId) => {
    const url = `https://pmt-chat3.vercel.app/?join=${linkId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(linkId);
      setTimeout(() => setCopied(''), 2500);
    });
  };

  const inp = { width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 13px', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: 13.5, outline: 'none' };
  const label = { fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '1px', marginBottom: 5 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 18, padding: 28, width: 440, maxWidth: '95vw', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '90vh', overflow: 'hidden', animation: 'slideUp .25s ease' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{group ? group.name : 'New Group'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {/* Tabs (only after group created) */}
        {group && (
          <div style={{ display: 'flex', gap: 6 }}>
            {['info', 'links', 'members'].map(t => (
              <button key={t} onClick={() => { setTab(t); if (t === 'members' && group) loadMembers(group.id || group.groupId); }}
                style={{ flex: 1, padding: '7px', background: tab === t ? 'var(--accent)' : 'var(--surface)', border: `1px solid ${tab === t ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, color: tab === t ? '#0a0c14' : 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
                {t === 'links' ? '🔗 Invite Links' : t === 'members' ? '👥 Members' : '📋 Group Info'}
              </button>
            ))}
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14, overscrollBehavior: 'contain' }}>

          {/* INFO TAB */}
          {tab === 'info' && (
            <>
              {/* Avatar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
                  {avatarUrl
                    ? <img src={avatarUrl} style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
                    : <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#1e1b30', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: 'var(--muted)' }}>📷</div>
                  }
                  <div style={{ position: 'absolute', bottom: 2, right: 2, background: 'var(--accent)', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>✎</div>
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleAvatar(e.target.files[0])} />
                <div style={{ flex: 1 }}>
                  <div style={label}>GROUP PICTURE</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Click the circle to upload a group photo</div>
                </div>
              </div>

              {/* Name */}
              <div>
                <div style={label}>GROUP NAME *</div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. DeFi Team" style={inp} disabled={!!group} />
              </div>

              {/* Bio */}
              <div>
                <div style={label}>BIO (optional)</div>
                <textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 200))} placeholder="What is this group about?" rows={3}
                  style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} disabled={!!group} />
                <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right', marginTop: 2 }}>{bio.length}/200</div>
              </div>

              {/* Announcement group toggle */}
              {!group && (
                <div onClick={() => setIsAnnouncement(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: isAnnouncement ? 'rgba(250,255,99,.06)' : 'var(--surface)',
                    border: `1px solid ${isAnnouncement ? 'rgba(250,255,99,.3)' : 'var(--border)'}`,
                    borderRadius: 10, padding: '12px 14px', cursor: 'pointer', userSelect: 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      📢 Announcement Group
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                      Only the group owner can send messages. Members can read and react.
                    </div>
                  </div>
                  <div style={{ width: 40, height: 22, borderRadius: 11, background: isAnnouncement ? 'var(--accent)' : 'var(--surface2)',
                    border: '1px solid var(--border)', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
                    <div style={{ position: 'absolute', top: 2, left: isAnnouncement ? 20 : 2, width: 16, height: 16,
                      borderRadius: '50%', background: isAnnouncement ? '#0a0c14' : 'var(--muted)', transition: 'left .2s' }}/>
                  </div>
                </div>
              )}

              {/* Show badge on existing announcement groups */}
              {group && existingGroup?.isAnnouncement && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(250,255,99,.06)',
                  border: '1px solid rgba(250,255,99,.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--accent)' }}>
                  📢 This is an announcement group — only the owner can send messages
                </div>
              )}

              {err && <div style={{ background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: 'var(--danger)' }}>{err}</div>}

              {!group && (
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button onClick={onClose} style={{ flex: 1, padding: 10, background: 'transparent', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text2)', fontSize: 13.5, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleCreate} disabled={!name.trim() || saving}
                    style={{ flex: 2, padding: 10, background: 'var(--accent)', border: 'none', borderRadius: 9, color: '#0a0c14', fontWeight: 600, fontSize: 13.5, cursor: !name.trim() || saving ? 'default' : 'pointer', opacity: !name.trim() || saving ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {saving ? <><span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,.3)', borderTopColor: '#0a0c14', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />Creating...</> : 'Create Group →'}
                  </button>
                </div>
              )}

              {group && (
                <div style={{ background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.2)', borderRadius: 9, padding: '10px 14px', fontSize: 13, color: 'var(--accent3)' }}>
                  ✓ Group created! Go to <b>Invite Links</b> tab to add members.
                </div>
              )}
            </>
          )}

          {/* INVITE LINKS TAB */}
          {tab === 'links' && group && (
            <>
              {/* Create new link */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Create Invite Link</div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={label}>MAX MEMBERS (0 = unlimited)</div>
                    <input type="number" min="0" max="10000" value={newMaxMembers} onChange={e => setNewMaxMembers(e.target.value)}
                      style={{ ...inp, padding: '8px 12px' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={label}>EXPIRES</div>
                    <select value={newExpiry} onChange={e => setNewExpiry(e.target.value)}
                      style={{ ...inp, padding: '8px 12px' }}>
                      {EXPIRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={label}>MIN PMT TO JOIN (0 = no requirement)</div>
                  <input type="number" min="0" step="any" value={newMinPMT} onChange={e => setNewMinPMT(e.target.value)}
                    placeholder="e.g. 5 (user must hold 5 PMT)" style={{ ...inp, padding: '8px 12px' }} />
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>Users with less than this amount of PMT cannot join</div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={label}>MIN PMT TO JOIN (0 = no requirement)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" min="0" step="0.01" value={newMinPMT} onChange={e => setNewMinPMT(e.target.value)}
                      style={{ ...inp, padding: '8px 12px', flex: 1 }} placeholder="0" />
                    <span style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--mono)', flexShrink: 0 }}>PMT</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                    {Number(newMinPMT) > 0 ? `Users must hold ≥ ${newMinPMT} PMT to join` : 'Anyone can join regardless of PMT balance'}
                  </div>
                </div>
                <button onClick={createLink} disabled={creatingLink}
                  style={{ width: '100%', padding: '9px', background: 'var(--accent)', border: 'none', borderRadius: 9, color: '#0a0c14', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: creatingLink ? 0.7 : 1 }}>
                  {creatingLink ? 'Creating...' : '+ Generate Invite Link'}
                </button>
              </div>

              {/* Existing links */}
              <div>
                <div style={label}>ACTIVE LINKS ({links.length})</div>
                {loadingLinks
                  ? <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 20, fontSize: 12 }}>Loading...</div>
                  : links.length === 0
                  ? <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 16, fontSize: 12, border: '1px dashed var(--border)', borderRadius: 9 }}>No invite links yet. Create one above.</div>
                  : links.map(l => {
                    const url = `https://pmt-chat3.vercel.app/?join=${l.linkId}`;
                    const expired = l.expiresAt && Date.now() > l.expiresAt;
                    return (
                      <div key={l.linkId} style={{ background: 'var(--surface)', border: `1px solid ${expired ? 'rgba(248,113,113,.3)' : 'var(--border)'}`, borderRadius: 10, padding: '12px', marginBottom: 8, opacity: expired ? 0.6 : 1 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button onClick={() => copyLink(l.linkId)}
                              style={{ padding: '4px 10px', background: copied === l.linkId ? 'rgba(74,222,128,.15)' : 'var(--surface2)', border: `1px solid ${copied === l.linkId ? 'rgba(74,222,128,.3)' : 'var(--border)'}`, borderRadius: 6, fontSize: 11, color: copied === l.linkId ? 'var(--accent3)' : 'var(--text2)', cursor: 'pointer', fontWeight: 600 }}>
                              {copied === l.linkId ? '✓ Copied' : 'Copy'}
                            </button>
                            <button onClick={() => deleteLink(l.linkId)}
                              style={{ padding: '4px 8px', background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.2)', borderRadius: 6, fontSize: 11, color: 'var(--danger)', cursor: 'pointer' }}>
                              🗑
                            </button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted)' }}>
                          <span>👥 {l.usedBy?.length || 0}{l.maxMembers > 0 ? `/${l.maxMembers}` : ''} joined</span>
                          <span>⏱ {formatExpiry(l.expiresAt)}</span>
                          {l.minPMT > 0 && <span>◈ Min {l.minPMT} PMT</span>}
                          {expired && <span style={{ color: 'var(--danger)' }}>Expired</span>}
                        </div>
                      </div>
                    );
                  })
                }
              </div>

              {err && <div style={{ background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: 'var(--danger)' }}>{err}</div>}

              <button onClick={onClose}
                style={{ width: '100%', padding: 10, background: 'transparent', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text2)', fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
                Done
              </button>
            </>
          )}

          {/* ── Members tab ── */}
          {tab === 'members' && group && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {loadingMembers ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 20, fontSize: 13 }}>Loading...</div>
              ) : (<>
                <div>
                  <div style={label}>MEMBERS ({members.length})</div>
                  {members.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No members yet.</div>}
                  {members.map(addr => {
                    const p = memberProfiles[addr.toLowerCase()] || getProfile(addr);
                    const isOwner = addr.toLowerCase() === (group.createdBy||'').toLowerCase();
                    const isMe = addr.toLowerCase() === myAddress?.toLowerCase();
                    const currentRole = isOwner ? 'owner' : (groupRoles[addr.toLowerCase()] || null);
                    const setRole = async (role: string | null) => {
                      try {
                        const r = await fetch('/api/groups?action=setRole', { method:'POST', headers:{'Content-Type':'application/json'},
                          body: JSON.stringify({ groupId: group.id||group.groupId, address: addr, role, requestedBy: myAddress }) });
                        const d = await r.json();
                        if (d.ok) { setGroupRoles(d.roles || {}); onRolesUpdated && onRolesUpdated(d.roles || {}); }
                        else alert(d.error);
                      } catch(e: any) { alert(e.message); }
                    };
                    return (
                      <div key={addr} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                        <div style={{ width:36, height:36, borderRadius:'50%', flexShrink:0, background:p.bg,
                          display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600,
                          color:p.color, overflow:'hidden', border:'1px solid var(--border)' }}>
                          {p.avatarUrl ? <img src={p.avatarUrl} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : p.name.slice(0,2).toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5 }}>
                            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</span>
                            {currentRole==='owner'&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:4,background:'rgba(250,255,99,.15)',color:'var(--accent)',border:'1px solid rgba(250,255,99,.3)',letterSpacing:.5,flexShrink:0}}>OWNER</span>}
                            {currentRole==='admin'&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:4,background:'rgba(99,210,255,.15)',color:'var(--accent)',border:'1px solid rgba(99,210,255,.3)',letterSpacing:.5,flexShrink:0}}>ADMIN</span>}
                            {currentRole==='moderator'&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:4,background:'rgba(167,139,250,.15)',color:'var(--accent2)',border:'1px solid rgba(167,139,250,.3)',letterSpacing:.5,flexShrink:0}}>MOD</span>}
                            {isMe&&!isOwner&&<span style={{fontSize:9,color:'var(--muted)',fontFamily:'var(--mono)',flexShrink:0}}>YOU</span>}
                          </div>
                          <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--muted)' }}>{addr.slice(0,10)}...{addr.slice(-4)}</div>
                        </div>
                        {!isOwner&&!isMe&&(
                          <div style={{display:'flex',gap:4,flexShrink:0}}>
                            {/* Role buttons */}
                            <select
                              value={currentRole||''}
                              onChange={e=>setRole(e.target.value||null)}
                              style={{fontSize:10,padding:'3px 6px',background:'var(--surface)',border:'1px solid var(--border)',
                                borderRadius:6,color:'var(--text)',cursor:'pointer',fontFamily:'var(--mono)'}}>
                              <option value=''>No role</option>
                              <option value='admin'>Admin</option>
                              <option value='moderator'>Mod</option>
                            </select>
                            <button disabled={banningAddr===addr}
                            onClick={async()=>{
                              if(!window.confirm(`Ban ${nm} from this group?`)) return;
                              setBanningAddr(addr);
                              try {
                                const r = await fetch('/api/groups?action=banMember',{method:'POST',headers:{'Content-Type':'application/json'},
                                  body:JSON.stringify({groupId:group.id||group.groupId,address:addr,requestedBy:myAddress})});
                                const d = await r.json();
                                if(d.ok){setMembers(d.members);setBannedMembers(d.bannedMembers);}else alert(d.error);
                              }catch(e:any){alert(e.message);}finally{setBanningAddr('');}
                            }}
                            style={{ padding:'5px 10px', background:'rgba(248,113,113,.1)', border:'1px solid rgba(248,113,113,.3)',
                              borderRadius:6, color:'var(--danger)', fontSize:11, cursor:'pointer', flexShrink:0,
                              fontWeight:600, opacity:banningAddr===addr?0.5:1 }}>
                            🚫 Ban
                          </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div>
                  <div style={label}>BANNED ({bannedMembers.length})</div>
                  {bannedMembers.length===0
                    ? <div style={{fontSize:12,color:'var(--muted)',padding:'8px 0'}}>No banned users.</div>
                    : bannedMembers.map(addr => {
                        const bp = memberProfiles[addr.toLowerCase()] || getProfile(addr);
                        return (
                          <div key={addr} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:'1px solid var(--border)',opacity:0.8}}>
                            <div style={{width:36,height:36,borderRadius:'50%',flexShrink:0,background:bp.bg,
                              display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:600,
                              color:bp.color,overflow:'hidden',border:'2px solid rgba(248,113,113,.4)',filter:'grayscale(40%)'}}>
                              {bp.avatarUrl ? <img src={bp.avatarUrl} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : bp.name.slice(0,2).toUpperCase()}
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:13,fontWeight:600,color:'var(--text2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{bp.name}</div>
                              <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--danger)',opacity:0.7}}>BANNED · {addr.slice(0,10)}...{addr.slice(-4)}</div>
                            </div>
                              <button disabled={banningAddr===addr}
                              onClick={async()=>{
                                setBanningAddr(addr);
                                try {
                                  const r = await fetch('/api/groups?action=unbanMember',{method:'POST',headers:{'Content-Type':'application/json'},
                                    body:JSON.stringify({groupId:group.id||group.groupId,address:addr,requestedBy:myAddress})});
                                  const d = await r.json();
                                  if(d.ok)setBannedMembers(d.bannedMembers);else alert(d.error);
                                }catch(e:any){alert(e.message);}finally{setBanningAddr('');}
                              }}
                              style={{padding:'5px 10px',background:'rgba(74,222,128,.1)',border:'1px solid rgba(74,222,128,.3)',
                                borderRadius:6,color:'var(--accent3)',fontSize:11,cursor:'pointer',flexShrink:0,
                                fontWeight:600,opacity:banningAddr===addr?0.5:1}}>
                              ✓ Unban
                            </button>
                          </div>
                        );
                      })
                  }
                </div>
              </>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
