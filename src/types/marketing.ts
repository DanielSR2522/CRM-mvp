export type MarketingChannel = 'EMAIL' | 'WHATSAPP' | 'SMS';

export type CampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'SENDING'
  | 'SENT'
  | 'PAUSED'
  | 'FAILED'
  | 'CANCELLED';

export type TemplateCategory =
  | 'Renewal'
  | 'Payment Reminder'
  | 'Welcome'
  | 'Lead Follow-up'
  | 'Reactivation'
  | 'Referral Request'
  | 'Birthday'
  | 'Promotion'
  | 'Announcement'
  | 'Custom';

export type RecipientStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'EXCLUDED';

export type DeliveryEventType =
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'OPENED'
  | 'CLICKED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'UNSUBSCRIBED'
  | 'FAILED';

export type SuppressionReason =
  | 'UNSUBSCRIBE'
  | 'GLOBAL_SUPPRESSION'
  | 'HARD_BOUNCE'
  | 'COMPLAINT'
  | 'MANUAL';

export type SenderProvider =
  | 'GOOGLE_OAUTH'
  | 'MICROSOFT_OAUTH'
  | 'SMTP_RELAY'
  | 'CUSTOM_DOMAIN';

export type SenderStatus = 'CONNECTED' | 'DISCONNECTED' | 'NEEDS_REAUTH' | 'VERIFYING';

export type DomainAuthStatus = 'VERIFIED' | 'FAILED' | 'NOT_CHECKED' | 'UNKNOWN';

export type SenderEligibilityStatus = 'VERIFIED_FROM' | 'REPLY_TO_ONLY' | 'INELIGIBLE';

export type AutomationTrigger =
  | 'NEW_LEAD'
  | 'NO_RESPONSE_X_DAYS'
  | 'RENEWAL_APPROACHING'
  | 'POLICY_CANCELLED'
  | 'PAYMENT_PENDING'
  | 'BIRTHDAY'
  | 'CLIENT_INACTIVE'
  | 'SALE_COMPLETED';

export interface AudienceFilters {
  client?: {
    category?: string;
    status?: string;
    state?: string;
    city?: string;
    zipCode?: string;
    ageMin?: number;
    ageMax?: number;
    birthMonth?: number;
    preferredLanguage?: string;
    createdFrom?: string;
    createdTo?: string;
    assignedAgentId?: string;
  };
  policy?: {
    carrier?: string;
    productType?: string;
    policyStatus?: 'active' | 'pending' | 'cancelled' | 'expired' | 'all';
    effectiveFrom?: string;
    effectiveTo?: string;
    expirationFrom?: string;
    expirationTo?: string;
    renewalWithinDays?: 7 | 15 | 30 | 60 | null;
    paymentPending?: boolean;
  };
  activity?: {
    isNewLead?: boolean;
    leadNotContacted?: boolean;
    noResponse?: boolean;
    lastContactBefore?: string;
    inactiveForDays?: number;
  };
  emailMarketing?: {
    hasEmail?: boolean;
    validEmailOnly?: boolean;
    receivedPreviousCampaignId?: string;
    didNotReceivePreviousCampaignId?: string;
    openedPreviousCampaignId?: string;
    didNotOpenPreviousCampaignId?: string;
    clickedPreviousCampaignId?: string;
    didNotClickPreviousCampaignId?: string;
    hasConsentOnly?: boolean;
    excludeUnsubscribed?: boolean;
    excludeSuppressed?: boolean;
    excludeHardBounces?: boolean;
  };
}

