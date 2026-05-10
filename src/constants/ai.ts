import type { Contact } from '../types';

export const AI_AGENT_ADDRESS = '0x000000000000000000000000000000000000a1';

export const AI_AGENT_CONTACT: Contact = {
  id: 'ai',
  address: AI_AGENT_ADDRESS,
  name: 'PMT AI Assistant',
  avatar: 'AI',
  color: '#faff63',
  bg: '#1a1a0a',
  online: true,
  isAI: true,
  preview: 'Ask me anything...',
  unread: 0,
};

export const REACTION_EMOJIS = ['👍','❤️','😂','😮','🔥','✅','🎉','😢','🙏','💯','🤝','😍','💀','🤯','⚡','🥳','🤔','👀','💎','🚀'];
