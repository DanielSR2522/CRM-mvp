/**
 * Utility functions for SSN formatting, normalization, and validation.
 * Re-exports centralized formatters from @/lib/formatters/ssn.
 */

import {
  formatSSN,
  normalizeSSN,
  maskSSN as maskSSNCentral,
  isValidSSNLength
} from '@/lib/formatters/ssn';

export const formatSsnInput = (val: string | null | undefined): string => {
  return formatSSN(val);
};

export const normalizeSsn = (val: string | null | undefined): string => {
  return normalizeSSN(val);
};

export const isValidSsn = (val: string | null | undefined, allowEmpty = true): boolean => {
  if (!val || !val.trim()) return allowEmpty;
  return isValidSSNLength(val);
};

export const maskSsn = (value: string | null | undefined, last4?: string): string => {
  if (last4 && last4.length === 4) {
    return `***-**-${last4}`;
  }
  return maskSSNCentral(value);
};
