import { supabase } from '@/lib/supabaseClient';
import {
  MarketingCampaign,
  MarketingSegment,
  MarketingTemplate,
  MarketingSuppression,
  MarketingSenderAccount,
  MarketingAutomation,
  MarketingDeliveryEvent,
  SafetyCheckSummary,
} from '@/types/marketing';
import { evaluateSegmentCandidates } from './segment-evaluator';
import { evaluateRecipientSafety } from './safety-engine';
import { replacePersonalizationTokens } from './personalization';

// Default predefined system templates
export const SYSTEM_TEMPLATES: Omit<MarketingTemplate, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    name: 'Policy Renewal Reminder (30 Days)',
    category: 'Renewal',
    subject: 'Action Required: Your {{carrier}} Policy Renewal Notice',
    body_html: `
<div style="font-family: Arial, sans-serif; color: #172033; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px;">
  <h2 style="color: #2563eb;">Policy Renewal Notice</h2>
  <p>Hello {{first_name}},</p>
  <p>Your policy <strong>{{policy_number}}</strong> with <strong>{{carrier}}</strong> is scheduled for renewal within the next 30 days.</p>
  <p>To ensure continuous coverage with no lapse in benefits, please review your upcoming renewal rates and confirm your information.</p>
  <div style="margin: 24px 0; text-align: center;">
    <a href="#" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Review Renewal Options</a>
  </div>
  <p>If you have any questions or need assistance, feel free to contact {{agent_name}} directly.</p>
  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
  <p style="font-size: 11px; color: #64748b; text-align: center;">You received this email regarding your policy with {{carrier}}. <a href="#">Unsubscribe</a></p>
</div>
`,
    is_system: true,
    is_favorite: true,
    status: 'ACTIVE',
  },
  {
    name: 'Happy Birthday Greeting',
    category: 'Birthday',
    subject: '🎂 Happy Birthday from {{agent_name}}!',
    body_html: `
<div style="font-family: Arial, sans-serif; color: #172033; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px;">
  <h2 style="color: #d97706;">Happy Birthday, {{first_name}}! 🎉</h2>
  <p>Dear {{first_name}},</p>
  <p>Wishing you a wonderful birthday filled with joy, health, and happiness!</p>
  <p>Thank you for being a valued client. We appreciate your trust in us for your insurance needs.</p>
  <p>Warmest regards,<br /><strong>{{agent_name}}</strong></p>
  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
  <p style="font-size: 11px; color: #64748b; text-align: center;">SmarTrack Marketing | <a href="#">Unsubscribe</a></p>
</div>
`,
    is_system: true,
    is_favorite: true,
    status: 'ACTIVE',
  },
  {
    name: 'Payment Due Reminder',
    category: 'Payment Reminder',
    subject: 'Payment Reminder: Premium Due for Policy {{policy_number}}',
    body_html: `
<div style="font-family: Arial, sans-serif; color: #172033; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0;">
  <h2 style="color: #dc2626;">Premium Payment Reminder</h2>
  <p>Hello {{first_name}},</p>
  <p>This is a friendly reminder that your premium payment for policy <strong>{{policy_number}}</strong> with <strong>{{carrier}}</strong> is due soon.</p>
  <p>Please make your payment promptly to keep your policy active and avoid cancellation.</p>
  <p>Contact <strong>{{agent_name}}</strong> if you need payment link assistance.</p>
  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
  <p style="font-size: 11px; color: #64748b;">Unsubscribe from marketing emails <a href="#">here</a>.</p>
</div>
`,
    is_system: true,
    is_favorite: false,
    status: 'ACTIVE',
  },
  {
    name: 'Welcome New Client',
    category: 'Welcome',
    subject: 'Welcome to SmarTrack Insurance Services, {{first_name}}!',
    body_html: `
<div style="font-family: Arial, sans-serif; color: #172033; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0;">
  <h2 style="color: #2563eb;">Welcome Onboard!</h2>
  <p>Dear {{first_name}},</p>
  <p>Thank you for choosing us as your trusted insurance agency. Your agent <strong>{{agent_name}}</strong> is here to support you at every step.</p>
  <p>Your policy <strong>{{policy_number}}</strong> with <strong>{{carrier}}</strong> is now active.</p>
  <p>Best regards,<br /><strong>{{agent_name}}</strong></p>
</div>
`,
    is_system: true,
    is_favorite: true,
    status: 'ACTIVE',
  },
  {
    name: 'Lead Follow-up Intro',
    category: 'Lead Follow-up',
    subject: 'Comparing Health & Life Coverage Options for {{first_name}}',
    body_html: `
<div style="font-family: Arial, sans-serif; color: #172033; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0;">
  <h2 style="color: #059669;">Customized Quote Assistance</h2>
  <p>Hi {{first_name}},</p>
  <p>I noticed you recently requested information on affordable health and life coverage options.</p>
  <p>As an authorized agent representing <strong>{{carrier}}</strong>, I can help you find plans tailored to your budget and needs.</p>
  <p>Reply to this email or call <strong>{{agent_name}}</strong> today for a free quote!</p>
</div>
`,
    is_system: true,
    is_favorite: false,
    status: 'ACTIVE',
  },
];

