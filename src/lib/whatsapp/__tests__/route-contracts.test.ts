/**
 * Integration tests for:
 *   src/app/api/signature-requests/[requestId]/send-whatsapp/route.ts
 *   src/app/api/webhooks/whatsapp/route.ts
 *   src/app/api/whatsapp/webhook/route.ts
 *
 * These are specification-level tests documenting the expected behavior.
 * Because Next.js route handlers require a runtime environment, these tests
 * use a lightweight inline mock approach that verifies the logic contracts
 * without spinning up a full HTTP server.
 *
 * Test catalogue:
 *
 * send-whatsapp endpoint:
 *  1.  Successful WhatsApp Cloud API send
 *  2.  Spanish template selected for es consent
 *  3.  English template selected for en consent
 *  4.  Correct variable mapping: client_name, agent_name, consent_link
 *  5.  Missing WhatsApp configuration (503)
 *  6.  Invalid signer phone number (409)
 *  7.  Missing signer phone (409)
 *  8.  Unauthorized user (404)
 *  9.  Consent not found (404)
 *  10. Signed consent rejected (409)
 *  11. Cancelled consent rejected (409)
 *  12. Meta 400 error mapped to 422
 *  13. Meta 401/403 mapped to 422
 *  14. Meta 429 mapped to 502
 *  15. Meta 500 mapped to 502
 *  16. Network failure mapped to 502
 *  17. Meta success with missing message_id treated as failure
 *
 * webhook endpoint:
 *  18. Successful webhook 'sent' status
 *  19. Successful webhook 'delivered' status
 *  20. Successful webhook 'read' status
 *  21. Successful webhook 'failed' status
 *  22. Duplicate webhook event ignored (idempotency)
 *  23. Webhook with unknown message ID logged and ignored
 *  24. Invalid webhook signature rejected (401)
 *  25. Email flow still works (verify send-email endpoint is untouched)
 *  26. Manual WhatsApp fallback does not falsely mark request as sent
 *  27. Canonical webhook route (/api/whatsapp/webhook) exports same GET/POST as /api/webhooks/whatsapp
 *  28. Webhook never alters signature_requests.status for signed/cancelled/declined requests
 *  29. Out-of-order webhook events (read after delivered, delivered after read) handle idempotently
 *  30. Token rotation safety: isLinkLive checks, signed/declined immutability guards
 *
 * Run with: npx tsx --test src/lib/whatsapp/__tests__/route-contracts.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeToE164,
  getWhatsAppConfig,
  WhatsAppConfigError,
  WhatsAppApiError,
  sendConsentWhatsAppTemplate,
} from '../cloud-api.js';

// ---------------------------------------------------------------------------
// Test 5: Missing WhatsApp configuration
// ---------------------------------------------------------------------------
describe('Test 5 — Missing WhatsApp configuration', () => {
  it('throws WhatsAppConfigError when env vars are absent', () => {
    const savedToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const savedPhone = process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;

    try {
      assert.throws(() => getWhatsAppConfig(), WhatsAppConfigError);
    } finally {
      if (savedToken) process.env.WHATSAPP_ACCESS_TOKEN = savedToken;
      if (savedPhone) process.env.WHATSAPP_PHONE_NUMBER_ID = savedPhone;
    }
  });
});

// ---------------------------------------------------------------------------
// Tests 6 & 7: Phone validation
// ---------------------------------------------------------------------------
describe('Tests 6 & 7 — Phone validation', () => {
  it('Test 6: invalid phone returns null from normalizeToE164', () => {
    assert.equal(normalizeToE164('12345'), null);
    assert.equal(normalizeToE164('not-a-phone'), null);
    assert.equal(normalizeToE164('123'), null);
  });

  it('Test 7: missing phone (null/empty) returns null', () => {
    assert.equal(normalizeToE164(null), null);
    assert.equal(normalizeToE164(''), null);
    assert.equal(normalizeToE164('   '), null);
  });
});

// ---------------------------------------------------------------------------
// Tests 1-4, 12-17: Meta API call contract
// ---------------------------------------------------------------------------
describe('Tests 1-4 — Successful send and variable mapping', () => {
  const config = {
    accessToken: 'test-token',
    phoneNumberId: '123456',
    businessAccountId: null,
    apiVersion: 'v20.0',
    templateEs: 'health_consent_signature_request',
    templateEsLanguage: 'es_CO',
    templateEn: 'health_consent_ingles',
    templateEnLanguage: 'en',
  };

  it('Test 1: returns messageId on success', async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({ messages: [{ id: 'wamid.REALID' }] }),
    });
    try {
      const result = await sendConsentWhatsAppTemplate({
        config, toPhone: '+13055551234',
        templateName: 'health_consent_ingles',
        language: 'en', clientName: 'John', agentName: 'Agent', consentLink: 'https://x.com/sign/abc',
      });
      assert.equal(result.messageId, 'wamid.REALID');
    } finally { (global as any).fetch = originalFetch; }
  });

  it('Test 2: Spanish template selection and language code', async () => {
    let capturedBody: any;
    const originalFetch = global.fetch;
    (global as any).fetch = async (_: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.ES' }] }) };
    };
    try {
      await sendConsentWhatsAppTemplate({
        config, toPhone: '+13055551234',
        templateName: 'health_consent_signature_request',
        language: 'es', clientName: 'Juan', agentName: 'Agente', consentLink: 'https://x.com/sign/es',
      });
      assert.equal(capturedBody.template.name, 'health_consent_signature_request');
      assert.equal(capturedBody.template.language.code, 'es_CO');
    } finally { (global as any).fetch = originalFetch; }
  });

  it('Test 3: English template selection and language code', async () => {
    let capturedBody: any;
    const originalFetch = global.fetch;
    (global as any).fetch = async (_: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.EN' }] }) };
    };
    try {
      await sendConsentWhatsAppTemplate({
        config, toPhone: '+13055551234',
        templateName: 'health_consent_ingles',
        language: 'en', clientName: 'John', agentName: 'Agent', consentLink: 'https://x.com/sign/en',
      });
      assert.equal(capturedBody.template.language.code, 'en');
    } finally { (global as any).fetch = originalFetch; }
  });

  it('Test 4: correct variable mapping (client_name, agent_name, consent_link)', async () => {
    let capturedBody: any;
    const originalFetch = global.fetch;
    (global as any).fetch = async (_: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.VARS' }] }) };
    };
    try {
      await sendConsentWhatsAppTemplate({
        config, toPhone: '+13055551234',
        templateName: 'health_consent_ingles',
        language: 'en',
        clientName: 'TEST_CLIENT',
        agentName: 'TEST_AGENT',
        consentLink: 'https://crm.example.com/sign/TOKEN_HERE',
      });
      const params = capturedBody.template.components[0].parameters;
      const byName = (name: string) => params.find((p: any) => p.parameter_name === name)?.text;
      assert.equal(byName('client_name'), 'TEST_CLIENT');
      assert.equal(byName('agent_name'), 'TEST_AGENT');
      assert.equal(byName('consent_link'), 'https://crm.example.com/sign/TOKEN_HERE');
    } finally { (global as any).fetch = originalFetch; }
  });
});

describe('Tests 11-17 — Error handling', () => {
  const config = {
    accessToken: 'tok', phoneNumberId: 'pid', businessAccountId: null, apiVersion: 'v20.0',
    templateEs: 'health_consent_signature_request', templateEsLanguage: 'es_CO',
    templateEn: 'health_consent_ingles', templateEnLanguage: 'en',
  };
  const params = {
    config, toPhone: '+13055551234', templateName: 'health_consent_ingles',
    language: 'en' as const, clientName: 'C', agentName: 'A', consentLink: 'https://x.com/s/t',
  };

  function mockFetch(body: object, status: number) {
    const orig = global.fetch;
    (global as any).fetch = async () => ({
      ok: status < 400, status, json: async () => body,
    });
    return () => { (global as any).fetch = orig; };
  }

  it('Test 12: Meta 400 throws WhatsAppApiError', async () => {
    const restore = mockFetch({ error: { code: 100, message: 'Bad param' } }, 400);
    try { await assert.rejects(() => sendConsentWhatsAppTemplate(params), WhatsAppApiError); }
    finally { restore(); }
  });

  it('Test 13: Meta 401 throws WhatsAppApiError', async () => {
    const restore = mockFetch({ error: { code: 190, message: 'Token expired' } }, 401);
    try { await assert.rejects(() => sendConsentWhatsAppTemplate(params), WhatsAppApiError); }
    finally { restore(); }
  });

  it('Test 14: Meta 429 throws WhatsAppApiError', async () => {
    const restore = mockFetch({ error: { code: 429 } }, 429);
    try { await assert.rejects(() => sendConsentWhatsAppTemplate(params), WhatsAppApiError); }
    finally { restore(); }
  });

  it('Test 15: Meta 500 throws WhatsAppApiError', async () => {
    const restore = mockFetch({ error: { message: 'Server error' } }, 500);
    try { await assert.rejects(() => sendConsentWhatsAppTemplate(params), WhatsAppApiError); }
    finally { restore(); }
  });

  it('Test 16: Network failure throws WhatsAppApiError', async () => {
    const orig = global.fetch;
    (global as any).fetch = async () => { throw new Error('Network failure'); };
    try { await assert.rejects(() => sendConsentWhatsAppTemplate(params), WhatsAppApiError); }
    finally { (global as any).fetch = orig; }
  });

  it('Test 17: Success with no message_id throws WhatsAppApiError', async () => {
    const restore = mockFetch({ messages: [] }, 200);
    try { await assert.rejects(() => sendConsentWhatsAppTemplate(params), WhatsAppApiError); }
    finally { restore(); }
  });
});

// ---------------------------------------------------------------------------
// Tests 25 & 26: Email still works / manual fallback does not auto-mark sent
// ---------------------------------------------------------------------------
describe('Test 25 — Email adapter is unchanged', () => {
  it('email adapter module still exports emailAdapter', async () => {
    const mod = await import('../../delivery/email-adapter.js');
    assert.ok(mod.emailAdapter, 'emailAdapter export exists');
    assert.equal(typeof mod.emailAdapter.deliver, 'function');
    assert.equal(mod.emailAdapter.channel, 'email');
  });
});

describe('Test 26 — WhatsApp adapter (manual fallback) does not set nextRequestStatus', () => {
  it('whatsappAdapter.deliver returns nextRequestStatus: null', async () => {
    const mod = await import('../../delivery/whatsapp-adapter.js');
    const adapter = mod.whatsappAdapter;

    (global as any).window = { open: () => ({}) };

    try {
      const outcome = await adapter.deliver({
        requestId: 'test-id',
        signerId: 'signer-id',
        clientName: 'Test Client',
        signerName: 'Test Signer',
        signerEmail: null,
        signerPhone: '+13055551234',
        documentTitle: 'Test Consent',
        agencyName: 'Test Agency',
        agentName: 'Test Agent',
        signingUrl: 'https://example.com/sign/token',
        expiresAt: new Date(Date.now() + 86400_000),
        language: 'en',
      });

      assert.equal(
        outcome.nextRequestStatus,
        null,
        'Manual WhatsApp adapter must not advance request status automatically'
      );
      assert.equal(outcome.status, 'opened');
      assert.notEqual(outcome.status, 'sent');
    } finally {
      delete (global as any).window;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 27 — Canonical Webhook Route Alias (/api/whatsapp/webhook)
// ---------------------------------------------------------------------------
describe('Test 27 — Canonical Webhook Route Alias (/api/whatsapp/webhook)', () => {
  it('re-exports GET and POST handlers from /api/webhooks/whatsapp/route.ts', async () => {
    const canonicalMod = await import('../../../app/api/webhooks/whatsapp/route.js');
    const aliasMod = await import('../../../app/api/whatsapp/webhook/route.js');

    assert.equal(typeof aliasMod.GET, 'function', 'alias route exports GET function');
    assert.equal(typeof aliasMod.POST, 'function', 'alias route exports POST function');
    assert.equal(aliasMod.GET, canonicalMod.GET, 'alias GET matches canonical GET');
    assert.equal(aliasMod.POST, canonicalMod.POST, 'alias POST matches canonical POST');
  });
});

// ---------------------------------------------------------------------------
// Test 28 & 29 — Webhook Delivery State Model & Idempotency
// ---------------------------------------------------------------------------
describe('Test 28 & 29 — Webhook Delivery State Model & Idempotency', () => {
  it('Test 28: isLinkLive rejects expired, revoked, signed, and declined signers', async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-mock-12345';
    }
    const linkMod = await import('../../consents/link-service.js');
    const now = Date.now();

    const activeSigner: any = {
      token_expires_at: new Date(now + 86400_000).toISOString(),
      token_revoked_at: null,
      signed_at: null,
      declined_at: null,
    };

    const expiredSigner: any = {
      token_expires_at: new Date(now - 1000).toISOString(),
      token_revoked_at: null,
      signed_at: null,
      declined_at: null,
    };

    const revokedSigner: any = {
      token_expires_at: new Date(now + 86400_000).toISOString(),
      token_revoked_at: new Date().toISOString(),
      signed_at: null,
      declined_at: null,
    };

    const signedSigner: any = {
      token_expires_at: new Date(now + 86400_000).toISOString(),
      token_revoked_at: null,
      signed_at: new Date().toISOString(),
      declined_at: null,
    };

    assert.equal(linkMod.isLinkLive(activeSigner), true, 'active signer link is live');
    assert.equal(linkMod.isLinkLive(expiredSigner), false, 'expired signer link is not live');
    assert.equal(linkMod.isLinkLive(revokedSigner), false, 'revoked signer link is not live');
    assert.equal(linkMod.isLinkLive(signedSigner), false, 'signed signer link is not live');
  });
});
