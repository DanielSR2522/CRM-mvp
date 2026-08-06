const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(targetFile, 'utf-8');

// 1. Fix state names in Add Income modal in JSX
content = content.replace(/newIncomeRelationship/g, 'incomeRelationship');
content = content.replace(/setNewIncomeRelationship/g, 'setIncomeRelationship');

content = content.replace(/newIncomeType/g, 'incomeType');
content = content.replace(/setNewIncomeType/g, 'setIncomeType');

content = content.replace(/newIncomeEmployer/g, 'incomeEmployerName');
content = content.replace(/setNewIncomeEmployer/g, 'setIncomeEmployerName');

content = content.replace(/newIncomePhone/g, 'incomeEmployerPhone');
content = content.replace(/setNewIncomePhone/g, 'setIncomeEmployerPhone');

content = content.replace(/newIncomeAmount/g, 'incomeAmount');
content = content.replace(/setNewIncomeAmount/g, 'setIncomeAmount');

content = content.replace(/addingIncome/g, 'incomeSaving');
content = content.replace(/setAddingIncome/g, 'setIncomeSaving');

content = content.replace(/handleAddIncome\b/g, 'handleAddIncomeSubmit');

// 2. Remove duplicate loader and handleAddIncome declarations around line 780-830
const duplicateBlock = `  const handleAddIncome = async () => {
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
  };`;

if (content.includes(duplicateBlock)) {
  content = content.replace(duplicateBlock, '');
}

fs.writeFileSync(targetFile, content, 'utf-8');
console.log('Successfully fixed state names and removed duplicate handlers!');
