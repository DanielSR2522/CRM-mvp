const fs = require('fs');
const path = require('path');

// 1. Update Agent Information page to use InlineEditableAddress
const agentPagePath = path.join(__dirname, '../src/app/agent-information/page.tsx');
let agentContent = fs.readFileSync(agentPagePath, 'utf-8');

if (!agentContent.includes('InlineEditableAddress')) {
  agentContent = agentContent.replace(
    "import {\n  InlineEditableText,\n  InlineEditablePhone,\n  InlineEditableSelect,\n} from '@/components/common/inline-edit';",
    `import {
  InlineEditableText,
  InlineEditablePhone,
  InlineEditableSelect,
  InlineEditableAddress,
} from '@/components/common/inline-edit';`
  );

  // Replace Business Address section JSX with InlineEditableAddress
  const oldAddressSection = `<div className="crm-card p-5 space-y-4">
                  <div className="border-b border-[#E8ECF2] pb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#172033]">Business Address</h2>
                    {!editingAddress && (
                      <button
                        type="button"
                        onClick={handleStartAddressEdit}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Edit Address
                      </button>
                    )}
                  </div>`;

  const newAddressSection = `<div className="crm-card p-5 space-y-4">
                  <div className="border-b border-[#E8ECF2] pb-3">
                    <h2 className="text-sm font-semibold text-[#172033]">Business Address</h2>
                  </div>
                  <InlineEditableAddress
                    label=""
                    data={{
                      address: form.address,
                      city: form.city,
                      state: form.state,
                      zip_code: form.zip_code,
                      country: form.country,
                    }}
                    onSave={async (newData) => {
                      await saveProfileField({
                        address: newData.address,
                        city: newData.city,
                        state: newData.state,
                        zip_code: newData.zip_code,
                        country: newData.country || 'United States',
                      });
                    }}
                  />`;

  // Find end of section 3 in agentContent
  const sec3Idx = agentContent.indexOf('{/* SECTION 3: BUSINESS ADDRESS */}');
  const sec4Idx = agentContent.indexOf('{/* SECTION 4: CONTACT INFORMATION */}');
  if (sec3Idx !== -1 && sec4Idx !== -1) {
    const before = agentContent.substring(0, sec3Idx);
    const after = agentContent.substring(sec4Idx);
    agentContent = before + `{/* SECTION 3: BUSINESS ADDRESS */}\n                ${newAddressSection}\n                </div>\n\n              </div>\n\n              {/* RIGHT COLUMN */}\n              <div className="space-y-6">\n\n                ` + after;
  }

  fs.writeFileSync(agentPagePath, agentContent, 'utf-8');
  console.log('Successfully updated agent-information page.tsx to use InlineEditableAddress!');
}

// 2. Update Client Residence Information in client detail page.tsx
const clientPagePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let clientContent = fs.readFileSync(clientPagePath, 'utf-8');

if (!clientContent.includes('InlineEditableAddress')) {
  clientContent = clientContent.replace(
    "import {\n  InlineEditableText,\n  InlineEditablePhone,\n  InlineEditableSSN,\n  InlineEditableDate,\n  InlineEditableSelect,\n  InlineEditableTextarea,\n} from '@/components/common/inline-edit';",
    `import {
  InlineEditableText,
  InlineEditablePhone,
  InlineEditableSSN,
  InlineEditableDate,
  InlineEditableSelect,
  InlineEditableTextarea,
  InlineEditableAddress,
} from '@/components/common/inline-edit';`
  );

  // Replace Residence Information card grid in client detail page.tsx
  const oldResGrid = `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="sm:col-span-2">
                          <InlineEditableText
                            label="Street Address"
                            value={residenceForm.address}
                            onSave={val => saveResidenceField('address', val)}
                          />
                        </div>

                        <InlineEditableText
                          label="City"
                          value={residenceForm.city}
                          onSave={val => saveResidenceField('city', val)}
                        />

                        <InlineEditableText
                          label="State"
                          value={residenceForm.state}
                          onSave={val => saveResidenceField('state', val)}
                        />

                        <InlineEditableText
                          label="County"
                          value={residenceForm.county}
                          onSave={val => saveResidenceField('county', val)}
                        />

                        <InlineEditableText
                          label="ZIP Code"
                          value={residenceForm.zip_code}
                          onSave={val => saveResidenceField('zip_code', val)}
                        />
                      </div>`;

  const newResGrid = `<InlineEditableAddress
                        label=""
                        data={{
                          address: residenceForm.address,
                          city: residenceForm.city,
                          state: residenceForm.state,
                          zip_code: residenceForm.zip_code,
                          county: residenceForm.county,
                        }}
                        onSave={async (newData) => {
                          await saveResidenceField({
                            address: newData.address,
                            city: newData.city,
                            state: newData.state,
                            zip_code: newData.zip_code,
                            county: newData.county || '',
                          });
                        }}
                      />`;

  if (clientContent.includes(oldResGrid)) {
    clientContent = clientContent.replace(oldResGrid, newResGrid);
  }

  fs.writeFileSync(clientPagePath, clientContent, 'utf-8');
  console.log('Successfully updated client detail page.tsx to use InlineEditableAddress!');
}
