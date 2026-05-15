// @ts-nocheck
import React, { useState } from 'react';
import { storage } from '../../lib/storage';

function Section({icon, title, badge, children}) {
  return (
    <div style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:18}}>{icon}</span>
        <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)',fontWeight:700,letterSpacing:'1px'}}>{title}</span>
        {badge && <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--accent3)',background:'rgba(52,211,153,.12)',border:'1px solid rgba(52,211,153,.3)',borderRadius:4,padding:'1px 7px'}}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function Field({label, value, onChange, placeholder, type='text'}) {
  return (
    <div>
      <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--muted)',letterSpacing:'1px',marginBottom:5}}>{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,
          padding:'9px 12px',color:'var(--text)',fontFamily:'var(--mono)',fontSize:11,outline:'none',boxSizing:'border-box'}}/>
    </div>
  );
}

export default function SettingsModal({onClose, darkMode, onToggleTheme, wallet, isDemo, onChangePassword, chatWallpaper='none', onSetWallpaper}) {
  const [pinataJwt, setPinataJwt] = useState(storage.getPinataJwt() || '');
  const [aiKey, setAiKey] = useState(localStorage.getItem('pmt_anthropic_key') || '');
  const [saved, setSaved] = useState(false);

  // Password change state
  const [showPwSection, setShowPwSection] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const isInternalWallet = wallet?.address && !wallet?.isMetaMask && wallet?.privateKey !== 'metamask';

  const save = () => {
    if (pinataJwt.trim()) localStorage.setItem('pmt_pinata_jwt', pinataJwt.trim());
    if (aiKey.trim()) localStorage.setItem('pmt_anthropic_key', aiKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChangePassword = async () => {
    setPwError('');
    if (!curPw) return setPwError('Enter your current password.');
    if (!newPw) return setPwError('Enter a new password.');
    if (newPw.length < 8) return setPwError('New password must be at least 8 characters.');
    if (newPw !== confirmPw) return setPwError('New passwords do not match.');
    if (newPw === curPw) return setPwError('New password must be different from the current one.');
    setPwLoading(true);
    try {
      await onChangePassword(curPw, newPw);
      setPwSuccess(true);
      setCurPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => { setPwSuccess(false); setShowPwSection(false); }, 2500);
    } catch (e) {
      setPwError(e.message || 'Password change failed. Check your current password.');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',
      justifyContent:'center',zIndex:200}} onClick={onClose} onWheel={e=>e.stopPropagation()}>
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:18,
        padding:'24px 22px',width:340,maxHeight:'85vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:16,
        animation:'slideUp .25s ease',overscrollBehavior:'contain'}} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:20}}>⚙️</span>
            <span style={{fontSize:17,fontWeight:700,color:'var(--text)'}}>Settings</span>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--muted)',fontSize:22,cursor:'pointer',lineHeight:1}}>×</button>
        </div>

        {/* Theme */}
        <Section icon={darkMode ? '🌙' : '☀️'} title="APPEARANCE">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{fontSize:13,color:'var(--text)',fontWeight:500}}>{darkMode ? 'Dark Mode' : 'Light Mode'}</div>
              <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>Switch between dark and light theme</div>
            </div>
            <button onClick={onToggleTheme}
              style={{width:52,height:28,borderRadius:14,border:'none',cursor:'pointer',position:'relative',
                background:darkMode?'var(--accent)':'var(--muted)',transition:'background .2s',flexShrink:0}}>
              <div style={{position:'absolute',top:3,left:darkMode?26:3,width:22,height:22,borderRadius:'50%',
                background:darkMode?'#000':'#fff',transition:'left .2s',boxShadow:'0 1px 4px rgba(0,0,0,.3)'}}/>
            </button>
          </div>
        </Section>

        {/* Chat Settings — wallpaper picker */}
        <Section icon="🖼️" title="CHAT">
          <div>
            <div style={{fontSize:12,color:'var(--muted)',marginBottom:10}}>Chat Wallpaper</div>
            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
              {/* No wallpaper option */}
              <button onClick={()=>onSetWallpaper&&onSetWallpaper('none')}
                title="No wallpaper"
                style={{width:56,height:56,borderRadius:10,border:`2px solid ${chatWallpaper==='none'?'var(--accent)':'var(--border)'}`,
                  background:'var(--bg)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
                  flexShrink:0,transition:'border-color .15s',outline:'none'}}>
                <span style={{fontSize:20}}>🚫</span>
              </button>
              {/* Wallpaper 1 */}
              <button onClick={()=>onSetWallpaper&&onSetWallpaper('wallpaper1')}
                title="Wallpaper 1"
                style={{width:56,height:56,borderRadius:10,border:`2px solid ${chatWallpaper==='wallpaper1'?'var(--accent)':'var(--border)'}`,
                  backgroundImage:'url(/wallpaper1.png?v=2)',backgroundSize:'contain',backgroundPosition:'center',backgroundRepeat:'no-repeat',
                  cursor:'pointer',flexShrink:0,transition:'border-color .15s',outline:'none',position:'relative'}}>
                {chatWallpaper==='wallpaper1'&&<div style={{position:'absolute',inset:0,borderRadius:8,background:'rgba(250,255,99,.2)',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:16}}>✓</span></div>}
              </button>
              {/* Wallpaper 2 */}
              <button onClick={()=>onSetWallpaper&&onSetWallpaper('wallpaper2')}
                title="Wallpaper 2"
                style={{width:56,height:56,borderRadius:10,border:`2px solid ${chatWallpaper==='wallpaper2'?'var(--accent)':'var(--border)'}`,
                  backgroundImage:'url(/wallpaper2.png?v=2)',backgroundSize:'contain',backgroundPosition:'center',backgroundRepeat:'no-repeat',
                  cursor:'pointer',flexShrink:0,transition:'border-color .15s',outline:'none',position:'relative'}}>
                {chatWallpaper==='wallpaper2'&&<div style={{position:'absolute',inset:0,borderRadius:8,background:'rgba(250,255,99,.2)',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:16}}>✓</span></div>}
              </button>
              {/* Wallpaper 3 */}
              <button onClick={()=>onSetWallpaper&&onSetWallpaper('wallpaper3')}
                title="Wallpaper 3"
                style={{width:56,height:56,borderRadius:10,border:`2px solid ${chatWallpaper==='wallpaper3'?'var(--accent)':'var(--border)'}`,
                  backgroundImage:'url(/wallpaper3.png?v=2)',backgroundSize:'contain',backgroundPosition:'center',backgroundRepeat:'no-repeat',
                  cursor:'pointer',flexShrink:0,transition:'border-color .15s',outline:'none',position:'relative'}}>
                {chatWallpaper==='wallpaper3'&&<div style={{position:'absolute',inset:0,borderRadius:8,background:'rgba(250,255,99,.2)',display:'flex',alignItems:'center',justifyContent:'center'}}><span style={{fontSize:16}}>✓</span></div>}
              </button>
            </div>
            <div style={{fontSize:10,color:'var(--muted)',marginTop:8,fontFamily:'var(--mono)'}}>
              {chatWallpaper==='none'?'No wallpaper selected':`Wallpaper ${chatWallpaper.replace('wallpaper','')} active`}
            </div>
          </div>
        </Section>

        {/* Change Password — only for Create/Import Wallet users */}
        {isInternalWallet && !isDemo && (
          <Section icon="🔑" title="SECURITY">
            {!showPwSection ? (
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:13,color:'var(--text)',fontWeight:500}}>Change Password</div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>Update your account password</div>
                </div>
                <button onClick={() => setShowPwSection(true)}
                  style={{padding:'7px 14px',background:'var(--surface)',border:'1px solid var(--border)',
                    borderRadius:8,color:'var(--text2)',fontSize:12,cursor:'pointer',fontWeight:500}}>
                  Change
                </button>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <Field label="CURRENT PASSWORD" value={curPw} onChange={setCurPw} placeholder="Your current password" type="password"/>
                <Field label="NEW PASSWORD" value={newPw} onChange={setNewPw} placeholder="At least 8 characters" type="password"/>
                <Field label="CONFIRM NEW PASSWORD" value={confirmPw} onChange={setConfirmPw} placeholder="Repeat new password" type="password"/>
                {pwError && (
                  <div style={{fontSize:12,color:'var(--danger)',background:'rgba(248,113,113,.1)',
                    border:'1px solid rgba(248,113,113,.3)',borderRadius:8,padding:'8px 10px'}}>
                    {pwError}
                  </div>
                )}
                {pwSuccess && (
                  <div style={{fontSize:12,color:'var(--accent3)',background:'rgba(52,211,153,.1)',
                    border:'1px solid rgba(52,211,153,.3)',borderRadius:8,padding:'8px 10px'}}>
                    ✓ Password changed successfully!
                  </div>
                )}
                <div style={{display:'flex',gap:8}}>
                  <button onClick={() => { setShowPwSection(false); setCurPw(''); setNewPw(''); setConfirmPw(''); setPwError(''); }}
                    style={{flex:1,padding:'9px',background:'var(--surface)',border:'1px solid var(--border)',
                      borderRadius:8,color:'var(--muted)',fontSize:13,cursor:'pointer'}}>
                    Cancel
                  </button>
                  <button onClick={handleChangePassword} disabled={pwLoading}
                    style={{flex:2,padding:'9px',background:'var(--accent)',border:'none',borderRadius:8,
                      color:'#000',fontWeight:700,fontSize:13,cursor:pwLoading?'default':'pointer',
                      opacity:pwLoading?0.7:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                    {pwLoading
                      ? <><span style={{width:12,height:12,border:'2px solid rgba(0,0,0,.3)',borderTopColor:'#000',borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/>Updating...</>
                      : '🔑 Update Password'}
                  </button>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* AI Assistant */}
        <Section icon="🤖" title="AI ASSISTANT" badge="ACTIVE">
          <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.5}}>
            PMT AI Assistant is built-in. Add your own Anthropic API key to use your personal quota.
          </div>
          <Field label="ANTHROPIC API KEY (OPTIONAL)" value={aiKey} onChange={setAiKey}
            placeholder="sk-ant-api03-..." type="password"/>
          <div style={{fontSize:11,color:'var(--muted)'}}>
            Get a key at <a href="https://console.anthropic.com" target="_blank"
              style={{color:'var(--accent)',textDecoration:'none'}}>console.anthropic.com</a>
          </div>
        </Section>

        {/* Pinata */}
        <Section icon="📌" title="PINATA IPFS STORAGE">
          <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.5}}>
            Images, files and voice messages are stored on IPFS via Pinata — accessible from any device.
          </div>
          <Field label="PINATA JWT TOKEN (OPTIONAL)" value={pinataJwt} onChange={setPinataJwt}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." type="password"/>
          <div style={{fontSize:11,color:'var(--muted)'}}>
            Get your JWT at <a href="https://app.pinata.cloud" target="_blank"
              style={{color:'var(--accent)',textDecoration:'none'}}>app.pinata.cloud</a> → API Keys
          </div>
        </Section>

        {/* Save */}
        <button onClick={save}
          style={{width:'100%',padding:'12px',background:saved?'var(--accent3)':'var(--accent)',border:'none',
            borderRadius:10,color:saved?'#fff':'#000',fontWeight:700,fontSize:14,cursor:'pointer',
            transition:'background .2s',fontFamily:'var(--sans)'}}>
          {saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