export interface MarketingSegment {
  id: string;
  name: string;
  description?: string | null;
  filters: AudienceFilters;
  is_system: boolean;
  agent_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  subject?: string | null;
  body_html: string;
  is_system: boolean;
  is_favorite: boolean;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  agent_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  channel: MarketingChannel;
  subject?: string | null;
  preview_text?: string | null;
  from_name?: string | null;
  from_email?: string | null;
  reply_to?: string | null;
  segment_id?: string | null;
  template_id?: string | null;
  content_html?: string | null;
  content_text?: string | null;
  scheduled_at?: string | null;
  sent_at?: string | null;
  status: CampaignStatus;
  total_matched: number;
  valid_recipients: number;
  excluded_duplicates: number;
  excluded_invalid_email: number;
  excluded_unsubscribed: number;
  excluded_bounced: number;
  agent_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingCampaignRecipient {
  id: string;
  campaign_id: string;
  client_id?: string | null;
  lead_id?: string | null;
  recipient_email: string;
  provider_message_id?: string | null;
  unsubscribe_token?: string | null;
  status: RecipientStatus;
  exclusion_reason?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  created_at: string;
}

export interface MarketingDeliveryEvent {
  id: string;
  campaign_id: string;
  recipient_id?: string | null;
  provider_event_id?: string | null;
  event_type: DeliveryEventType;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface MarketingSuppression {
  id: string;
  email: string;
  reason: SuppressionReason;
  details?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface MarketingSenderAccount {
  id: string;
  agent_id?: string | null;
  provider: SenderProvider;
  from_name: string;
  from_email: string;
  reply_to?: string | null;
  is_default: boolean;
  status: SenderStatus;
  spf_status: DomainAuthStatus;
  dkim_status: DomainAuthStatus;
  dmarc_status: DomainAuthStatus;
  sender_eligibility_status: SenderEligibilityStatus;
  provider_account_id?: string | null;
  token_expires_at?: string | null;
  connected_at?: string | null;
  disconnected_at?: string | null;
  reply_to_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface VerifiedSendingIdentity {
  id: string;
  name: string;
  fromAddress: string;
  replyToAddress: string;
  domain: string;
  domainStatus: DomainAuthStatus;
  isEligibleForFrom: boolean;
}

export interface MarketingAutomation {
  id: string;
  name: string;
  trigger_type: AutomationTrigger;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED';
  template_id?: string | null;
  config?: Record<string, any>;
  agent_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafetyCheckSummary {
  totalMatched: number;
  validRecipients: number;
  excludedDuplicates: number;
  excludedInvalidEmail: number;
  excludedUnsubscribed: number;
  excludedBounced: number;
  excludedNoConsent: number;
  details: Array<{
    email: string;
    name: string;
    clientId?: string;
    leadId?: string;
    carrier?: string;
    policyStatus?: string;
    state?: string;
    assignedAgent?: string;
    expirationDate?: string;
    isExcluded: boolean;
    reason?: string;
  }>;
}

export interface ResendDomainInfo {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  records: Array<{
    record: string;
    name: string;
    type: string;
    ttl: string;
    status: string;
    value: string;
  }>;
}

export type EmailBlockType =
  | 'heading'
  | 'text'
  | 'image'
  | 'button'
  | 'columns'
  | 'divider'
  | 'spacer'
  | 'social'
  | 'menu'
  | 'logo'
  | 'hero'
  | 'callout'
  | 'signature'
  | 'cta'
  | 'testimonial'
  | 'footer'
  | 'html';

export interface EmailBlock {
  id: string;
  type: EmailBlockType;
  headingText?: string;
  headingLevel?: 'h1' | 'h2' | 'h3';
  text?: string;
  imageUrl?: string;
  imageAlt?: string;
  imageWidth?: string;
  imageAlign?: 'left' | 'center' | 'right';
  buttonText?: string;
  buttonUrl?: string;
  buttonBgColor?: string;
  buttonTextColor?: string;
  buttonAlign?: 'left' | 'center' | 'right';
  buttonRadius?: string;
  col1Text?: string;
  col2Text?: string;
  col1ButtonText?: string;
  col1ButtonUrl?: string;
  col2ButtonText?: string;
  col2ButtonUrl?: string;
  lineColor?: string;
  lineThickness?: string;
  spaceHeight?: string;
  socialPlatforms?: Array<{ platform: string; url: string; icon: string }>;
  menuLinks?: Array<{ label: string; url: string }>;
  calloutTitle?: string;
  calloutText?: string;
  calloutBgColor?: string;
  agentName?: string;
  agentTitle?: string;
  agentPhone?: string;
  agentEmail?: string;
  quoteText?: string;
  quoteAuthor?: string;
  footerCompany?: string;
  footerAddress?: string;
  footerUnsubscribeText?: string;
  htmlContent?: string;
  // Common styling props
  align?: 'left' | 'center' | 'right';
  fontSize?: string;
  textColor?: string;
  bgColor?: string;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  borderRadius?: string;
}
