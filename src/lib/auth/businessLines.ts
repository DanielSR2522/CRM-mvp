import { supabase } from '@/lib/supabaseClient';

export type BusinessLine = 'health' | 'medicare' | 'life' | 'property_casualty' | 'supplemental';

export const ALL_BUSINESS_LINES: { id: BusinessLine; label: string }[] = [
  { id: 'health', label: 'Health' },
  { id: 'medicare', label: 'Medicare' },
  { id: 'life', label: 'Life' },
  { id: 'property_casualty', label: 'Property & Casualty' },
  { id: 'supplemental', label: 'Supplemental' },
];

export const DEFAULT_BUSINESS_LINES: BusinessLine[] = [
  'health',
  'medicare',
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

    console.log('LOADED BUSINESS LINES FROM DB SERVICE:', data ? data.business_lines : null);

    if (error || !data || data.business_lines === null || data.business_lines === undefined || !Array.isArray(data.business_lines)) {
      return DEFAULT_BUSINESS_LINES;
    }

    // Filter to ensure only valid BusinessLine strings are included
    const validLines = data.business_lines.filter((b: any): b is BusinessLine =>
      DEFAULT_BUSINESS_LINES.includes(b as BusinessLine)
    );

    return validLines;
  } catch (err) {
    console.error('Error fetching agent business lines:', err);
    return DEFAULT_BUSINESS_LINES;
  }
}

/**
 * Updates the business lines configuration for an agent in public.profiles using controlled upsert
 */
export async function updateAgentBusinessLines(userId: string, lines: BusinessLine[]): Promise<BusinessLine[]> {
  const { data: existing } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', userId)
    .maybeSingle();

  const nameVal = existing?.name || existing?.email || 'Agent Profile';

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      name: nameVal,
      business_lines: lines,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' })
    .select('id, business_lines')
    .maybeSingle();

  if (error || !data) {
    console.error('Supabase business_lines upsert error:', error);
    throw error || new Error('Failed to save business lines to database.');
  }

  console.log('SAVED BUSINESS LINES VIA SERVICE:', data.business_lines);
  return data.business_lines;
}
