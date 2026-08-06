const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(targetFile, 'utf-8');

// 1. Add residence & income interfaces if not present
if (!content.includes('interface ClientResidenceInformation')) {
  content = content.replace(
    "interface ClientPersonalInformation {",
    `interface ClientResidenceInformation {
  address: string;
  city: string;
  state: string;
  zip_code: string;
  county: string;
}

interface ClientIncomeInformation {
  id: string;
  client_id: string;
  relationship_to_applicant: 'Applicant' | 'Spouse' | 'Son/Daughter' | 'Mother' | 'Father' | 'Other' | '';
  income_type: 'W2' | '1099' | '';
  employer_name: string;
  employer_phone: string;
  income: number;
}

interface ClientPersonalInformation {`
  );
}

// 2. Add residence & income state variables inside ClientProfilePage
const stateBlock = `
  // Residence & Income State
  const [residenceInfo, setResidenceInfo] = useState<ClientResidenceInformation | null>(null);
  const [loadingResidence, setLoadingResidence] = useState<boolean>(true);
  const [residenceForm, setResidenceForm] = useState<ClientResidenceInformation>({
    address: '',
    city: '',
    state: '',
    zip_code: '',
    county: '',
  });

  const [incomeList, setIncomeList] = useState<ClientIncomeInformation[]>([]);
  const [loadingIncome, setLoadingIncome] = useState<boolean>(true);
  const [isAddIncomeOpen, setIsAddIncomeOpen] = useState<boolean>(false);
  const [newIncomeRelationship, setNewIncomeRelationship] = useState<string>('Applicant');
  const [newIncomeType, setNewIncomeType] = useState<string>('W2');
  const [newIncomeEmployer, setNewIncomeEmployer] = useState<string>('');
  const [newIncomePhone, setNewIncomePhone] = useState<string>('');
  const [newIncomeAmount, setNewIncomeAmount] = useState<string>('');
  const [addingIncome, setAddingIncome] = useState<boolean>(false);
  const [incomeError, setIncomeError] = useState<string | null>(null);
`;

if (!content.includes('const [residenceInfo, setResidenceInfo] =')) {
  content = content.replace(
    "const [coApplicantForm, setCoApplicantForm] = useState<CoApplicantInformation>({",
    `${stateBlock}\n  const [coApplicantForm, setCoApplicantForm] = useState<CoApplicantInformation>({`
  );
}

// 3. Add fetchResidenceInformation and fetchIncomeInformation loaders & atomic save handlers
const loaderAndSavers = `
  const fetchResidenceInformation = async () => {
    try {
      setLoadingResidence(true);
      if (!isValidUuid(clientId)) {
        setResidenceInfo(null);
        setLoadingResidence(false);
        return;
      }
      const { data, error } = await supabase
        .from('client_residence_information')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      if (error) throw error;
      setResidenceInfo(data);
      if (data) {
        setResidenceForm({
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          zip_code: data.zip_code || '',
          county: data.county || '',
        });
      } else {
        setResidenceForm(prev => ({ ...prev, address: client?.address || '' }));
      }
    } catch (err: any) {
      console.error('Error fetching residence info:', err);
    } finally {
      setLoadingResidence(false);
    }
  };

  const fetchIncomeInformation = async () => {
    try {
      setLoadingIncome(true);
      if (!isValidUuid(clientId)) {
        setIncomeList([]);
        setLoadingIncome(false);
        return;
      }
      const { data, error } = await supabase
        .from('client_income_information')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setIncomeList(data || []);
    } catch (err: any) {
      console.error('Error fetching income info:', err);
    } finally {
      setLoadingIncome(false);
    }
  };

  const saveResidenceField = async (fieldOrObject: string | Record<string, any>, val?: any) => {
    if (!isValidUuid(clientId)) return;
    let patch: Record<string, any> = {};
    if (typeof fieldOrObject === 'string') {
      patch[fieldOrObject] = val;
    } else {
      patch = { ...fieldOrObject };
    }

    const { data: existing } = await supabase
      .from('client_residence_information')
      .select('id')
      .eq('client_id', clientId)
      .maybeSingle();

    if (existing) {
      const { data: updated, error } = await supabase
        .from('client_residence_information')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('client_id', clientId)
        .select('*')
        .maybeSingle();

      if (error || !updated) throw error || new Error('Zero rows returned from residence update.');
      setResidenceInfo(updated);
    } else {
      const { data: inserted, error } = await supabase
        .from('client_residence_information')
        .insert({ client_id: clientId, ...patch })
        .select('*')
        .maybeSingle();

      if (error || !inserted) throw error || new Error('Zero rows returned from residence insert.');
      setResidenceInfo(inserted);
    }

    setResidenceForm(prev => ({ ...prev, ...patch }));
  };

  const saveIncomeField = async (incomeId: string, fieldName: string, value: any) => {
    const { data: updated, error } = await supabase
      .from('client_income_information')
      .update({ [fieldName]: value, updated_at: new Date().toISOString() })
      .eq('id', incomeId)
      .select('*')
      .maybeSingle();

    if (error || !updated) throw error || new Error('Zero rows returned from income update.');
    setIncomeList(prev => prev.map(inc => inc.id === incomeId ? updated : inc));
  };

  const handleAddIncome = async () => {
    if (!newIncomeAmount) {
      setIncomeError('Income amount is required.');
      return;
    }
    setAddingIncome(true);
    setIncomeError(null);
    try {
      const { data: inserted, error } = await supabase
        .from('client_income_information')
        .insert({
          client_id: clientId,
          relationship_to_applicant: newIncomeRelationship,
          income_type: newIncomeType,
          employer_name: newIncomeEmployer.trim() || null,
          employer_phone: newIncomePhone.trim() || null,
          income: Number(newIncomeAmount),
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .maybeSingle();

      if (error || !inserted) throw error || new Error('Failed to add income record.');
      setIncomeList(prev => [...prev, inserted]);
      setIsAddIncomeOpen(false);
      setNewIncomeAmount('');
      setNewIncomeEmployer('');
      setNewIncomePhone('');
    } catch (err: any) {
      setIncomeError(err?.message || 'Failed to add income.');
    } finally {
      setAddingIncome(false);
    }
  };

  const handleDeleteIncome = async (incomeId: string) => {
    const { error } = await supabase
      .from('client_income_information')
      .delete()
      .eq('id', incomeId);

    if (error) {
      console.error('Error deleting income:', error);
      return;
    }
    setIncomeList(prev => prev.filter(inc => inc.id !== incomeId));
  };
`;

if (!content.includes('const saveResidenceField =')) {
  content = content.replace(
    "const saveCoApplicantField = async (fieldName: string, value: any) => {",
    `${loaderAndSavers}\n  const saveCoApplicantField = async (fieldName: string, value: any) => {`
  );
}

// 4. Ensure tab switcher loads residence & income info
if (!content.includes('fetchResidenceInformation();')) {
  content = content.replace(
    "if (activeTab === 'personal-info' && client) {",
    `if (activeTab === 'personal-info' && client) {
      fetchResidenceInformation();
      fetchIncomeInformation();`
  );
}

fs.writeFileSync(targetFile, content, 'utf-8');
console.log('Added residence & income loaders, state, and save handlers to page.tsx!');
