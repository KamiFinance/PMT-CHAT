import { ethers } from 'ethers';

export interface WalletData {
  mnemonic: string | null;
  words?: string[];
  address: string;
  privateKey: string;
}

export const PMTCrypto = {
  // Create a new random wallet — mnemonic, address and privateKey are all properly linked
  async createWallet(): Promise<WalletData> {
    const wallet = ethers.Wallet.createRandom();
    const mnemonic = wallet.mnemonic?.phrase ?? '';
    return {
      mnemonic,
      words: mnemonic.split(' '),
      address: wallet.address,
      privateKey: wallet.privateKey,
    };
  },

  // Import from BIP-39 mnemonic — produces the same address every time
  importFromMnemonic(phrase: string): WalletData {
    const words = phrase.trim().toLowerCase().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      throw new Error('Seed phrase must be 12 or 24 words');
    }
    try {
      const wallet = ethers.Wallet.fromPhrase(words.join(' '));
      return {
        mnemonic: words.join(' '),
        address: wallet.address,
        privateKey: wallet.privateKey,
      };
    } catch {
      throw new Error('Invalid seed phrase. Please check the words and try again.');
    }
  },

  // Import from raw private key
  importFromPrivateKey(key: string): WalletData {
    const clean = key.trim();
    try {
      const wallet = new ethers.Wallet(clean);
      return { privateKey: wallet.privateKey, address: wallet.address, mnemonic: null };
    } catch {
      throw new Error('Invalid private key. Must be a valid 32-byte hex string starting with 0x.');
    }
  },

  // Keep WORDS for any UI that references it
  WORDS: [] as string[],
};
