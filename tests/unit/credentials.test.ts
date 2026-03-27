// tests/unit/credentials.test.ts
// Unit tests for AES-256-GCM encrypt/decrypt in src/lib/credentials.ts

import { describe, it, expect, beforeAll } from 'vitest';

// Set a valid 64-char hex key (32 zero bytes) before importing the module
beforeAll(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = '0'.repeat(64);
});

// Dynamic import inside each describe so env var is set first
describe('credentials crypto', () => {
  it('encrypt returns a string with exactly 3 base64 segments separated by dots', async () => {
    const { encrypt } = await import('../../src/lib/credentials');
    const result = encrypt('hello world');
    const parts = result.split('.');
    expect(parts).toHaveLength(3);
    // each segment must be non-empty base64
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
      expect(/^[A-Za-z0-9+/=]+$/.test(part)).toBe(true);
    }
  });

  it('decrypt(encrypt(plaintext)) === plaintext (roundtrip)', async () => {
    const { encrypt, decrypt } = await import('../../src/lib/credentials');
    const plaintext = 'this is a secret credential string';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('decrypt with wrong key throws an error', async () => {
    const { encrypt } = await import('../../src/lib/credentials');
    const ciphertext = encrypt('secret data');

    // Change the key to a different value and try to decrypt
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'f'.repeat(64);
    const { decrypt } = await import('../../src/lib/credentials');
    expect(() => decrypt(ciphertext)).toThrow();

    // Restore correct key for subsequent tests
    process.env.CREDENTIAL_ENCRYPTION_KEY = '0'.repeat(64);
  });

  it('decrypt with tampered ciphertext throws an error', async () => {
    const { encrypt, decrypt } = await import('../../src/lib/credentials');
    const ciphertext = encrypt('tamper test');
    // Tamper the encrypted segment (index 2) by replacing first char
    const parts = ciphertext.split('.');
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    const tampered = parts.join('.');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('two calls to encrypt(same plaintext) produce different ciphertexts (random IV)', async () => {
    const { encrypt } = await import('../../src/lib/credentials');
    const plaintext = 'same plaintext';
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);
    expect(c1).not.toBe(c2);
  });
});
