import crypto from 'crypto';
import 'server-only';

/**
 * Validates the base64-encoded 32-byte key from environment variables.
 * Returns the raw key buffer. Throws if invalid or missing.
 */
function getPaymentEncryptionKey(): Buffer {
  const keyBase64 = process.env.PAYMENT_DATA_ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error('PAYMENT_DATA_ENCRYPTION_KEY environment variable is not defined');
  }

  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!base64Regex.test(keyBase64)) {
    throw new Error('PAYMENT_DATA_ENCRYPTION_KEY must be a valid base64-encoded string');
  }

  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error('PAYMENT_DATA_ENCRYPTION_KEY must decode to exactly 32 bytes (256 bits) for AES-256');
  }

  return key;
}

/**
 * Encrypts a plaintext payment string using AES-256-GCM.
 * Additional Authenticated Data (AAD) binds the ciphertext to the client ID and field name.
 */
export function encryptPaymentField(
  plaintext: string,
  clientId: string,
  fieldName: string
): { ciphertext: string; iv: string; authTag: string } {
  if (!plaintext) {
    return { ciphertext: '', iv: '', authTag: '' };
  }

  const key = getPaymentEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const aad = `${clientId}:${fieldName}`;
  cipher.setAAD(Buffer.from(aad, 'utf8'));

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

/**
 * Decrypts a ciphertext payment string using AES-256-GCM.
 * Throws an error if AAD mismatch or tampering occurs.
 */
export function decryptPaymentField(
  ciphertext: string,
  ivBase64: string,
  authTagBase64: string,
  clientId: string,
  fieldName: string
): string {
  if (!ciphertext || !ivBase64 || !authTagBase64) {
    return '';
  }

  const key = getPaymentEncryptionKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const encrypted = Buffer.from(ciphertext, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const aad = `${clientId}:${fieldName}`;
  decipher.setAAD(Buffer.from(aad, 'utf8'));

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}
