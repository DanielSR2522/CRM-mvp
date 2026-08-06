const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(targetFile, 'utf-8');

// Insert consolidatedOverviewCards definition right after const [deleteClientError, setDeleteClientError] = useState<string | null>(null);
const cardsDefinition = `  // Build unified consolidated policy summary cards for Overview tab
  const consolidatedOverviewCards = (() => {
    const cards: Array<{
      id: string;
      businessLine: 'property_casualty' | 'health' | 'life';
      businessLineLabel: string;
      policy_type: string;
      company_name: string;
      policy_number: string;
      status: string;
      effective_date: string | null;
      expiration_date: string | null;
      premium: number;
      targetTab: 'policies' | 'health' | 'life';
      updated_at: string;
    }> = [];

    // P&C policies
    (policies || []).forEach((p: any) => {
      cards.push({
        id: p.id,
        businessLine: 'property_casualty',
        businessLineLabel: 'Property & Casualty',
        policy_type: p.policy_type || 'P&C Policy',
        company_name: p.writing_company || p.company_name || 'Carrier Unspecified',
        policy_number: p.policy_number || 'N/A',
        status: p.status || 'Active',
        effective_date: p.effective_date || null,
        expiration_date: p.expiration_date || null,
        premium: p.total_premium || p.premium || 0,
        targetTab: 'policies',
        updated_at: p.updated_at || p.created_at || new Date().toISOString(),
      });
    });

    // Health policies
    (healthPoliciesOverview || []).forEach((h: any) => {
      cards.push({
        id: h.id,
        businessLine: 'health',
        businessLineLabel: 'Health',
        policy_type: h.plan_name || 'Health Plan',
        company_name: h.company_2026 || 'Marketplace Carrier',
        policy_number: h.plan_id || h.application_number || 'N/A',
        status: h.policy_status || (h.active ? 'Active' : 'Cancelled'),
        effective_date: h.effective_date || null,
        expiration_date: null,
        premium: h.plan_cost || 0,
        targetTab: 'health',
        updated_at: h.updated_at || h.created_at || new Date().toISOString(),
      });
    });

    // Life policies
    (lifePolicies || []).forEach((l: any) => {
      cards.push({
        id: l.id,
        businessLine: 'life',
        businessLineLabel: 'Life Insurance',
        policy_type: 'Life Policy',
        company_name: 'Life Carrier',
        policy_number: l.policy_number || 'N/A',
        status: l.status || 'Active',
        effective_date: l.effective_date || null,
        expiration_date: l.expiration_date || null,
        premium: 0,
        targetTab: 'life',
        updated_at: l.updated_at || l.created_at || new Date().toISOString(),
      });
    });

    return cards.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  })();`;

content = content.replace(
  "const [deleteClientError, setDeleteClientError] = useState<string | null>(null);",
  `const [deleteClientError, setDeleteClientError] = useState<string | null>(null);\n${cardsDefinition}`
);

fs.writeFileSync(targetFile, content, 'utf-8');
console.log('Successfully placed consolidatedOverviewCards inside ClientProfileContent scope!');
