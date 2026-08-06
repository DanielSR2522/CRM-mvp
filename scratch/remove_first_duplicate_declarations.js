const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(targetFile, 'utf-8');

// Remove the duplicated block inserted earlier around line 684-750
const targetBlock = `  const fetchResidenceInformation = async () => {
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
  };`;

if (content.includes(targetBlock)) {
  content = content.replace(targetBlock, '');
  console.log('Removed duplicate fetchResidenceInformation & fetchIncomeInformation block!');
}

// Fix select value type casting in Add Income modal
content = content.replace(
  "setIncomeRelationship(e.target.value)",
  "setIncomeRelationship(e.target.value as any)"
);
content = content.replace(
  "setIncomeType(e.target.value)",
  "setIncomeType(e.target.value as any)"
);
content = content.replace(
  "setIncomeAmount(e.target.value)",
  "setIncomeAmount(e.target.value === '' ? '' : Number(e.target.value))"
);

fs.writeFileSync(targetFile, content, 'utf-8');
console.log('Finished cleanup script!');
