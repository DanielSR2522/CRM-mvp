import { ColumnMapping, DestinationField, DestinationFieldId } from './types';

export const DESTINATION_FIELDS: DestinationField[] = [
  { id: 'ignore', label: 'Ignore column', group: 'other' },
  { id: 'client.full_name', label: 'Full Name', group: 'client' },
  { id: 'client.first_name', label: 'First Name', group: 'client' },
  { id: 'client.last_name', label: 'Last Name', group: 'client' },
  { id: 'client.date_of_birth', label: 'DOB', group: 'client' },
  { id: 'client.ssn', label: 'SSN', group: 'client' },
  { id: 'client.phone', label: 'Phone', group: 'client' },
  { id: 'client.email', label: 'Email', group: 'client' },
  { id: 'client.address', label: 'Address', group: 'client' },
  { id: 'client.city', label: 'City', group: 'client' },
  { id: 'client.state', label: 'State', group: 'client' },
  { id: 'client.zip', label: 'ZIP', group: 'client' },
  { id: 'client.agent', label: 'Agent', group: 'client' },
  { id: 'client.external_legacy_id', label: 'External / Legacy ID', group: 'client' },
  { id: 'client.notes', label: 'Notes', group: 'client' },
  { id: 'health_policy.carrier', label: 'Carrier', group: 'health_policy' },
  { id: 'health_policy.policy_number', label: 'Policy Number', group: 'health_policy' },
  { id: 'health_policy.member_id', label: 'Member ID', group: 'health_policy' },
  { id: 'health_policy.status', label: 'Status', group: 'health_policy' },
  { id: 'health_policy.effective_date', label: 'Effective Date', group: 'health_policy' },
  { id: 'health_policy.term_date', label: 'Term Date', group: 'health_policy' },
  { id: 'health_policy.premium', label: 'Premium', group: 'health_policy' },
  { id: 'health_policy.tax_credit', label: 'Tax Credit', group: 'health_policy' },
  { id: 'health_policy.plan', label: 'Plan', group: 'health_policy' },
  { id: 'health_policy.marketplace_application_id', label: 'Marketplace / Application ID', group: 'health_policy' },
  { id: 'health_policy.pending_action', label: 'Pending Action', group: 'health_policy' },
  { id: 'other.pending_action', label: 'Pending Action / Import Notes', group: 'other' },
  { id: 'other.import_notes', label: 'Import Notes', group: 'other' },
];

const ALIASES: Array<[RegExp, DestinationFieldId]> = [
  [/^record\s*id$/i, 'client.external_legacy_id'],
  [/^(nombre\s*aplicante|applicant\s*name|full\s*name|name)$/i, 'client.full_name'],
  [/^(first\s*name|nombre)$/i, 'client.first_name'],
  [/^(last\s*name|apellido)$/i, 'client.last_name'],
  [/^(agente\.name|agent|agent\s*name)$/i, 'client.agent'],
  [/^(dob|date\s*of\s*birth|fecha\s*de\s*nacimiento)$/i, 'client.date_of_birth'],
  [/^ssn$/i, 'client.ssn'],
  [/^(phone|telefono|teléfono|mobile|cell)$/i, 'client.phone'],
  [/^(email|correo)$/i, 'client.email'],
  [/^(direcci[oó]n\s*f[ií]sica|address|street)$/i, 'client.address'],
  [/^(ciudad|city)$/i, 'client.city'],
  [/^(estado\/provincia|state|estado)$/i, 'client.state'],
  [/^(c[oó]digo\s*postal|zip|zip\s*code|postal\s*code)$/i, 'client.zip'],
  [/^(acci[oó]n\s*pendiente|pending\s*action)$/i, 'other.pending_action'],
  [/^(carrier|company|aseguradora)$/i, 'health_policy.carrier'],
  [/^(policy\s*number|policy\s*#|numero\s*poliza|n[uú]mero\s*p[oó]liza)$/i, 'health_policy.policy_number'],
  [/^(member\s*id|membership|no\s*membership)$/i, 'health_policy.member_id'],
  [/^(status|policy\s*status)$/i, 'health_policy.status'],
  [/^(effective\s*date|fecha\s*efectiva)$/i, 'health_policy.effective_date'],
  [/^(term\s*date|termination\s*date|fecha\s*termino)$/i, 'health_policy.term_date'],
  [/^(premium|monthly\s*premium|plan\s*cost)$/i, 'health_policy.premium'],
  [/^(tax\s*credit|aptc)$/i, 'health_policy.tax_credit'],
  [/^(plan|plan\s*name)$/i, 'health_policy.plan'],
  [/^(marketplace\s*id|application\s*id|application\s*number)$/i, 'health_policy.marketplace_application_id'],
];

export function suggestMapping(columns: string[]): ColumnMapping {
  return columns.reduce<ColumnMapping>((mapping, column) => {
    const trimmed = column.trim();
    const match = ALIASES.find(([pattern]) => pattern.test(trimmed));
    mapping[column] = match?.[1] ?? 'ignore';
    return mapping;
  }, {});
}

export function getDestinationField(id: DestinationFieldId): DestinationField | undefined {
  return DESTINATION_FIELDS.find((field) => field.id === id);
}
