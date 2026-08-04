import { supabase } from '@/lib/supabaseClient';

export type BusinessLine = 'health' | 'life' | 'property_casualty' | 'supplemental';

export const ALL_BUSINESS_LINES: { id: BusinessLine; label: string }[] = [
  { id: 'health', label: 'Health' },
  { id: 'life', label: 'Life' },
  { id: 'property_casualty', label: 'Property & Casualty' },
  { id: 'supplemental', label: 'Supplemental' },
];

export const DEFAULT_BUSINESS_LINES: BusinessLine[] = [
  'health',
  'life',
  'property_casualty',
  'supplemental'
];

/**
 * Fetches the business lines configuration for an agent from public.profiles
 */
export async function fetchAgentBusinessLines(userId: string): Promise<BusinessLine[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('business_lines')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data || !Array.isArray(data.business_lines) || data.business_lines.length === 0) {
      return DEFAULT_BUSINESS_LINES;
    }

    // Filter to ensure only valid BusinessLine strings are included
    const validLines = data.business_lines.filter((b: any): b is BusinessLine =>
      DEFAULT_BUSINESS_LINES.includes(b as BusinessLine)
    );

    return validLines.length > 0 ? validLines : DEFAULT_BUSINESS_LINES;
  } catch (err) {
    console.error('Error fetching agent business lines:', err);
    return DEFAULT_BUSINESS_LINES;
  }
}

/**
 * Updates the business lines configuration for an agent in public.profiles
 */
export async function updateAgentBusinessLines(userId: string, lines: BusinessLine[]): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      business_lines: lines,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (error) {
    throw error;
  }
}
