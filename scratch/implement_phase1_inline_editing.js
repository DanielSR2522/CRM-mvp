const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Ensure inline-edit imports exist
if (!content.includes("from '@/components/common/inline-edit'")) {
  content = content.replace(
    "import SSNInput from '@/components/common/SSNInput';",
    `import {
  InlineEditableText,
  InlineEditablePhone,
  InlineEditableSSN,
  InlineEditableDate,
  InlineEditableSelect,
  InlineEditableTextarea,
} from '@/components/common/inline-edit';
import SSNInput from '@/components/common/SSNInput';`
  );
}

// 2. Insert savePersonalField and saveCoApplicantField helper functions right before fetchPersonalInformation
const helperFunctions = `
  const savePersonalField = async (fieldName: string, value: any) => {
    if (!isValidUuid(clientId)) return;
    const { data: existing } = await supabase
      .from('client_personal_information')
      .select('id')
      .eq('client_id', clientId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('client_personal_information')
        .update({ [fieldName]: value, updated_at: new Date().toISOString() })
        .eq('client_id', clientId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('client_personal_information')
        .insert({ client_id: clientId, [fieldName]: value });
      if (error) throw error;
    }

    setPersonalForm(prev => ({ ...prev, [fieldName]: value }));
    await fetchPersonalInformation();
  };

  const saveCoApplicantField = async (fieldName: string, value: any) => {
    if (!isValidUuid(clientId)) return;
    const { data: existing } = await supabase
      .from('client_co_applicant_information')
      .select('id')
      .eq('client_id', clientId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('client_co_applicant_information')
        .update({ [fieldName]: value, updated_at: new Date().toISOString() })
        .eq('client_id', clientId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('client_co_applicant_information')
        .insert({ client_id: clientId, [fieldName]: value });
      if (error) throw error;
    }

    setCoApplicantForm(prev => ({ ...prev, [fieldName]: value }));
    await fetchCoApplicantInformation();
  };
`;

if (!content.includes('const savePersonalField =')) {
  content = content.replace(
    'const fetchPersonalInformation = async () => {',
    `${helperFunctions}\n  const fetchPersonalInformation = async () => {`
  );
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Added inline edit helper functions to client detail page.tsx!');
