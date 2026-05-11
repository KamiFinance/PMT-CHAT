<p align="center">
  <img src="public/pmt-logo.png" width="80" alt="PMT-Chat Logo"/>
</p>

<h1 align="center">PMT-Chat</h1>
<p align="center">Decentralized end-to-end encrypted messenger on PMT Chain</p>

<p align="center">
  <a href="https://pmt-chat3.vercel.app"><strong>🚀 Open App</strong></a>
</p>

---

## Features

- **End-to-end encrypted** — All messages encrypted client-side
- **On-chain** — Messages anchored to PMT Chain blockchain
- **No account needed** — Connect any EVM wallet (MetaMask, SafePal, Trust Wallet, etc.)
- **PWA** — Install directly on iOS/Android home screen, no App Store needed
- **Voice messages** — Record and send voice messages (WAV, cross-device compatible)
- **Images & files** — Share media with end-to-end encryption
- **Groups** — Create and manage group chats
- **Reactions** — React to messages with 21 emojis including the PMT logo
- **Reply** — Swipe to reply (mobile) or hover to reply (desktop)
- **AI Assistant** — Built-in PMT AI chat assistant

## Install as App (PWA)

### iPhone / iPad (Safari)
1. Open [pmt-chat3.vercel.app](https://pmt-chat3.vercel.app) in Safari
2. Tap the **Share** button (box with arrow)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **Add** — the app appears on your home screen

### Android (Chrome)
1. Open [pmt-chat3.vercel.app](https://pmt-chat3.vercel.app) in Chrome
2. Tap the **⋮ menu** → **"Add to Home Screen"**
3. Or tap the **install banner** that appears automatically

### Desktop (Chrome/Edge)
1. Open the app
2. Click the **install icon** (⊕) in the address bar

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Blockchain**: PMTchain (Chain ID: 290290), ethers.js
- **Encryption**: E2E via wallet keys
- **Storage**: Pinata/IPFS for media, PMT relay for messages
- **Emoji**: Apple emoji style (emoji-datasource-apple)
- **PWA**: Service Worker, Web App Manifest

## Development

```bash
npm install
npm run dev
```

## PMTchain

- **RPC**: https://node1-ipm.dweb3.wtf
- **Chain ID**: 290290
- **Symbol**: PMT
- **Explorer**: https://pmtscan.com

---

<p align="center">Built on PMT Chain ◆ End-to-end encrypted ◆ No middlemen</p>
