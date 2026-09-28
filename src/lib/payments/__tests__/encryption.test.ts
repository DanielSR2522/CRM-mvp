import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { encryptPaymentField, decryptPaymentField } from '../encryption.js';

describe('Payment Data Encryption (encryptPaymentField & decryptPaymentField)', () => {
  it('throws controlled error when encryption key environment variables are missing', () => {
    const origPaymentKey = process.env.PAYMENT_DATA_ENCRYPTION_KEY;
    const origHealthKey = process.env.HEALTH_DATA_ENCRYPTION_KEY;

    delete process.env.PAYMENT_DATA_ENCRYPTION_KEY;
    delete process.env.HEALTH_DATA_ENCRYPTION_KEY;

    try {
      assert.throws(
        () => encryptPaymentField('123456789', 'client-1', 'account_number'),
        {
          name: 'Error',
          message: 'PAYMENT_DATA_ENCRYPTION_KEY environment variable is not defined',
        }
      );
    } finally {
      if (origPaymentKey) process.env.PAYMENT_DATA_ENCRYPTION_KEY = origPaymentKey;
      if (origHealthKey) process.env.HEALTH_DATA_ENCRYPTION_KEY = origHealthKey;
    }
  });

  it('encrypts and decrypts sensitive payment data using 32-byte key with AAD binding', () => {
    const origKey = process.env.PAYMENT_DATA_ENCRYPTION_KEY;
    // Generate a valid 32-byte (256-bit) base64 key
    const testKeyBase64 = crypto.randomBytes(32).toString('base64');
    process.env.PAYMENT_DATA_ENCRYPTION_KEY = testKeyBase64;

    const clientId = 'client-test-123';
    const fieldName = 'account_number';
    const plaintextAccount = '987654321012';

    try {
      // 1. Encrypt
      const encrypted = encryptPaymentField(plaintextAccount, clientId, fieldName);
      assert.ok(encrypted.ciphertext);
      assert.ok(encrypted.iv);
      assert.ok(encrypted.authTag);
      assert.doesNotMatch(encrypted.ciphertext, new RegExp(plaintextAccount));

      // 2. Decrypt with correct credentials
      const decrypted = decryptPaymentField(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        clientId,
        fieldName
      );
      assert.equal(decrypted, plaintextAccount);

      // 3. Decrypt with mismatched client ID (AAD tampering detection)
      assert.throws(() => {
        decryptPaymentField(
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.authTag,
          'wrong-client-id',
          fieldName
        );
      });
    } finally {
      if (origKey) process.env.PAYMENT_DATA_ENCRYPTION_KEY = origKey;
      else delete process.env.PAYMENT_DATA_ENCRYPTION_KEY;
    }
  });

  it('uses HEALTH_DATA_ENCRYPTION_KEY as fallback if PAYMENT_DATA_ENCRYPTION_KEY is unset', () => {
    const origPaymentKey = process.env.PAYMENT_DATA_ENCRYPTION_KEY;
    const origHealthKey = process.env.HEALTH_DATA_ENCRYPTION_KEY;

    delete process.env.PAYMENT_DATA_ENCRYPTION_KEY;
    const testKeyBase64 = crypto.randomBytes(32).toString('base64');
    process.env.HEALTH_DATA_ENCRYPTION_KEY = testKeyBase64;

    try {
      const encrypted = encryptPaymentField('4111111111111111', 'client-456', 'card_number');
      assert.ok(encrypted.ciphertext);

      const decrypted = decryptPaymentField(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        'client-456',
        'card_number'
      );
      assert.equal(decrypted, '4111111111111111');
    } finally {
      if (origPaymentKey) process.env.PAYMENT_DATA_ENCRYPTION_KEY = origPaymentKey;
      if (origHealthKey) process.env.HEALTH_DATA_ENCRYPTION_KEY = origHealthKey;
      else delete process.env.HEALTH_DATA_ENCRYPTION_KEY;
    }
  });
});