// Fallback in-memory storage if database table is pending migration
let localCampaigns: MarketingCampaign[] = [];
let localTemplates: MarketingTemplate[] = SYSTEM_TEMPLATES.map((t, idx) => ({
  ...t,
  id: `sys-tpl-${idx + 1}`,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}));
let localSegments: MarketingSegment[] = [
  {
    id: 'seg-fl-renewals',
    name: 'FL Renewals — 30 Days',
    description: 'Clients in Florida with policies renewing in 30 days',
    filters: { client: { state: 'FL' }, policy: { renewalWithinDays: 30 } },
    is_system: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'seg-birthday-month',
    name: 'Birthday This Month',
    description: 'Clients celebrating birthdays in the current month',
    filters: { client: { birthMonth: new Date().getMonth() + 1 } },
    is_system: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];
let localSuppressions: MarketingSuppression[] = [];
let localSenderAccounts: MarketingSenderAccount[] = [
  {
    id: 'snd-1',
    provider: 'GOOGLE_OAUTH',
    from_name: 'SmarTrack Marketing Agent',
    from_email: 'agent@smartrack.com',
    reply_to: 'agent@smartrack.com',
    is_default: true,
    status: 'DISCONNECTED',
    spf_status: 'NOT_CHECKED',
    dkim_status: 'NOT_CHECKED',
    dmarc_status: 'NOT_CHECKED',
    sender_eligibility_status: 'REPLY_TO_ONLY',
    reply_to_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];
let localAutomations: MarketingAutomation[] = [
  {
    id: 'aut-1',
    name: 'Policy Renewal Reminder (Automatic)',
    trigger_type: 'RENEWAL_APPROACHING',
    status: 'DRAFT',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Helper to generate RFC4122 v4 compliant UUID
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// --- CAMPAIGNS ---
export async function getCampaigns(): Promise<MarketingCampaign[]> {
  try {
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/marketing/campaigns');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data as MarketingCampaign[];
      }
    }

    const { data, error } = await supabase
      .from('marketing_campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return localCampaigns;
    return data as MarketingCampaign[];
  } catch {
    return localCampaigns;
  }
}

export async function getCampaignById(campaignId: string): Promise<MarketingCampaign | null> {
  try {
    if (typeof window !== 'undefined') {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) return data as MarketingCampaign;
      }
    }

    const { data, error } = await supabase
      .from('marketing_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (!error && data) return data as MarketingCampaign;
  } catch {}

  return localCampaigns.find((c) => c.id === campaignId) || null;
}

export async function createCampaign(
  campaignData: Partial<MarketingCampaign>
): Promise<MarketingCampaign> {
  // 1. First attempt: Server API endpoint with service-role & agent authorization
  try {
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignData),
      });

      if (res.ok) {
        const savedData = await res.json();
        if (savedData && savedData.id) {
          return savedData as MarketingCampaign;
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.error('Server campaign save error:', res.status, errJson);
      }
    }
  } catch (err) {
    console.error('Exception calling /api/marketing/campaigns:', err);
  }

  // 2. Second attempt: Direct Supabase client query
  const targetId = campaignData.id || generateUUID();
  const campToSave: MarketingCampaign = {
    id: targetId,
    name: campaignData.name || 'Untitled Campaign',
    channel: campaignData.channel || 'EMAIL',
    subject: campaignData.subject || '',
    preview_text: campaignData.preview_text || '',
    from_name: campaignData.from_name || 'Agent',
    from_email: campaignData.from_email || 'consents@mail.smartrackcrm.com',
    reply_to: campaignData.reply_to || campaignData.from_email || 'agent@smartrack.com',
    segment_id: campaignData.segment_id || null,
    template_id: campaignData.template_id || null,
    content_html: campaignData.content_html || '',
    content_text: campaignData.content_text || '',
    scheduled_at: campaignData.scheduled_at || null,
    sent_at: campaignData.sent_at || null,
    status: campaignData.status || 'DRAFT',
    total_matched: campaignData.total_matched || 0,
    valid_recipients: campaignData.valid_recipients || 0,
    excluded_duplicates: campaignData.excluded_duplicates || 0,
    excluded_invalid_email: campaignData.excluded_invalid_email || 0,
    excluded_unsubscribed: campaignData.excluded_unsubscribed || 0,
    excluded_bounced: campaignData.excluded_bounced || 0,
    created_at: campaignData.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('marketing_campaigns')
      .upsert([campToSave])
      .select()
      .single();

    if (!error && data) return data as MarketingCampaign;
    if (error) console.error('Supabase campaign upsert error:', error.message);
  } catch (err) {
    console.error('Supabase campaign exception:', err);
  }

  // If DB persistence failed completely, throw an error so caller knows persistence failed
  throw new Error('Failed to persist campaign to database. Please verify network and server authentication.');
}

