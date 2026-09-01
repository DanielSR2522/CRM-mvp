import { NormalizedCarrierRecord, MatchStatusType } from './types';

export interface CrmClientCandidate {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
}

export interface MatchEngineResult {
  external_member_id: string;
  client_id: string | null;
  match_status: MatchStatusType;
  confidence_score: number;
  match_method: string;
}

function normalizePhone(phoneStr?: string | null): string {
  if (!phoneStr) return '';
  const digits = phoneStr.replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

function normalizeName(nameStr?: string | null): string {
  if (!nameStr) return '';
  return nameStr.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function calculateMatchScore(
  record: NormalizedCarrierRecord,
  client: CrmClientCandidate
): { score: number; methods: string[] } {
  let score = 0;
  const methods: string[] = [];

  // 1. Exact DOB match: +40
  if (record.date_of_birth && client.date_of_birth) {
    const recordDob = record.date_of_birth.trim();
    const clientDob = client.date_of_birth.trim();
    if (recordDob === clientDob) {
      score += 40;
      methods.push('dob');
    }
  }

  // 2. Exact Email match: +30
  if (record.email && client.email) {
    const recordEmail = record.email.toLowerCase().trim();
    const clientEmail = client.email.toLowerCase().trim();
    if (recordEmail && recordEmail === clientEmail) {
      score += 30;
      methods.push('email');
    }
  }

  // 3. Exact Phone match: +20
  if (record.phone && client.phone) {
    const recordPhone = normalizePhone(record.phone);
    const clientPhone = normalizePhone(client.phone);
    if (recordPhone && recordPhone === clientPhone) {
      score += 20;
      methods.push('phone');
    }
  }

  // 4. Name match: +10
  if (record.member_name && client.full_name) {
    const recordName = normalizeName(record.member_name);
    const clientName = normalizeName(client.full_name);
    if (recordName && clientName && (recordName === clientName || recordName.includes(clientName) || clientName.includes(recordName))) {
      score += 10;
      methods.push('name');
    }
  }

  return { score, methods };
}

export function evaluateRecordMatch(
  record: NormalizedCarrierRecord,
  clients: CrmClientCandidate[],
  existingMatch?: { client_id?: string | null; match_status: MatchStatusType; confidence_score?: number; match_method?: string | null }
): MatchEngineResult {
  // If previously manually confirmed or ignored, preserve the user decision
  if (existingMatch && (existingMatch.match_status === 'matched' || existingMatch.match_status === 'ignored')) {
    return {
      external_member_id: record.external_member_id,
      client_id: existingMatch.client_id || null,
      match_status: existingMatch.match_status,
      confidence_score: existingMatch.confidence_score || 100,
      match_method: existingMatch.match_method || 'manual_confirmed',
    };
  }

  let bestClient: CrmClientCandidate | null = null;
  let bestScore = 0;
  let bestMethods: string[] = [];

  for (const client of clients) {
    const { score, methods } = calculateMatchScore(record, client);
    if (score > bestScore) {
      bestScore = score;
      bestClient = client;
      bestMethods = methods;
    }
  }

  let status: MatchStatusType = 'unmatched';
  if (bestScore >= 95) {
    status = 'matched';
  } else if (bestScore >= 70) {
    status = 'review';
  }

  return {
    external_member_id: record.external_member_id,
    client_id: bestScore >= 70 && bestClient ? bestClient.id : null,
    match_status: status,
    confidence_score: bestScore,
    match_method: bestMethods.length > 0 ? bestMethods.join('+') : 'none',
  };
}
