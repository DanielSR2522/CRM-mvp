/**
 * WhatsApp Webhook endpoint alias — /api/whatsapp/webhook
 *
 * Delegates to the canonical webhook handler in src/app/api/webhooks/whatsapp/route.ts.
 * This guarantees that both URL structures:
 *   - /api/whatsapp/webhook (Meta dashboard preferred path)
 *   - /api/webhooks/whatsapp (module endpoint path)
 * execute the exact same GET (hub verification) and POST (status events) logic
 * without any code duplication.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export { GET, POST } from '@/app/api/webhooks/whatsapp/route';