export async function updateCampaignStatus(
  campaignId: string,
  status: MarketingCampaign['status'],
  extraMetrics?: Partial<MarketingCampaign>
): Promise<boolean> {
  try {
    if (typeof window !== 'undefined') {
      const res = await fetch(`/api/marketing/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...extraMetrics }),
      });
      if (res.ok) return true;
    }
  } catch {}

  try {
    const patch: any = { status, updated_at: new Date().toISOString(), ...extraMetrics };
    if (status === 'SENT') patch.sent_at = new Date().toISOString();

    const { error } = await supabase.from('marketing_campaigns').update(patch).eq('id', campaignId);
    if (!error) return true;
  } catch {}

  const cIdx = localCampaigns.findIndex((c) => c.id === campaignId);
  if (cIdx !== -1) {
    localCampaigns[cIdx] = {
      ...localCampaigns[cIdx],
      status,
      updated_at: new Date().toISOString(),
      ...(status === 'SENT' ? { sent_at: new Date().toISOString() } : {}),
      ...extraMetrics,
    };
    return true;
  }
  return false;
}

// Double-Send Protection & Execution
export async function executeCampaignSend(
  campaignId: string,
  safetySummary: SafetyCheckSummary
): Promise<{ success: boolean; message: string }> {
  const campaigns = await getCampaigns();
  const campaign = campaigns.find((c) => c.id === campaignId);

  if (!campaign) return { success: false, message: 'Campaign not found.' };

  // Double-send protection
  if (['SENT', 'SENDING'].includes(campaign.status)) {
    return {
      success: false,
      message: `Safety Block: Campaign is already in '${campaign.status}' state. Double-sending is prevented.`,
    };
  }

  if (safetySummary.validRecipients === 0) {
    return { success: false, message: 'Cannot send campaign: 0 valid recipients.' };
  }

  // Set status to SENDING
  await updateCampaignStatus(campaignId, 'SENDING');

  // Record recipients & mock events
  const validDetails = safetySummary.details.filter((d) => !d.isExcluded);

  for (const recipient of validDetails) {
    const event: MarketingDeliveryEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      campaign_id: campaignId,
      event_type: 'SENT',
      created_at: new Date().toISOString(),
      metadata: { recipient_email: recipient.email, recipient_name: recipient.name, mode: 'LOCAL_MOCK_SEND' },
    };

    try {
      await supabase.from('marketing_delivery_events').insert([event]);
    } catch {}
  }

  // Complete sending
  await updateCampaignStatus(campaignId, 'SENT', {
    total_matched: safetySummary.totalMatched,
    valid_recipients: safetySummary.validRecipients,
    excluded_duplicates: safetySummary.excludedDuplicates,
    excluded_invalid_email: safetySummary.excludedInvalidEmail,
    excluded_unsubscribed: safetySummary.excludedUnsubscribed,
    excluded_bounced: safetySummary.excludedBounced,
  });

  return {
    success: true,
    message: `Campaign '${campaign.name}' successfully sent to ${safetySummary.validRecipients} recipients (Mock Delivery Mode).`,
  };
}

// --- TEMPLATES ---
export async function getTemplates(): Promise<MarketingTemplate[]> {
  try {
    const { data, error } = await supabase
      .from('marketing_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) return localTemplates;
    return data as MarketingTemplate[];
  } catch {
    return localTemplates;
  }
}

export async function createTemplate(
  tplData: Partial<MarketingTemplate>
): Promise<MarketingTemplate> {
  const newTpl: MarketingTemplate = {
    id: `tpl-${Date.now()}`,
    name: tplData.name || 'Untitled Template',
    category: tplData.category || 'Custom',
    subject: tplData.subject || '',
    body_html: tplData.body_html || '<p>Hello {{first_name}},</p>',
    is_system: false,
    is_favorite: tplData.is_favorite || false,
    status: tplData.status || 'ACTIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('marketing_templates')
      .insert([newTpl])
      .select()
      .single();

    if (!error && data) return data as MarketingTemplate;
  } catch {}

  localTemplates.unshift(newTpl);
  return newTpl;
}

// --- SEGMENTS ---
export async function getSegments(): Promise<MarketingSegment[]> {
  try {
    const { data, error } = await supabase
      .from('marketing_segments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) return localSegments;
    return data as MarketingSegment[];
  } catch {
    return localSegments;
  }
}

export async function createSegment(
  segData: Partial<MarketingSegment>
): Promise<MarketingSegment> {
  const newSeg: MarketingSegment = {
    id: `seg-${Date.now()}`,
    name: segData.name || 'Custom Segment',
    description: segData.description || '',
    filters: segData.filters || {},
    is_system: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('marketing_segments')
      .insert([newSeg])
      .select()
      .single();

    if (!error && data) return data as MarketingSegment;
  } catch {}

  localSegments.unshift(newSeg);
  return newSeg;
}

// --- SUPPRESSIONS ---
export async function getSuppressions(): Promise<MarketingSuppression[]> {
  try {
    const { data, error } = await supabase
      .from('marketing_suppressions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) return localSuppressions;
    return data as MarketingSuppression[];
  } catch {
    return localSuppressions;
  }
}

export async function addSuppression(
  email: string,
  reason: MarketingSuppression['reason'],
  details?: string
): Promise<MarketingSuppression> {
  const newSup: MarketingSuppression = {
    id: `sup-${Date.now()}`,
    email: email.trim().toLowerCase(),
    reason,
    details: details || '',
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('marketing_suppressions')
      .insert([newSup])
      .select()
      .single();

    if (!error && data) return data as MarketingSuppression;
  } catch {}

  localSuppressions.unshift(newSup);
  return newSup;
}

// --- SENDER ACCOUNTS ---
export async function getSenderAccounts(): Promise<MarketingSenderAccount[]> {
  try {
    const { data, error } = await supabase
      .from('marketing_sender_accounts')
      .select('*');

    if (error || !data || data.length === 0) return localSenderAccounts;
    return data as MarketingSenderAccount[];
  } catch {
    return localSenderAccounts;
  }
}

// --- AUTOMATIONS ---
export async function getAutomations(): Promise<MarketingAutomation[]> {
  try {
    const { data, error } = await supabase
      .from('marketing_automations')
      .select('*');

    if (error || !data || data.length === 0) return localAutomations;
    return data as MarketingAutomation[];
  } catch {
    return localAutomations;
  }
}
