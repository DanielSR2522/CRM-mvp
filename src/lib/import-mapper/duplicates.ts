import {
  DuplicateCandidate,
  ExistingClientForDuplicate,
  NormalizedImportRecord,
} from './types';
import { normalizePhone, normalizeSsn } from './normalizers';

export function findDuplicateCandidates(
  record: NormalizedImportRecord,
  existingClients: ExistingClientForDuplicate[]
): DuplicateCandidate[] {
  const targetName = normalizeName(record.client.fullName);
  const targetEmail = record.client.email?.toLowerCase() ?? null;
  const targetPhone = digits(record.client.phone);
  const targetDob = record.client.dateOfBirth;
  const targetSsn = normalizeSsn(record.client.ssn);

  return existingClients
    .map((client) => {
      const reasons: string[] = [];
      let score = 0;
      const personal = client.personal ?? null;
      const clientEmail = (personal?.email || client.email || '').toLowerCase() || null;
      const clientPhone = digits(personal?.phone || client.phone || null);
      const clientSsn = normalizeSsn(personal?.ssn ?? null);
      const clientDob = personal?.date_of_birth ?? null;

      if (targetEmail && clientEmail && targetEmail === clientEmail) {
        score += 45;
        reasons.push('email');
      }
      if (targetPhone && clientPhone && targetPhone === clientPhone) {
        score += 35;
        reasons.push('phone');
      }
      if (targetSsn && clientSsn && targetSsn === clientSsn) {
        score += 40;
        reasons.push('ssn');
      }
      if (targetName && normalizeName(client.full_name) === targetName) {
        score += 25;
        reasons.push('name');
      }
      if (targetDob && clientDob && targetDob === clientDob) {
        score += 25;
        reasons.push('dob');
      }
      if (reasons.includes('name') && reasons.includes('dob')) score += 30;

      return {
        clientId: client.id,
        fullName: client.full_name,
        email: clientEmail,
        phone: clientPhone ? normalizePhone(clientPhone) : null,
        dateOfBirth: clientDob,
        ssn: clientSsn,
        score,
        reasons,
      };
    })
    .filter((candidate) => candidate.score >= 40)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function normalizeName(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function digits(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.replace(/\D/g, '');
  return clean.length >= 7 ? clean : null;
}
