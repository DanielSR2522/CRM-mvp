import {
  ColumnMapping,
  DestinationFieldId,
  ImportSourceRow,
  NormalizationIssue,
  NormalizedImportRecord,
} from './types';
import {
  cellToString,
  normalizeDate,
  normalizeEmail,
  normalizeGender,
  normalizeMoney,
  normalizePhone,
  normalizePolicyStatus,
  normalizeSsn,
  normalizeState,
  normalizeTypePlan,
  normalizeZip,
  splitFullName,
} from './normalizers';

export function normalizeMappedRows(
  rows: ImportSourceRow[],
  mapping: ColumnMapping
): NormalizedImportRecord[] {
  return rows.map((row, index) => normalizeMappedRow(row, mapping, index + 2));
}

export function normalizeMappedRow(
  row: ImportSourceRow,
  mapping: ColumnMapping,
  rowNumber: number
): NormalizedImportRecord {
  const issues: NormalizationIssue[] = [];
  const values = collectMappedValues(row, mapping);
  const fullName = valueFor(values, 'client.full_name');
  const split = splitFullName(fullName);
  const firstName = valueFor(values, 'client.first_name') ?? split.firstName;
  const lastName = valueFor(values, 'client.last_name') ?? split.lastName;
  const derivedFullName = fullName ?? ([firstName, lastName].filter(Boolean).join(' ') || null);
  const dateOfBirth = normalizeDate(firstCell(values, 'client.date_of_birth'));
  const effectiveDate = normalizeDate(firstCell(values, 'health_policy.effective_date'));
  const termDate = normalizeDate(firstCell(values, 'health_policy.term_date'));

  if (!derivedFullName) {
    issues.push({ field: 'client.full_name', severity: 'error', message: 'Missing client name.' });
  }
  if (firstCell(values, 'client.date_of_birth') && !dateOfBirth) {
    issues.push({ field: 'client.date_of_birth', severity: 'warning', message: 'Date of birth could not be parsed.' });
  }
  if (firstCell(values, 'health_policy.effective_date') && !effectiveDate) {
    issues.push({ field: 'health_policy.effective_date', severity: 'warning', message: 'Effective date could not be parsed.' });
  }
  if (firstCell(values, 'health_policy.term_date') && !termDate) {
    issues.push({ field: 'health_policy.term_date', severity: 'warning', message: 'Term date could not be parsed.' });
  }

  return {
    rowNumber,
    source: row,
    client: {
      fullName: derivedFullName,
      firstName,
      lastName,
      dateOfBirth,
      ssn: normalizeSsn(firstCell(values, 'client.ssn'), issues),
      gender: normalizeGender(firstCell(values, 'client.gender')),
      phone: normalizePhone(firstCell(values, 'client.phone')),
      email: normalizeEmail(firstCell(values, 'client.email')),
      address: valueFor(values, 'client.address'),
      city: valueFor(values, 'client.city'),
      state: normalizeState(firstCell(values, 'client.state')),
      zip: normalizeZip(firstCell(values, 'client.zip')),
      county: valueFor(values, 'client.county'),
      agentName: valueFor(values, 'client.agent'),
      externalLegacyId: valueFor(values, 'client.external_legacy_id'),
      notes: valueFor(values, 'client.notes'),
    },
    healthPolicy: {
      carrier: valueFor(values, 'health_policy.carrier'),
      policyNumber: valueFor(values, 'health_policy.policy_number'),
      planId: valueFor(values, 'health_policy.plan_id'),
      memberId: valueFor(values, 'health_policy.member_id'),
      typePlan: normalizeTypePlan(firstCell(values, 'health_policy.type_plan')),
      status: normalizePolicyStatus(firstCell(values, 'health_policy.status')),
      effectiveDate,
      termDate,
      premium: normalizeMoney(firstCell(values, 'health_policy.premium')),
      taxCredit: normalizeMoney(firstCell(values, 'health_policy.tax_credit')),
      plan: valueFor(values, 'health_policy.plan'),
      marketplaceApplicationId: valueFor(values, 'health_policy.marketplace_application_id'),
      pendingAction: valueFor(values, 'health_policy.pending_action') ?? valueFor(values, 'other.pending_action'),
    },
    importNotes: valueFor(values, 'other.import_notes') ?? valueFor(values, 'other.pending_action'),
    pendingAction: valueFor(values, 'other.pending_action'),
    issues,
  };
}

function collectMappedValues(
  row: ImportSourceRow,
  mapping: ColumnMapping
): Partial<Record<DestinationFieldId, Array<string | number | boolean | Date | null>>> {
  const values: Partial<Record<DestinationFieldId, Array<string | number | boolean | Date | null>>> = {};
  Object.entries(mapping).forEach(([column, destination]) => {
    if (destination === 'ignore') return;
    values[destination] = values[destination] ?? [];
    values[destination]?.push(row[column] ?? null);
  });
  return values;
}

function firstCell(
  values: Partial<Record<DestinationFieldId, Array<string | number | boolean | Date | null>>>,
  field: DestinationFieldId
) {
  return values[field]?.[0] ?? null;
}

function valueFor(
  values: Partial<Record<DestinationFieldId, Array<string | number | boolean | Date | null>>>,
  field: DestinationFieldId
): string | null {
  const joined = (values[field] ?? [])
    .map((value) => cellToString(value))
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .trim();
  return joined || null;
}
