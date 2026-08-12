export interface AddressSource {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  county?: string | null;
}

/**
 * Cleanly formats available address fields into a standard US address string.
 * Example: "8101 SW 90 Ter, Miami, FL 33156"
 * Returns null if no valid address parts exist.
 */
export function formatAddressParts(parts?: AddressSource | null): string | null {
  if (!parts) return null;

  const street = (parts.address || '').trim();
  const city = (parts.city || '').trim();
  const state = (parts.state || parts.county || '').trim();
  const zip = (parts.zip_code || '').trim();

  if (!street && !city && !state && !zip) {
    return null;
  }

  const cityStateZipParts: string[] = [];
  if (city) {
    cityStateZipParts.push(city);
  }

  const stateZip = [state, zip].filter(Boolean).join(' ');
  if (stateZip) {
    cityStateZipParts.push(stateZip);
  }

  const cityStateZip = cityStateZipParts.join(', ');

  if (street && cityStateZip) {
    return `${street}, ${cityStateZip}`;
  } else if (street) {
    return street;
  } else if (cityStateZip) {
    return cityStateZip;
  }

  return null;
}

/**
 * Resolves effective policy address with strict priority:
 * 1. Policy Address (address, city, state, zip_code on policy record)
 * 2. Personal Info Address (from client_residence_information or client record)
 * 3. Fallback: "—"
 */
export function resolvePolicyAddress(
  policy?: AddressSource | null,
  residenceInfo?: AddressSource | null,
  clientRecord?: AddressSource | null
): string {
  // 1. Policy Address FIRST
  const policyAddr = formatAddressParts(policy);
  if (policyAddr) {
    return policyAddr;
  }

  // 2. Personal Info Address SECOND (client_residence_information)
  const residenceAddr = formatAddressParts(residenceInfo);
  if (residenceAddr) {
    return residenceAddr;
  }

  // 3. Client Record Address THIRD (client table fallback)
  const clientAddr = formatAddressParts(clientRecord);
  if (clientAddr) {
    return clientAddr;
  }

  // 4. Default if empty: "—"
  return '—';
}
