import CryptoJS from 'crypto-js';

class EncryptionManager {
  private key: string = '';

  setKey(key: string): void {
    this.key = key;
  }

  generateKey(): string {
    const randomBytes = CryptoJS.lib.WordArray.random(32);
    return randomBytes.toString();
  }

  encrypt(data: string): string {
    if (!this.key) {
      throw new Error('Encryption key not set');
    }
    return CryptoJS.AES.encrypt(data, this.key).toString();
  }

  decrypt(encryptedData: string): string {
    if (!this.key) {
      throw new Error('Encryption key not set');
    }
    const bytes = CryptoJS.AES.decrypt(encryptedData, this.key);
    return bytes.toString(CryptoJS.enc.Utf8);
  }
}

export const encryptionManager = new EncryptionManager();
