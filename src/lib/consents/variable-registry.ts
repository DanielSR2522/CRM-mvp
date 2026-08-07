import { formatIsoToUsDate } from '@/utils/dateUtils';

export interface RegistryVariable {
  token: string;
  label: string;
  group?: string;
  sourceTable: string;
  sourceField: string;
  description?: string;
  example: string;
  requiresClient?: boolean;
  requiresPolicy?: boolean;
  policyCategory?: 'health' | 'pc' | 'life';
  aliases?: string[];
}

export interface RegistryGroup {
  key: string;
  label: string;
  icon?: string;
  variables: RegistryVariable[];
}

export const VARIABLE_REGISTRY: RegistryGroup[] = [
  {
    key: 'client_identity',
    label: 'Client Identity',
    icon: '👤',
    variables: [
      { token: 'client.full_name', label: 'Full Name', group: 'Client Identity', sourceTable: 'clients', sourceField: 'full_name', example: 'Maria Elena Pabon', requiresClient: true },
      { token: 'client.first_name', label: 'First Name', group: 'Client Identity', sourceTable: 'clients', sourceField: 'full_name', example: 'Maria', requiresClient: true },
      { token: 'client.last_name', label: 'Last Name', group: 'Client Identity', sourceTable: 'clients', sourceField: 'full_name', example: 'Pabon', requiresClient: true },
      { token: 'client.email', label: 'Email Address', group: 'Client Identity', sourceTable: 'clients', sourceField: 'email', example: 'maria@example.com', requiresClient: true },
      { token: 'client.secondary_email', label: 'Secondary Email', group: 'Client Identity', sourceTable: 'client_personal_information', sourceField: 'secondary_email', example: 'maria.work@example.com', requiresClient: true },
      { token: 'client.phone', label: 'Phone Number', group: 'Client Identity', sourceTable: 'clients', sourceField: 'phone', example: '(305) 555-0148', requiresClient: true },
      { token: 'client.secondary_phone', label: 'Secondary Phone', group: 'Client Identity', sourceTable: 'client_personal_information', sourceField: 'secondary_phone', example: '(305) 555-0199', requiresClient: true },
      { token: 'client.date_of_birth', label: 'Date of Birth', group: 'Client Identity', sourceTable: 'client_personal_information', sourceField: 'date_of_birth', example: '04/17/1985', requiresClient: true },
      { token: 'client.age', label: 'Age', group: 'Client Identity', sourceTable: 'client_personal_information', sourceField: 'date_of_birth', example: '41', requiresClient: true },
      { token: 'client.gender', label: 'Gender', group: 'Client Identity', sourceTable: 'client_personal_information', sourceField: 'gender', example: 'Female', requiresClient: true },
      { token: 'client.marital_status', label: 'Marital Status', group: 'Client Identity', sourceTable: 'client_personal_information', sourceField: 'marital_status', example: 'Married', requiresClient: true },
      { token: 'client.immigration_status', label: 'Immigration Status', group: 'Client Identity', sourceTable: 'client_personal_information', sourceField: 'immigration_status', example: 'Resident', requiresClient: true },
      { token: 'client.agency_name', label: 'Agency Name', group: 'Client Identity', sourceTable: 'clients', sourceField: 'agency_name', example: 'Sunstate Insurance', requiresClient: true },
      { token: 'client.ssn_last4', label: 'SSN (Last 4 Digits)', group: 'Client Identity', sourceTable: 'client_personal_information', sourceField: 'ssn', example: '***-**-6789', requiresClient: true },
    ],
  },
  {
    key: 'client_address',
    label: 'Client Address',
    icon: '🏠',
    variables: [
      { token: 'client.address', label: 'Street Address', group: 'Client Address', sourceTable: 'client_residence_information', sourceField: 'address', example: '820 NW 12th Ave', requiresClient: true },
      { token: 'client.address_line_2', label: 'Address Line 2', group: 'Client Address', sourceTable: 'client_residence_information', sourceField: 'address_line_2', example: 'Apt 4B', requiresClient: true },
      { token: 'client.city', label: 'City', group: 'Client Address', sourceTable: 'client_residence_information', sourceField: 'city', example: 'Miami', requiresClient: true },
      { token: 'client.county', label: 'County', group: 'Client Address', sourceTable: 'client_residence_information', sourceField: 'county', example: 'Miami-Dade', requiresClient: true },
      { token: 'client.state', label: 'State', group: 'Client Address', sourceTable: 'client_residence_information', sourceField: 'state', example: 'FL', requiresClient: true },
      { token: 'client.zip_code', label: 'ZIP Code', group: 'Client Address', sourceTable: 'client_residence_information', sourceField: 'zip_code', example: '33136', requiresClient: true },
      { token: 'client.full_address', label: 'Full Combined Address', group: 'Client Address', sourceTable: 'client_residence_information', sourceField: 'address', example: '820 NW 12th Ave, Miami, FL 33136', requiresClient: true },
    ],
  },
  {
    key: 'client_household',
    label: 'Household & Income',
    icon: '💼',
    variables: [
      { token: 'client.total_income', label: 'Total Annual Household Income', group: 'Household & Income', sourceTable: 'health_policies', sourceField: 'household_income', example: '$45,000.00', requiresClient: true, requiresPolicy: true, policyCategory: 'health' },
      { token: 'client.tax_household_size', label: 'Tax Household Size', group: 'Household & Income', sourceTable: 'health_policies', sourceField: 'number_of_people_on_tax_return', example: '3', requiresClient: true, requiresPolicy: true, policyCategory: 'health' },
      { token: 'client.coverage_members_count', label: 'Coverage Members Count', group: 'Household & Income', sourceTable: 'health_policies', sourceField: 'coverage_members_count', example: '2', requiresClient: true, requiresPolicy: true, policyCategory: 'health' },
    ],
  },
  {
    key: 'agent',
    label: 'Agent Information',
    icon: '🛡️',
    variables: [
      { token: 'agent.full_name', label: 'Agent Full Name', group: 'Agent Information', sourceTable: 'profiles', sourceField: 'name', example: 'Sebastian Gomez' },
      { token: 'agent.first_name', label: 'Agent First Name', group: 'Agent Information', sourceTable: 'profiles', sourceField: 'first_name', example: 'Sebastian' },
      { token: 'agent.last_name', label: 'Agent Last Name', group: 'Agent Information', sourceTable: 'profiles', sourceField: 'last_name', example: 'Gomez' },
      { token: 'agent.email', label: 'Agent Email', group: 'Agent Information', sourceTable: 'profiles', sourceField: 'email', example: 'agent@sunstate.com' },
      { token: 'agent.phone', label: 'Agent Phone', group: 'Agent Information', sourceTable: 'profiles', sourceField: 'phone', example: '(305) 555-0100' },
      { token: 'agent.agency_name', label: 'Agent Agency Name', group: 'Agent Information', sourceTable: 'profiles', sourceField: 'agency_name', example: 'Sunstate Insurance Group' },
      { token: 'agent.npn', label: 'Agent NPN (National Producer Number)', group: 'Agent Information', sourceTable: 'profiles', sourceField: 'npn_number', example: '19827461' },
      { token: 'agent.license_number', label: 'Agent License Number', group: 'Agent Information', sourceTable: 'profiles', sourceField: 'license_number', example: 'FL-W382910' },
      { token: 'agent.license_state', label: 'Agent License State', group: 'Agent Information', sourceTable: 'profiles', sourceField: 'state', example: 'FL' },
      { token: 'agent.business_address', label: 'Agent Business Address', group: 'Agent Information', sourceTable: 'profiles', sourceField: 'address', example: '100 Biscayne Blvd Ste 1200' },
      { token: 'agent.city', label: 'Agent City', group: 'Agent Information', sourceTable: 'profiles', sourceField: 'city', example: 'Miami' },
      { token: 'agent.state', label: 'Agent State', group: 'Agent Information', sourceTable: 'profiles', sourceField: 'state', example: 'FL' },
      { token: 'agent.zip_code', label: 'Agent ZIP Code', group: 'Agent Information', sourceTable: 'profiles', sourceField: 'zip_code', example: '33132' },
      { token: 'agent.website', label: 'Agent Website', group: 'Agent Information', sourceTable: 'profiles', sourceField: 'website', example: 'https://sunstateinsurance.com' },
    ],
  },
  {
    key: 'health',
    label: 'Health Policy',
    icon: '🏥',
    variables: [
      { token: 'health.plan_name', label: 'Health Plan Name', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'plan_name', example: 'Florida Blue Silver 1410', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.plan_id', label: 'Health Plan ID', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'plan_id', example: '21984FL0010001', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.policy_number', label: 'Health Plan ID / Policy Number', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'plan_id', example: '21984FL0010001', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.application_number', label: 'Application Number', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'application_number', example: 'APP-2026-98124', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.marketplace_id', label: 'Marketplace Account ID', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'marketplace_account', example: 'FFM-88123-FL', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.carrier', label: 'Insurance Carrier', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'company_2026', example: 'Florida Blue', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.company', label: 'Carrier Company', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'company_2026', example: 'Florida Blue', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.renovation_status', label: 'Renovation Status', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'renovation_status', example: 'Active Renovation', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.enrolled', label: 'Enrolled Status', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'active', example: 'Yes', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.effective_date', label: 'Effective Date', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'effective_date', example: '01/01/2026', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.monthly_premium', label: 'Monthly Premium Cost', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'plan_cost', example: '$85.00', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.tax_credit', label: 'Monthly Tax Credit (APTC)', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'tax_credit', example: '$450.00', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.household_income', label: 'Household Annual Income', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'household_income', example: '$32,000.00', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.tax_household_size', label: 'Tax Household Size', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'number_of_people_on_tax_return', example: '2', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.coverage_members_count', label: 'Coverage Members Count', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'coverage_members_count', example: '2', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.agent_name', label: 'Writing Agent Name / NPN', group: 'Health Policy', sourceTable: 'health_policies', sourceField: 'npn', example: 'NPN 19827461', requiresPolicy: true, policyCategory: 'health' },
    ],
  },
  {
    key: 'health_household',
    label: 'Health Household Members',
    icon: '👨‍👩‍👧',
    variables: [
      { token: 'health.tax_members_count', label: 'Tax Household Members Count', group: 'Health Household Members', sourceTable: 'health_policies', sourceField: 'number_of_people_on_tax_return', example: '3', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.tax_members_names', label: 'Tax Household Members Names', group: 'Health Household Members', sourceTable: 'client_personal_information', sourceField: 'tax_members', example: 'John Doe (Self), Jane Doe (Spouse)', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.coverage_members_names', label: 'Coverage Members Names', group: 'Health Household Members', sourceTable: 'client_personal_information', sourceField: 'tax_members', example: 'John Doe, Jane Doe', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.tax_member_1.full_name', label: 'Member 1 Full Name', group: 'Health Household Members', sourceTable: 'client_personal_information', sourceField: 'tax_members[0]', example: 'John Doe', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.tax_member_1.date_of_birth', label: 'Member 1 Date of Birth', group: 'Health Household Members', sourceTable: 'client_personal_information', sourceField: 'tax_members[0]', example: '05/12/1982', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.tax_member_1.relationship', label: 'Member 1 Relationship', group: 'Health Household Members', sourceTable: 'client_personal_information', sourceField: 'tax_members[0]', example: 'Self', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.tax_member_2.full_name', label: 'Member 2 Full Name', group: 'Health Household Members', sourceTable: 'client_personal_information', sourceField: 'tax_members[1]', example: 'Jane Doe', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.tax_member_2.date_of_birth', label: 'Member 2 Date of Birth', group: 'Health Household Members', sourceTable: 'client_personal_information', sourceField: 'tax_members[1]', example: '08/24/1984', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.tax_member_2.relationship', label: 'Member 2 Relationship', group: 'Health Household Members', sourceTable: 'client_personal_information', sourceField: 'tax_members[1]', example: 'Spouse', requiresPolicy: true, policyCategory: 'health' },
      { token: 'health.tax_member_3.full_name', label: 'Member 3 Full Name', group: 'Health Household Members', sourceTable: 'client_personal_information', sourceField: 'tax_members[2]', example: 'Child Doe', requiresPolicy: true, policyCategory: 'health' },
    ],
  },
  {
    key: 'pc',
    label: 'Property & Casualty',
    icon: '🚗',
    variables: [
      { token: 'pc.policy_number', label: 'Policy Number', group: 'Property & Casualty', sourceTable: 'policies', sourceField: 'policy_number', example: 'FL-2210-88431', aliases: ['policy.policy_number'], requiresPolicy: true, policyCategory: 'pc' },
      { token: 'pc.policy_type', label: 'Policy Type / Line of Business', group: 'Property & Casualty', sourceTable: 'policies', sourceField: 'policy_type', example: 'Homeowners', aliases: ['policy.policy_type'], requiresPolicy: true, policyCategory: 'pc' },
      { token: 'pc.line_of_business', label: 'Line of Business', group: 'Property & Casualty', sourceTable: 'policies', sourceField: 'policy_type', example: 'Auto Personal', requiresPolicy: true, policyCategory: 'pc' },
      { token: 'pc.status', label: 'Policy Status', group: 'Property & Casualty', sourceTable: 'policies', sourceField: 'status', example: 'Active', requiresPolicy: true, policyCategory: 'pc' },
      { token: 'pc.company', label: 'Insurance Company', group: 'Property & Casualty', sourceTable: 'policies', sourceField: 'company_name', example: 'Progressive Insurance', aliases: ['policy.company_name'], requiresPolicy: true, policyCategory: 'pc' },
      { token: 'pc.writing_company', label: 'Writing Company', group: 'Property & Casualty', sourceTable: 'policies', sourceField: 'writing_company', example: 'Progressive Select', requiresPolicy: true, policyCategory: 'pc' },
      { token: 'pc.effective_date', label: 'Effective Date', group: 'Property & Casualty', sourceTable: 'policies', sourceField: 'effective_date', example: '01/01/2026', aliases: ['policy.effective_date'], requiresPolicy: true, policyCategory: 'pc' },
      { token: 'pc.expiration_date', label: 'Expiration Date', group: 'Property & Casualty', sourceTable: 'policies', sourceField: 'expiration_date', example: '01/01/2027', aliases: ['policy.expiration_date'], requiresPolicy: true, policyCategory: 'pc' },
      { token: 'pc.full_premium', label: 'Full Premium Amount', group: 'Property & Casualty', sourceTable: 'policies', sourceField: 'total_premium', example: '$2,480.00', aliases: ['policy.full_premium'], requiresPolicy: true, policyCategory: 'pc' },
      { token: 'pc.monthly_premium', label: 'Monthly Premium', group: 'Property & Casualty', sourceTable: 'policies', sourceField: 'premium', example: '$206.67', requiresPolicy: true, policyCategory: 'pc' },
      { token: 'pc.ownership_type', label: 'Ownership Type', group: 'Property & Casualty', sourceTable: 'policies', sourceField: 'policy_ownership_type', example: 'Personal', requiresPolicy: true, policyCategory: 'pc' },
      { token: 'pc.policy_address', label: 'Insured Property Address', group: 'Property & Casualty', sourceTable: 'policies', sourceField: 'address', example: '820 NW 12th Ave, Miami, FL', requiresPolicy: true, policyCategory: 'pc' },
      { token: 'pc.term', label: 'Policy Payment Frequency', group: 'Property & Casualty', sourceTable: 'policies', sourceField: 'policy_payment_frequency', example: 'Monthly', requiresPolicy: true, policyCategory: 'pc' },
      { token: 'pc.agent_name', label: 'Broker / Agent Name', group: 'Property & Casualty', sourceTable: 'policies', sourceField: 'broker_name', example: 'Sunstate Brokerage', requiresPolicy: true, policyCategory: 'pc' },
    ],
  },
  {
    key: 'life',
    label: 'Life Policy',
    icon: '❤️',
    variables: [
      { token: 'life.product_type', label: 'Life Product Type', group: 'Life Policy', sourceTable: 'life_policy_products', sourceField: 'product_type', example: 'Term Life', requiresPolicy: true, policyCategory: 'life' },
      { token: 'life.company', label: 'Life Carrier Company', group: 'Life Policy', sourceTable: 'life_policy_products', sourceField: 'company', example: 'Mutual of Omaha', requiresPolicy: true, policyCategory: 'life' },
      { token: 'life.policy_number', label: 'Life Policy Number', group: 'Life Policy', sourceTable: 'life_policies', sourceField: 'policy_number', example: 'LF-9920148', requiresPolicy: true, policyCategory: 'life' },
      { token: 'life.policy_date', label: 'Life Policy Effective Date', group: 'Life Policy', sourceTable: 'life_policies', sourceField: 'effective_date', example: '03/15/2026', requiresPolicy: true, policyCategory: 'life' },
      { token: 'life.face_amount', label: 'Face Amount / Benefit', group: 'Life Policy', sourceTable: 'life_policy_products', sourceField: 'face_amount', example: '$250,000.00', requiresPolicy: true, policyCategory: 'life' },
      { token: 'life.monthly_premium', label: 'Monthly Premium', group: 'Life Policy', sourceTable: 'life_policy_products', sourceField: 'monthly_premium', example: '$48.50', requiresPolicy: true, policyCategory: 'life' },
      { token: 'life.time_to_pay_premium', label: 'Time to Pay Premium', group: 'Life Policy', sourceTable: 'life_policy_products', sourceField: 'time_to_pay_premium', example: '20 Years', requiresPolicy: true, policyCategory: 'life' },
      { token: 'life.level_period', label: 'Level Period', group: 'Life Policy', sourceTable: 'life_policy_products', sourceField: 'level_period', example: '20 Years Level', requiresPolicy: true, policyCategory: 'life' },
      { token: 'life.conversion_credit', label: 'Conversion Credit', group: 'Life Policy', sourceTable: 'life_policy_products', sourceField: 'conversion_credit', example: '$500.00', requiresPolicy: true, policyCategory: 'life' },
      { token: 'life.status', label: 'Life Policy Status', group: 'Life Policy', sourceTable: 'life_policies', sourceField: 'status', example: 'Active', requiresPolicy: true, policyCategory: 'life' },
    ],
  },
  {
    key: 'life_beneficiaries',
    label: 'Life Beneficiaries',
    icon: '👥',
    variables: [
      { token: 'life.beneficiaries_count', label: 'Beneficiaries Count', group: 'Life Beneficiaries', sourceTable: 'life_policy_beneficiaries', sourceField: 'id', example: '2', requiresPolicy: true, policyCategory: 'life' },
      { token: 'life.beneficiaries_names', label: 'Beneficiaries Summary Names', group: 'Life Beneficiaries', sourceTable: 'life_policy_beneficiaries', sourceField: 'name', example: 'Jane Doe (50%), Child Doe (50%)', requiresPolicy: true, policyCategory: 'life' },
      { token: 'life.total_beneficiary_percentage', label: 'Total Beneficiary Percentage', group: 'Life Beneficiaries', sourceTable: 'life_policy_beneficiaries', sourceField: 'benefit_percentage', example: '100%', requiresPolicy: true, policyCategory: 'life' },
    ],
  },
  {
    key: 'system',
    label: 'System',
    icon: '⚙️',
    variables: [
      { token: 'system.current_date', label: "Today's Date", group: 'System', sourceTable: 'Generated at send time', sourceField: 'now', example: '08/06/2026', aliases: ['current_date'] },
      { token: 'system.current_datetime', label: 'Current Timestamp', group: 'System', sourceTable: 'Generated at send time', sourceField: 'now', example: '08/06/2026 07:45 PM' },
      { token: 'system.current_year', label: 'Current Year', group: 'System', sourceTable: 'Generated at send time', sourceField: 'now', example: '2026', aliases: ['current_year'] },
      { token: 'system.request_id', label: 'Signature Request ID', group: 'System', sourceTable: 'signature_requests', sourceField: 'id', example: 'req_881234' },
      { token: 'system.sent_date', label: 'Consent Sent Date', group: 'System', sourceTable: 'signature_requests', sourceField: 'created_at', example: '08/06/2026' },
      { token: 'system.expiration_date', label: 'Consent Expiration Date', group: 'System', sourceTable: 'signature_requests', sourceField: 'expires_at', example: '08/13/2026' },
      { token: 'system.template_title', label: 'Template Public Title', group: 'System', sourceTable: 'consent_templates', sourceField: 'public_title', example: 'ACA Authorization Agreement' },
      { token: 'system.template_version', label: 'Template Version Number', group: 'System', sourceTable: 'consent_templates', sourceField: 'current_version', example: 'v1' },
    ],
  },
];

/** Flat list of all registered tokens + aliases */
export const ALL_REGISTERED_TOKENS: string[] = VARIABLE_REGISTRY.flatMap((g) =>
  g.variables.flatMap((v) => [v.token, ...(v.aliases || [])])
);

/** Map token or alias to canonical Variable definition */
export const TOKEN_LOOKUP: Record<string, RegistryVariable> = {};

for (const group of VARIABLE_REGISTRY) {
  for (const variable of group.variables) {
    TOKEN_LOOKUP[variable.token] = variable;
    if (variable.aliases) {
      for (const alias of variable.aliases) {
        TOKEN_LOOKUP[alias] = variable;
      }
    }
  }
}
