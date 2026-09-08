/**
 * Controlled Personalization System for Marketing Templates.
 * Only allowed variable tokens are substituted into message bodies.
 */

export interface PersonalizationContext {
  first_name?: string;
  last_name?: string;
  agent_name?: string;
  carrier?: string;
  policy_number?: string;
  client_email?: string;
  company_name?: string;
}

export const ALLOWED_PERSONALIZATION_VARIABLES = [
  { token: '{{first_name}}', label: 'First Name', example: 'John' },
  { token: '{{last_name}}', label: 'Last Name', example: 'Doe' },
  { token: '{{agent_name}}', label: 'Agent Name', example: 'Sarah Smith' },
  { token: '{{carrier}}', label: 'Insurance Carrier', example: 'Ambetter' },
  { token: '{{policy_number}}', label: 'Policy Number', example: 'POL-99201' },
];

export function replacePersonalizationTokens(
  templateText: string,
  context: PersonalizationContext
): string {
  if (!templateText) return '';

  let output = templateText;

  output = output.replace(/\{\{\s*first_name\s*\}\}/gi, context.first_name || 'Client');
  output = output.replace(/\{\{\s*last_name\s*\}\}/gi, context.last_name || '');
  output = output.replace(/\{\{\s*agent_name\s*\}\}/gi, context.agent_name || 'Your Agent');
  output = output.replace(/\{\{\s*carrier\s*\}\}/gi, context.carrier || 'Insurance Provider');
  output = output.replace(/\{\{\s*policy_number\s*\}\}/gi, context.policy_number || 'N/A');

  return output.trim();
}
