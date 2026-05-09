// ── Core Domain Types ──────────────────────────────────────────────────────

export type MessageType = 'text' | 'voice' | 'image' | 'file' | 'tx' | 'reaction';

export interface Reaction {
  // Format: {[emoji]: {[reactorAddress]: 1}} for ownership tracking
  // Backward-compat: also accepts {[emoji]: number} for old reactions
  [emoji: string]: {[address: string]: number} | number;
}

export interface Message {
  id: string;
  out: boolean;
  type: MessageType;
  text: string;
  time: string;
  block: number;
  confirms: number;
  hash: string;
  pending?: boolean;
  read?: boolean;
  onChain?: boolean;
  chain?: string;
  reactions?: Reaction;
  isTyping?: boolean;
  uploading?: boolean;
  _toAddr?: string;

  // Voice
  audioUrl?: string | null;
  audioMsgId?: string;
  duration?: number;
  waveform?: number[];
  ipfsCid?: string;
  ipfsUrl?: string;

  // Image / File
  fileUrl?: string | null;
  fileName?: string;
  fileSize?: string;
  mimeType?: string;
  mediaMsgId?: string;
  imgMsgId?: string;
  b64Data?: string;
  b64Fallback?: string;
  imgData?: string;

  // TX
  amount?: string;
  token?: string;
  txHash?: string;

  // AI
  from?: string;
  fromName?: string;
  ts?: number;

  // Sender profile (attached when message received)
  senderName?: string;
  senderAddress?: string;
  senderAvatarUrl?: string | null;
  senderBio?: string;
}

export interface InboxMessage {
  id: string;
  type: MessageType | 'reaction';
  text: string;
  time: string;
  block?: number;
  hash?: string;
  from: string;
  fromName?: string;
  ts: number;
  chain?: string;
  onChain?: boolean;
  // Reaction
  msgId?: string;
  emoji?: string;
  reactions?: Reaction;
  // Voice
  audioMsgId?: string;
  duration?: number;
  waveform?: number[];
  ipfsCid?: string;
  ipfsUrl?: string;
  // Image
  mediaMsgId?: string;
  imgMsgId?: string;
  ipfsCid_?: string;
  imgData?: string;
  b64Data?: string;
  fileData?: string;
  fileName?: string;
  fileSize?: string;
  mimeType?: string;
}

export interface Contact {
  id: string | number;
  address: string;
  name: string;
  avatar: string;
  color: string;
  bg: string;
  online?: boolean;
  isAI?: boolean;
  isGroup?: boolean;
  members?: string[];
  groupId?: string;
  createdBy?: string;
  preview?: string;
  unread?: number;
  avatarUrl?: string | null;
}

export interface Wallet {
  address: string;
  balance: string;
  network: string;
  chainId?: string;
  privateKey?: string;
  mnemonic?: string;
  username?: string;
  isMetaMask?: boolean;
  isCreated?: boolean;
}

export interface Profile {
  name: string;
  bio: string;
  avatarUrl: string | null;
  address: string | null;
}

export type Screen =
  | 'landing'
  | 'create'
  | 'import'
  | 'login'
  | 'chat'
  | 'metamask_setup'
  | 'verify';

export interface MsgsMap {
  [address: string]: Message[];
}

// ── Storage Key Helpers ────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  contacts: (account: string) => `pmt_contacts_${account}`,
  msgs: (account: string) => `pmt_msgs_${account}`,
  profile: (account: string) => `pmt_profile_${account}`,
  inbox: (address: string) => `pmt_inbox_${address.toLowerCase()}`,
  audio: (msgId: string) => `pmt_audio_${msgId}`,
  media: (msgId: string) => `pmt_media_${msgId}`,
  img: (msgId: string) => `pmt_img_${msgId}`,
  session: 'pmt_session',
  theme: 'pmt_theme',
  pinataJwt: 'pmt_pinata_jwt',
  anthropicKey: 'pmt_anthropic_key',
} as const;
