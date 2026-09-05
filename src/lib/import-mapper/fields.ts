import { ColumnMapping, DestinationField, DestinationFieldId } from './types';

export const DESTINATION_FIELDS: DestinationField[] = [
  { id: 'ignore', label: 'Ignore column', group: 'other' },

  // CLIENT FIELDS
  { id: 'client.full_name', label: 'Full Name', group: 'client' },
  { id: 'client.first_name', label: 'First Name', group: 'client' },
  { id: 'client.last_name', label: 'Last Name', group: 'client' },
  { id: 'client.date_of_birth', label: 'DOB / Date of Birth', group: 'client' },
  { id: 'client.ssn', label: 'SSN', group: 'client' },
  { id: 'client.gender', label: 'Gender', group: 'client' },
  { id: 'client.phone', label: 'Primary Phone', group: 'client' },
  { id: 'client.email', label: 'Primary Email', group: 'client' },
  { id: 'client.address', label: 'Street Address', group: 'client' },
  { id: 'client.city', label: 'City', group: 'client' },
  { id: 'client.state', label: 'State', group: 'client' },
  { id: 'client.zip', label: 'ZIP Code', group: 'client' },
  { id: 'client.county', label: 'County', group: 'client' },
  { id: 'client.agent', label: 'Agent', group: 'client' },
  { id: 'client.external_legacy_id', label: 'External / Legacy ID', group: 'client' },
  { id: 'client.notes', label: 'Notes', group: 'client' },

  // HEALTH POLICY FIELDS
  { id: 'health_policy.carrier', label: 'Carrier / Company', group: 'health_policy' },
  { id: 'health_policy.policy_number', label: 'Policy Number', group: 'health_policy' },
  { id: 'health_policy.plan_id', label: 'Plan ID', group: 'health_policy' },
  { id: 'health_policy.member_id', label: 'Member ID / Membership Number', group: 'health_policy' },
  { id: 'health_policy.type_plan', label: 'Plan Type / Metal Tier', group: 'health_policy' },
  { id: 'health_policy.status', label: 'Status', group: 'health_policy' },
  { id: 'health_policy.effective_date', label: 'Effective Date', group: 'health_policy' },
  { id: 'health_policy.term_date', label: 'Term Date', group: 'health_policy' },
  { id: 'health_policy.premium', label: 'Premium / Plan Cost', group: 'health_policy' },
  { id: 'health_policy.tax_credit', label: 'Tax Credit / APTC', group: 'health_policy' },
  { id: 'health_policy.plan', label: 'Plan Name', group: 'health_policy' },
  { id: 'health_policy.marketplace_application_id', label: 'Application Number', group: 'health_policy' },
  { id: 'health_policy.pending_action', label: 'Pending Action', group: 'health_policy' },

  // OTHER FIELDS
  { id: 'other.pending_action', label: 'Pending Action / Import Notes', group: 'other' },
  { id: 'other.import_notes', label: 'Import Notes', group: 'other' },
];

