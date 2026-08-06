const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(targetFile, 'utf-8');

// 1. Add import for LifePolicyTab if not present
if (!content.includes('import LifePolicyTab')) {
  content = content.replace(
    "import HealthPolicyTab from '@/components/health/HealthPolicyTab';",
    "import HealthPolicyTab from '@/components/health/HealthPolicyTab';\nimport LifePolicyTab from '@/components/life/LifePolicyTab';"
  );
}

// 2. Update activeTab type union to include 'life'
content = content.replace(
  "as 'overview' | 'personal-info' | 'policies' | 'documents' | 'notes' | 'consents' | 'timeline' | 'health';",
  "as 'overview' | 'personal-info' | 'policies' | 'documents' | 'notes' | 'consents' | 'timeline' | 'health' | 'life';"
);

// 3. Add lifePolicies state inside ClientProfilePage
if (!content.includes('const [lifePolicies, setLifePolicies]')) {
  content = content.replace(
    "const [policies, setPolicies] = useState<Policy[]>([]);",
    "const [policies, setPolicies] = useState<Policy[]>([]);\n  const [lifePolicies, setLifePolicies] = useState<any[]>([]);\n  const [healthPoliciesOverview, setHealthPoliciesOverview] = useState<any[]>([]);"
  );
}

// 4. Update loadOverviewData or useEffect to fetch lifePolicies & healthPolicies for overview metrics
const loadOverviewCode = `  // Fetch consolidated overview policies (Health, P&C, Life)
  const fetchOverviewPolicies = useCallback(async () => {
    if (!isValidUuid(clientId)) return;
    try {
      const [
        { data: hData },
        { data: lData },
      ] = await Promise.all([
        supabase.from('health_policies').select('*').eq('client_id', clientId),
        supabase.from('life_policies').select('*').eq('client_id', clientId),
      ]);

      setHealthPoliciesOverview(hData || []);
      setLifePolicies(lData || []);
    } catch (err) {
      console.error('Failed to load overview policies:', err);
    }
  }, [clientId]);

  useEffect(() => {
    fetchOverviewPolicies();
  }, [fetchOverviewPolicies]);`;

if (!content.includes('fetchOverviewPolicies')) {
  content = content.replace(
    "useEffect(() => {\n    if (clientId) {",
    `${loadOverviewCode}\n\n  useEffect(() => {\n    if (clientId) {`
  );
}

// 5. Update consolidated overview metric calculations
const oldMetrics = `  // computed stats for overview dashboard
  const activeCount = policies.filter(p => p.status === 'Active').length;
  const pendingCount = policies.filter(p => p.status === 'Pending').length;

  const expiringSoonCount = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sixtyDaysFromNow = new Date();
    sixtyDaysFromNow.setDate(today.getDate() + 60);
    sixtyDaysFromNow.setHours(23, 59, 59, 999);

    return policies.filter(p => {
      if (!p.expiration_date || p.status === 'Cancelled') return false;
      const expDate = new Date(p.expiration_date + 'T00:00:00');
      return expDate >= today && expDate <= sixtyDaysFromNow;
    }).length;
  })();`;

const newMetrics = `  // Consolidated overview stats across Health, P&C, Life, and Supplemental
  const pcActive = policies.filter(p => p.status === 'Active').length;
  const healthActive = healthPoliciesOverview.filter(h => h.policy_status === 'Active' || h.active === true).length;
  const lifeActive = lifePolicies.filter(l => l.status === 'Active').length;
  const activeCount = pcActive + healthActive + lifeActive;

  const pcPending = policies.filter(p => p.status === 'Pending').length;
  const healthPending = healthPoliciesOverview.filter(h => h.policy_status === 'Pending' || h.action_pending === 'Documents' || h.action_pending === 'Verification').length;
  const lifePending = lifePolicies.filter(l => l.status === 'Pending').length;
  const pendingCount = pcPending + healthPending + lifePending;

  const expiringSoonCount = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sixtyDaysFromNow = new Date();
    sixtyDaysFromNow.setDate(today.getDate() + 60);
    sixtyDaysFromNow.setHours(23, 59, 59, 999);

    const pcExp = policies.filter(p => {
      if (!p.expiration_date || p.status === 'Cancelled') return false;
      const expDate = new Date(p.expiration_date + 'T00:00:00');
      return expDate >= today && expDate <= sixtyDaysFromNow;
    }).length;

    const lifeExp = lifePolicies.filter(l => {
      if (!l.expiration_date || l.status === 'Cancelled') return false;
      const expDate = new Date(l.expiration_date + 'T00:00:00');
      return expDate >= today && expDate <= sixtyDaysFromNow;
    }).length;

    return pcExp + lifeExp;
  })();

  // Build unified consolidated policy summary cards for Overview tab
  const consolidatedOverviewCards = (() => {
    const cards: Array<{
      id: string;
      businessLine: 'property_casualty' | 'health' | 'life' | 'supplemental';
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
    policies.forEach(p => {
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
    healthPoliciesOverview.forEach(h => {
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
    lifePolicies.forEach(l => {
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

content = content.replace(oldMetrics, newMetrics);

// 6. Add Life tab button in client navigation tab bar
const lifeTabButton = `{isLineEnabled('life') && (
                    <button
                      onClick={() => handleTabChange('life')}
                      className={\`px-3 py-1.5 text-xs font-medium rounded-md transition-colors \${
                        activeTab === 'life'
                          ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold'
                          : 'text-[#556176] hover:bg-[#F8FAFC] hover:text-[#172033]'
                      }\`}
                    >
                      Life
                    </button>
                  )}`;

if (!content.includes("onClick={() => handleTabChange('life')}")) {
  content = content.replace(
    "{isLineEnabled('health') && (",
    `${lifeTabButton}\n                  {isLineEnabled('health') && (`
  );
}

// 7. Add Life tab view container rendering <LifePolicyTab>
const lifeTabContainer = `{activeTab === 'life' && client && (
        !isLineEnabled('life') ? (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-8 text-center space-y-3 font-sans">
            <h4 className="text-lg font-bold text-white">Module Access Restricted</h4>
            <p className="text-sm text-slate-300">The <strong>Life</strong> module is disabled for your agent profile.</p>
          </div>
        ) : (
          <LifePolicyTab
            clientId={clientId}
            onPoliciesChanged={fetchOverviewPolicies}
          />
        )
      )}`;

if (!content.includes("<LifePolicyTab")) {
  content = content.replace(
    "{activeTab === 'health' && client && (",
    `${lifeTabContainer}\n\n      {activeTab === 'health' && client && (`
  );
}

fs.writeFileSync(targetFile, content, 'utf-8');
console.log('Successfully updated page.tsx with Life tab and consolidated Overview metrics!');
