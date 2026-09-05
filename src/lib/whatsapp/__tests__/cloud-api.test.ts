/**
 * Tests for src/lib/whatsapp/cloud-api.ts
 *
 * Run with: npx tsx --test src/lib/whatsapp/__tests__/cloud-api.test.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeToE164,
  selectTemplateName,
  selectLanguageCode,
  getWhatsAppConfig,
  WhatsAppConfigError,
  WhatsAppApiError,
  sendConsentWhatsAppTemplate,
  validateWebhookSignature,
} from '../cloud-api.js';

// ---------------------------------------------------------------------------
// normalizeToE164 tests
// ---------------------------------------------------------------------------

describe('normalizeToE164', () => {
  it('keeps +1 numbers intact', () => {
    assert.equal(normalizeToE164('+13055551234'), '+13055551234');
  });

  it('keeps +52 Mexican numbers intact', () => {
    assert.equal(normalizeToE164('+5215512345678'), '+5215512345678');
  });

  it('prepends +1 for bare 10-digit US numbers', () => {
    assert.equal(normalizeToE164('3055551234'), '+13055551234');
  });

  it('handles (305) 555-1234 formatted US numbers', () => {
    assert.equal(normalizeToE164('(305) 555-1234'), '+13055551234');
  });

  it('handles 1-305-555-1234 with dashes', () => {
    assert.equal(normalizeToE164('1-305-555-1234'), '+13055551234');
  });

  it('handles 11-digit numbers starting with 1', () => {
    assert.equal(normalizeToE164('13055551234'), '+13055551234');
  });

  it('returns null for null input', () => {
    assert.equal(normalizeToE164(null), null);
  });

  it('returns null for empty string', () => {
    assert.equal(normalizeToE164(''), null);
  });

  it('returns null for numbers that are too short', () => {
    assert.equal(normalizeToE164('12345'), null);
  });

  it('returns null for international numbers without + (ambiguous country code)', () => {
    assert.equal(normalizeToE164('52155112345'), null);
  });

  it('handles + with formatting characters', () => {
    assert.equal(normalizeToE164('+1 (305) 555-1234'), '+13055551234');
  });
});

// ---------------------------------------------------------------------------
// selectTemplateName & selectLanguageCode tests
// ---------------------------------------------------------------------------

describe('selectTemplateName & selectLanguageCode', () => {
  const baseConfig = {
    accessToken: 'test-token',
    phoneNumberId: '123',
    businessAccountId: null,
    apiVersion: 'v20.0',
    templateEs: 'health_consent_signature_request',
    templateEsLanguage: 'es_CO',
    templateEn: 'health_consent_ingles',
    templateEnLanguage: 'en',
  };

  it('returns Spanish template for es', () => {
    assert.equal(selectTemplateName(baseConfig, 'es'), 'health_consent_signature_request');
  });

  it('returns English template for en', () => {
    assert.equal(selectTemplateName(baseConfig, 'en'), 'health_consent_ingles');
  });

  it('resolves explicit Spanish language code (e.g. es_CO)', () => {
    assert.equal(selectLanguageCode(baseConfig, 'es'), 'es_CO');
  });

  it('resolves explicit English language code (e.g. en)', () => {
    assert.equal(selectLanguageCode(baseConfig, 'en'), 'en');
  });

  it('uses custom template name and language from config', () => {
    const custom = {
      ...baseConfig,
      templateEs: 'custom_spanish_template',
      templateEsLanguage: 'es_MX',
    };
    assert.equal(selectTemplateName(custom, 'es'), 'custom_spanish_template');
    assert.equal(selectLanguageCode(custom, 'es'), 'es_MX');
  });
});

// ---------------------------------------------------------------------------
// getWhatsAppConfig tests
// ---------------------------------------------------------------------------

describe('getWhatsAppConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1227585563776068';
    process.env.WHATSAPP_API_VERSION = 'v20.0';
    process.env.WHATSAPP_TEMPLATE_ES_LANGUAGE = 'es_CO';
    process.env.WHATSAPP_TEMPLATE_EN_LANGUAGE = 'en';
  });

  afterEach(() => {
    Object.keys(process.env).forEach((k) => {
      if (!(k in originalEnv)) delete process.env[k];
    });
    Object.assign(process.env, originalEnv);
  });

  it('returns config when all required vars are set', () => {
    const config = getWhatsAppConfig();
    assert.equal(config.accessToken, 'test-access-token');
    assert.equal(config.phoneNumberId, '1227585563776068');
    assert.equal(config.apiVersion, 'v20.0');
    assert.equal(config.templateEs, 'health_consent_signature_request');
    assert.equal(config.templateEsLanguage, 'es_CO');
    assert.equal(config.templateEn, 'health_consent_ingles');
    assert.equal(config.templateEnLanguage, 'en');
  });

  it('throws WhatsAppConfigError when WHATSAPP_ACCESS_TOKEN is missing', () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    assert.throws(() => getWhatsAppConfig(), WhatsAppConfigError);
  });

  it('throws WhatsAppConfigError when WHATSAPP_PHONE_NUMBER_ID is missing', () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    assert.throws(() => getWhatsAppConfig(), WhatsAppConfigError);
  });

  it('throws WhatsAppConfigError when WHATSAPP_API_VERSION is missing (no silent fallback)', () => {
    delete process.env.WHATSAPP_API_VERSION;
    assert.throws(() => getWhatsAppConfig(), (err: any) => {
      assert.ok(err instanceof WhatsAppConfigError);
      assert.ok(err.message.includes('WHATSAPP_API_VERSION'));
      return true;
    });
  });

  it('error message lists missing variables but does not expose token values', () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    try {
      getWhatsAppConfig();
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof WhatsAppConfigError);
      assert.ok(err.message.includes('WHATSAPP_ACCESS_TOKEN'));
      assert.ok(!err.message.includes('test-access-token'));
    }
  });
});

// ---------------------------------------------------------------------------
// sendConsentWhatsAppTemplate tests (with fetch mock)
// ---------------------------------------------------------------------------

describe('sendConsentWhatsAppTemplate', () => {
  const baseConfig = {
    accessToken: 'test-token',
    phoneNumberId: '123456',
    businessAccountId: null,
    apiVersion: 'v20.0',
    templateEs: 'health_consent_signature_request',
    templateEsLanguage: 'es_CO',
    templateEn: 'health_consent_ingles',
    templateEnLanguage: 'en',
  };

  const baseParams = {
    config: baseConfig,
    toPhone: '+13055551234',
    templateName: 'health_consent_ingles',
    language: 'en' as const,
    clientName: 'John Doe',
    agentName: 'Agent Smith',
    consentLink: 'https://crm.example.com/sign/abc123',
  };

  function mockFetch(responseBody: object, status = 200) {
    const originalFetch = global.fetch;
    (global as any).fetch = async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => responseBody,
    });
    return () => { (global as any).fetch = originalFetch; };
  }

  it('returns messageId on success', async () => {
    const restore = mockFetch({ messages: [{ id: 'wamid.ABC123' }] });
    try {
      const result = await sendConsentWhatsAppTemplate(baseParams);
      assert.equal(result.messageId, 'wamid.ABC123');
    } finally {
      restore();
    }
  });

  it('sends explicit configured Spanish locale (es_CO) to Meta', async () => {
    let capturedBody: any;
    const originalFetch = global.fetch;
    (global as any).fetch = async (_url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: 'wamid.ES123' }] }),
      };
    };
    try {
      await sendConsentWhatsAppTemplate({
        ...baseParams,
        templateName: 'health_consent_signature_request',
        language: 'es',
        clientName: 'Juan García',
        agentName: 'Agente López',
        consentLink: 'https://crm.example.com/sign/xyz789',
      });
      assert.equal(capturedBody.template.name, 'health_consent_signature_request');
      assert.equal(capturedBody.template.language.code, 'es_CO');
      const params = capturedBody.template.components[0].parameters;
      const clientNameParam = params.find((p: any) => p.parameter_name === 'client_name');
      assert.equal(clientNameParam.text, 'Juan García');
    } finally {
      (global as any).fetch = originalFetch;
    }
  });

  it('sends explicit configured English locale (en) to Meta', async () => {
    let capturedBody: any;
    const originalFetch = global.fetch;
    (global as any).fetch = async (_url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: 'wamid.EN456' }] }),
      };
    };
    try {
      await sendConsentWhatsAppTemplate(baseParams);
      assert.equal(capturedBody.template.language.code, 'en');
    } finally {
      (global as any).fetch = originalFetch;
    }
  });

  it('throws WhatsAppApiError on Meta 400', async () => {
    const restore = mockFetch(
      { error: { code: 100, message: 'Invalid parameter', type: 'OAuthException' } },
      400
    );
    try {
      await assert.rejects(
        () => sendConsentWhatsAppTemplate(baseParams),
        WhatsAppApiError
      );
    } finally {
      restore();
    }
  });

  it('throws WhatsAppApiError on Meta 401', async () => {
    const restore = mockFetch({ error: { code: 190, message: 'Token expired' } }, 401);
    try {
      await assert.rejects(
        () => sendConsentWhatsAppTemplate(baseParams),
        WhatsAppApiError
      );
    } finally {
      restore();
    }
  });

  it('throws WhatsAppApiError on Meta 429', async () => {
    const restore = mockFetch({ error: { code: 429 } }, 429);
    try {
      await assert.rejects(
        () => sendConsentWhatsAppTemplate(baseParams),
        WhatsAppApiError
      );
    } finally {
      restore();
    }
  });

  it('throws WhatsAppApiError on Meta 500', async () => {
    const restore = mockFetch({ error: { message: 'Internal server error' } }, 500);
    try {
      await assert.rejects(
        () => sendConsentWhatsAppTemplate(baseParams),
        WhatsAppApiError
      );
    } finally {
      restore();
    }
  });

  it('throws WhatsAppApiError when success response has no message_id', async () => {
    const restore = mockFetch({ messages: [] });
    try {
      await assert.rejects(
        () => sendConsentWhatsAppTemplate(baseParams),
        WhatsAppApiError
      );
    } finally {
      restore();
    }
  });

  it('throws WhatsAppApiError on network failure', async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = async () => { throw new Error('ECONNREFUSED'); };
    try {
      await assert.rejects(
        () => sendConsentWhatsAppTemplate(baseParams),
        WhatsAppApiError
      );
    } finally {
      (global as any).fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// validateWebhookSignature tests
// ---------------------------------------------------------------------------

describe('validateWebhookSignature', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.assign(process.env, originalEnv);
  });

  it('returns false when WHATSAPP_APP_SECRET is not set', async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const result = await validateWebhookSignature('body', 'sha256=abc');
    assert.equal(result, false);
  });

  it('returns false when signature header is missing', async () => {
    process.env.WHATSAPP_APP_SECRET = 'test-secret';
    const result = await validateWebhookSignature('body', null);
    assert.equal(result, false);
  });

  it('returns true for a valid HMAC-SHA256 signature', async () => {
    const secret = 'super-secret-test-key';
    const body = '{"object":"whatsapp_business_account"}';
    process.env.WHATSAPP_APP_SECRET = secret;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    const expectedHex = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const result = await validateWebhookSignature(body, `sha256=${expectedHex}`);
    assert.equal(result, true);
  });
});