const ALIASES: Array<[RegExp, DestinationFieldId]> = [
  [/^(record\s*id|legacy\s*id|external\s*id|client\s*id|id\s*cliente)$/i, 'client.external_legacy_id'],
  [/^(nombre\s*aplicante|applicant\s*name|full\s*name|client\s*name|nombre\s*completo|name|cliente)$/i, 'client.full_name'],
  [/^(first\s*name|nombre|primer\s*nombre)$/i, 'client.first_name'],
  [/^(last\s*name|apellido|apellidos)$/i, 'client.last_name'],
  [/^(agente\.name|agent|agent\s*name|nombre\s*agente|producer)$/i, 'client.agent'],
  [/^(dob|date\s*of\s*birth|birth\s*date|fecha\s*de\s*nacimiento|nacimiento)$/i, 'client.date_of_birth'],
  [/^(ssn|social\s*security|social\s*security\s*number|seguro\s*social)$/i, 'client.ssn'],
  [/^(gender|sex|g[eé]nero|sexo)$/i, 'client.gender'],
  [/^(primary\s*phone|phone|phone\s*number|mobile|cell|cell\s*phone|telephone|teléfono|telefono|celular|tel[eé]fono\s*principal)$/i, 'client.phone'],
  [/^(primary\s*email|email|email\s*address|e-mail|correo|correo\s*electr[oó]nico|correo\s*principal)$/i, 'client.email'],
  [/^(street\s*address|address\s*1|address1|home\s*address|mailing\s*address|street|address|direcci[oó]n(\s*f[ií]sica)?|residence\s*address)$/i, 'client.address'],
  [/^(ciudad|city)$/i, 'client.city'],
  [/^(estado\/provincia|state|estado)$/i, 'client.state'],
  [/^(c[oó]digo\s*postal|zip|zip\s*code|postal\s*code)$/i, 'client.zip'],
  [/^(county|county\s*name|condado)$/i, 'client.county'],
  [/^(acci[oó]n\s*pendiente|pending\s*action)$/i, 'other.pending_action'],
  [/^(carrier|company(\s*\d{4})?|insurance\s*company|insurer|health\s*plan\s*company|aseguradora|compa[nñ][ií]a)$/i, 'health_policy.carrier'],
  [/^(policy\s*number|policy\s*#|numero\s*poliza|n[uú]mero\s*p[oó]liza|policy\s*id)$/i, 'health_policy.policy_number'],
  [/^(plan\s*id|plan\s*identifier|marketplace\s*plan\s*id|hios\s*plan\s*id|id\s*de\s*plan)$/i, 'health_policy.plan_id'],
  [/^(member\s*id|membership|no\.?\s*membership|membership\s*number|member\s*number|policy\s*member\s*id|subscriber\s*id|n[uú]mero\s*de\s*miembro)$/i, 'health_policy.member_id'],
  [/^(type\s*plan|plan\s*type|metal\s*level|metal\s*tier|coverage\s*type|tipo\s*de\s*plan)$/i, 'health_policy.type_plan'],
  [/^(status|policy\s*status|estado\s*de\s*p[oó]liza)$/i, 'health_policy.status'],
  [/^(effective_date|effective\s*date|coverage\s*effective\s*date|start\s*date|policy\s*effective\s*date|fecha\s*efectiva)$/i, 'health_policy.effective_date'],
  [/^(term\s*date|termination\s*date|end\s*date|fecha\s*termino|fecha\s*t[eé]rmino)$/i, 'health_policy.term_date'],
  [/^(premium|monthly\s*premium|plan\s*cost|prima|costo\s*del\s*plan)$/i, 'health_policy.premium'],
  [/^(tax\s*credit|aptc|cr[eé]dito\s*fiscal)$/i, 'health_policy.tax_credit'],
  [/^(plan|plan\s*name|nombre\s*del\s*plan)$/i, 'health_policy.plan'],
  [/^(application\s*number(\s*\d{4})?|application\s*id|application\s*#|marketplace\s*application\s*id|marketplace\s*id|n[uú]mero\s*de\s*solicitud)$/i, 'health_policy.marketplace_application_id'],
];

export function suggestMapping(columns: string[]): ColumnMapping {
  return columns.reduce<ColumnMapping>((mapping, column) => {
    const trimmed = column.trim();
    // Normalize underscores and multiple spaces for matching
    const normalized = trimmed.replace(/_/g, ' ').replace(/\s+/g, ' ');
    const match = ALIASES.find(([pattern]) => pattern.test(trimmed) || pattern.test(normalized));
    mapping[column] = match?.[1] ?? 'ignore';
    return mapping;
  }, {});
}

export function getDestinationField(id: DestinationFieldId): DestinationField | undefined {
  return DESTINATION_FIELDS.find((field) => field.id === id);
}
