/**
 * Server-only Supabase client.
 *
 * ============================ READ THIS FIRST ============================
 * This module holds SUPABASE_SERVICE_ROLE_KEY, which bypasses every RLS policy
 * in the database. Importing it from a Client Component would compile the key
 * into the JavaScript bundle and publish it to the internet.
 *
 * Rules, all of them non-negotiable:
 *   - never import this from a file with 'use client';
 *   - never re-export the key, log it, or include it in an error;
 *   - never send it to the browser in any form;
 *   - bypassing RLS does NOT remove the obligation to validate. Every public
 *     route must check token, expiry, revocation, status and ownership itself,
 *     because nothing else will.
 * ========================================================================
 *
 * The `server-only` package is the usual way to make a client import fail at
 * build time. It is not installed here — only pdf-lib was authorised — so this
 * module enforces the same rule at runtime with an explicit guard. It throws the
 * moment it is evaluated in a browser, which turns a silent key leak into an
 * immediate, loud failure during development.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Runs at module evaluation. If this file is ever pulled into a client bundle,
// the page breaks on load rather than shipping the key quietly.
if (typeof window !== 'undefined') {
  throw new Error(
    'supabaseAdmin was imported into browser code. This module holds the service role key and must only ever be used on the server.'
  );
}

let cached: SupabaseClient | null = null;

/**
 * Whether the server surface is configured at all.
 *
 * The app must build and run without the key — a missing env var is a
 * configuration problem to report, not a compile error. Routes call this first
 * and return a generic 503 rather than crashing.
 */
export function isAdminConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * The service-role client.
 *
 * Throws a message that names the variable but never its value. Callers must
 * translate this into a generic error for the public — a signer has no business
 * learning about our environment.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.');
  }
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. The public signing routes cannot run without it. See .env.example.'
    );
  }

  cached = createClient(url, serviceKey, {
    auth: {
      // A server client has no session to persist and no URL to inspect. Leaving
      // these on would have it try to write to storage that does not exist.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cached;
}
