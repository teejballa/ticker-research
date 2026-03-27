// src/lib/credentials.ts
// AES-256-GCM encrypt/decrypt for per-user credential storage (storage_state.json).
// Uses Node.js built-in crypto only — no external dependencies.
//
// Key setup: CREDENTIAL_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).
// Generate with: openssl rand -hex 32
// Store as a Vercel env var. Never regenerate — existing stored credentials become unreadable.

import crypto from 'crypto';

function getKey(): Buffer {
  const hex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a dot-separated string: base64(iv).base64(authTag).base64(ciphertext)
 * Each call uses a fresh random 12-byte IV, so two encryptions of the same plaintext differ.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map(b => b.toString('base64')).join('.');
}

/**
 * Decrypt a ciphertext string produced by encrypt().
 * Throws if the key is wrong, the auth tag is invalid, or the format is unexpected.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format: expected 3 dot-separated base64 segments');
  }
  const [iv, tag, enc] = parts.map(s => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
