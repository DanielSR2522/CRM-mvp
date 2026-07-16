/**
 * Consents & Signatures — secure token generation.
 *
 * The raw token is the only thing that will let a signer open their document. It
 * is generated here, handed to the caller once, and never written anywhere: the
 * database only ever stores its SHA-256.
 *
 * That asymmetry is the whole security model of the public signing page. If the
 * database leaks, the tokens in it are useless — a hash cannot be turned back
 * into a link.
 */

import { sha256Hex } from './template-blocks';

/** 32 bytes = 256 bits of entropy. Far beyond guessable. */
const TOKEN_BYTES = 32;

export interface GeneratedToken {
  /**
   * The raw token. Goes in the /sign/<token> URL and nowhere else.
   * Never log it, never store it, never put it in an error message.
   */
  raw: string;
  /** Lowercase hex SHA-256 — this is what signature_request_signers stores. */
  hash: string;
}

/**
 * base64url: URL-safe, no padding. Shorter than hex and safe in a path segment
 * without escaping.
 */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generates a token and its hash.
 *
 * Throws rather than degrading if the platform lacks a cryptographic RNG. A
 * predictable token would be an unlocked door on every consent — Math.random is
 * not an acceptable fallback here, and a hard failure is the safe outcome.
 */
export async function generateSecureToken(): Promise<GeneratedToken> {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error(
      'No cryptographic random source is available, so a secure signing link cannot be created. This page must be served over HTTPS or from localhost.'
    );
  }

  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);

  const raw = toBase64Url(bytes);
  const hash = await sha256Hex(raw);

  return { raw, hash };
}

/** Hashes an incoming token for lookup. Used by the public route in a later phase. */
export async function hashToken(raw: string): Promise<string> {
  return sha256Hex(raw);
}

// ---------------------------------------------------------------------------
// Expiration
// ---------------------------------------------------------------------------

export const DEFAULT_EXPIRY_DAYS = 14;
export const MIN_EXPIRY_DAYS = 1;
export const MAX_EXPIRY_DAYS = 90;

/** Midnight-agnostic: expiry is a moment, N whole days from now. */
export function expiryFromDays(days: number, now: Date = new Date()): Date {
  const expires = new Date(now.getTime());
  expires.setDate(expires.getDate() + days);
  return expires;
}

export function isValidExpiryDays(days: number): boolean {
  return Number.isInteger(days) && days >= MIN_EXPIRY_DAYS && days <= MAX_EXPIRY_DAYS;
}
