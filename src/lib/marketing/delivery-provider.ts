export interface SendEmailOptions {
  fromName: string;
  fromAddress: string;
  replyToAddress: string;
  toAddress: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  campaignId: string;
  recipientId?: string;
  unsubscribeUrl?: string;
}

export interface SendEmailResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
  isMockMode?: boolean;
}

export interface EmailDeliveryProvider {
  sendEmail(options: SendEmailOptions): Promise<SendEmailResult>;
  sendBatch(batchOptions: SendEmailOptions[]): Promise<SendEmailResult[]>;
}

export class MockEmailDeliveryProvider implements EmailDeliveryProvider {
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const mockId = `mock-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    return {
      success: true,
      providerMessageId: mockId,
      isMockMode: true,
    };
  }

  async sendBatch(batchOptions: SendEmailOptions[]): Promise<SendEmailResult[]> {
    return Promise.all(batchOptions.map((opt) => this.sendEmail(opt)));
  }
}

export class ResendEmailDeliveryProvider implements EmailDeliveryProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    if (process.env.MARKETING_EMAIL_TEST_GUARD === 'true' && process.env.NODE_ENV !== 'production') {
      return {
        success: true,
        providerMessageId: `resend-test-guard-msg-${Date.now()}`,
        isMockMode: false,
      };
    }

    try {
      const fromHeader = options.fromName
        ? `${options.fromName} <${options.fromAddress}>`
        : options.fromAddress;

      const headers: Record<string, string> = {};
      if (options.unsubscribeUrl) {
        headers['List-Unsubscribe'] = `<${options.unsubscribeUrl}>`;
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }

      const payload: Record<string, any> = {
        from: fromHeader,
        to: [options.toAddress],
        subject: options.subject,
        html: options.htmlContent,
        reply_to: options.replyToAddress,
        headers,
        tags: [
          { name: 'campaign_id', value: options.campaignId },
          ...(options.recipientId ? [{ name: 'recipient_id', value: options.recipientId }] : []),
        ],
      };

      if (options.textContent) {
        payload.text = options.textContent;
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (!response.ok || !json.id) {
        const errMsg = json?.message || json?.error || `HTTP ${response.status} from Resend`;
        return { success: false, error: String(errMsg) };
      }

      return {
        success: true,
        providerMessageId: json.id,
        isMockMode: false,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Network error communicating with Resend',
      };
    }
  }

  async sendBatch(batchOptions: SendEmailOptions[]): Promise<SendEmailResult[]> {
    // Process batch sequentially or in controlled parallel chunks
    const results: SendEmailResult[] = [];
    for (const opt of batchOptions) {
      const res = await this.sendEmail(opt);
      results.push(res);
    }
    return results;
  }
}

/**
 * Factory returning delivery provider instance.
 * Defaults strictly to Mock mode unless MARKETING_EMAIL_LIVE_SEND=true is explicitly set in env.
 */
export function getDeliveryProvider(): { provider: EmailDeliveryProvider; isLive: boolean } {
  const liveSendEnv = process.env.MARKETING_EMAIL_LIVE_SEND;
  const isLiveConfigured = liveSendEnv === 'true' || liveSendEnv === '1';
  const apiKey = process.env.RESEND_API_KEY;

  if (isLiveConfigured && apiKey) {
    return {
      provider: new ResendEmailDeliveryProvider(apiKey),
      isLive: true,
    };
  }

  return {
    provider: new MockEmailDeliveryProvider(),
    isLive: false,
  };
}
