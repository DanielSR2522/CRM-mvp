export interface USStateOption {
  label: string;
  value: string;
  name: string;
}

export const US_STATES_52: USStateOption[] = [
  { label: 'Alabama — AL', value: 'AL', name: 'Alabama' },
  { label: 'Alaska — AK', value: 'AK', name: 'Alaska' },
  { label: 'Arizona — AZ', value: 'AZ', name: 'Arizona' },
  { label: 'Arkansas — AR', value: 'AR', name: 'Arkansas' },
  { label: 'California — CA', value: 'CA', name: 'California' },
  { label: 'Colorado — CO', value: 'CO', name: 'Colorado' },
  { label: 'Connecticut — CT', value: 'CT', name: 'Connecticut' },
  { label: 'Delaware — DE', value: 'DE', name: 'Delaware' },
  { label: 'Florida — FL', value: 'FL', name: 'Florida' },
  { label: 'Georgia — GA', value: 'GA', name: 'Georgia' },
  { label: 'Hawaii — HI', value: 'HI', name: 'Hawaii' },
  { label: 'Idaho — ID', value: 'ID', name: 'Idaho' },
  { label: 'Illinois — IL', value: 'IL', name: 'Illinois' },
  { label: 'Indiana — IN', value: 'IN', name: 'Indiana' },
  { label: 'Iowa — IA', value: 'IA', name: 'Iowa' },
  { label: 'Kansas — KS', value: 'KS', name: 'Kansas' },
  { label: 'Kentucky — KY', value: 'KY', name: 'Kentucky' },
  { label: 'Louisiana — LA', value: 'LA', name: 'Louisiana' },
  { label: 'Maine — ME', value: 'ME', name: 'Maine' },
  { label: 'Maryland — MD', value: 'MD', name: 'Maryland' },
  { label: 'Massachusetts — MA', value: 'MA', name: 'Massachusetts' },
  { label: 'Michigan — MI', value: 'MI', name: 'Michigan' },
  { label: 'Minnesota — MN', value: 'MN', name: 'Minnesota' },
  { label: 'Mississippi — MS', value: 'MS', name: 'Mississippi' },
  { label: 'Missouri — MO', value: 'MO', name: 'Missouri' },
  { label: 'Montana — MT', value: 'MT', name: 'Montana' },
  { label: 'Nebraska — NE', value: 'NE', name: 'Nebraska' },
  { label: 'Nevada — NV', value: 'NV', name: 'Nevada' },
  { label: 'New Hampshire — NH', value: 'NH', name: 'New Hampshire' },
  { label: 'New Jersey — NJ', value: 'NJ', name: 'New Jersey' },
  { label: 'New Mexico — NM', value: 'NM', name: 'New Mexico' },
  { label: 'New York — NY', value: 'NY', name: 'New York' },
  { label: 'North Carolina — NC', value: 'NC', name: 'North Carolina' },
  { label: 'North Dakota — ND', value: 'ND', name: 'North Dakota' },
  { label: 'Ohio — OH', value: 'OH', name: 'Ohio' },
  { label: 'Oklahoma — OK', value: 'OK', name: 'Oklahoma' },
  { label: 'Oregon — OR', value: 'OR', name: 'Oregon' },
  { label: 'Pennsylvania — PA', value: 'PA', name: 'Pennsylvania' },
  { label: 'Rhode Island — RI', value: 'RI', name: 'Rhode Island' },
  { label: 'South Carolina — SC', value: 'SC', name: 'South Carolina' },
  { label: 'South Dakota — SD', value: 'SD', name: 'South Dakota' },
  { label: 'Tennessee — TN', value: 'TN', name: 'Tennessee' },
  { label: 'Texas — TX', value: 'TX', name: 'Texas' },
  { label: 'Utah — UT', value: 'UT', name: 'Utah' },
  { label: 'Vermont — VT', value: 'VT', name: 'Vermont' },
  { label: 'Virginia — VA', value: 'VA', name: 'Virginia' },
  { label: 'Washington — WA', value: 'WA', name: 'Washington' },
  { label: 'West Virginia — WV', value: 'WV', name: 'West Virginia' },
  { label: 'Wisconsin — WI', value: 'WI', name: 'Wisconsin' },
  { label: 'Wyoming — WY', value: 'WY', name: 'Wyoming' },
  { label: 'District of Columbia — DC', value: 'DC', name: 'District of Columbia' },
  { label: 'Puerto Rico — PR', value: 'PR', name: 'Puerto Rico' }
];

/**
 * Converts state name or code to 2-letter uppercase state code.
 * E.g., 'Florida' -> 'FL', 'fl' -> 'FL', 'FL' -> 'FL'.
 */
export function normalizeStateToCode(input: string | null | undefined): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  const uppercase = trimmed.toUpperCase();
  const matchByCode = US_STATES_52.find(s => s.value === uppercase);
  if (matchByCode) return matchByCode.value;

  const matchByName = US_STATES_52.find(s => s.name.toLowerCase() === trimmed.toLowerCase());
  if (matchByName) return matchByName.value;

  return uppercase.slice(0, 2);
}

/**
 * Returns formatted display label for a state code (e.g. 'FL' -> 'Florida (FL)' or 'FL').
 */
export function getStateDisplayLabel(code: string | null | undefined): string {
  if (!code) return '—';
  const norm = normalizeStateToCode(code);
  const found = US_STATES_52.find(s => s.value === norm);
  return found ? `${found.name} (${found.value})` : code;
}
