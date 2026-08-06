const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(targetFile, 'utf-8');

// Locate start of Personal Info Tab Content
const tabStart = content.indexOf("{activeTab === 'personal-info' && (");
if (tabStart === -1) {
  console.error("Could not locate Personal Info tab content section.");
  process.exit(1);
}

// Locate start of Documents Tab Content (boundary end for Personal Info tab)
const tabEnd = content.indexOf("{activeTab === 'documents' && (");
if (tabEnd === -1) {
  console.error("Could not locate Documents tab content section.");
  process.exit(1);
}

const beforeTab = content.substring(0, tabStart);
const afterTab = content.substring(tabEnd);

const newTabContent = `{activeTab === 'personal-info' && (
                <div className="space-y-6 font-sans">
                  
                  {/* SECTION 1: Personal Information Card */}
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 relative">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                      <div>
                        <h3 className="text-lg font-extrabold text-slate-900">Personal Information</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Click any field to edit directly.</p>
                      </div>
                    </div>

                    {personalError && (
                      <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm">
                        {personalError}
                      </div>
                    )}

                    {loadingPersonal ? (
                      <div className="flex justify-center items-center py-10">
                        <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {/* Main Applicant Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
                          {/* Left Column */}
                          <div className="space-y-4">
                            <InlineEditableText
                              label="Applicant Name"
                              value={personalForm.full_name}
                              onSave={val => savePersonalField('full_name', val)}
                            />

                            <InlineEditableDate
                              label="DOB"
                              value={personalForm.date_of_birth}
                              onSave={iso => savePersonalField('date_of_birth', iso || '')}
                            />

                            <div>
                              <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Age</span>
                              <span className="font-semibold text-slate-700 block bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 min-h-[42px] flex items-center text-xs">
                                {calculateAge(personalForm.date_of_birth)}
                              </span>
                            </div>

                            <InlineEditableSSN
                              label="SSN"
                              value={personalForm.ssn}
                              onSave={val => savePersonalField('ssn', val)}
                            />

                            <InlineEditablePhone
                              label="Primary Phone"
                              value={personalForm.phone}
                              onSave={val => savePersonalField('phone', val)}
                            />

                            <InlineEditablePhone
                              label="Secondary Phone"
                              value={personalForm.secondary_phone}
                              onSave={val => savePersonalField('secondary_phone', val)}
                            />

                            <InlineEditableText
                              label="Primary Email"
                              type="email"
                              value={personalForm.email}
                              onSave={val => savePersonalField('email', val)}
                            />

                            <InlineEditableText
                              label="Secondary Email"
                              type="email"
                              value={personalForm.secondary_email}
                              onSave={val => savePersonalField('secondary_email', val)}
                            />

                            <div className="pt-2">
                              <div className="flex items-center space-x-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                <input
                                  type="checkbox"
                                  id="has_co_applicant"
                                  checked={personalForm.has_co_applicant}
                                  onChange={async (e) => {
                                    const checked = e.target.checked;
                                    setPersonalForm(prev => ({ ...prev, has_co_applicant: checked }));
                                    await savePersonalField('has_co_applicant', checked);
                                  }}
                                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                                />
                                <label htmlFor="has_co_applicant" className="text-sm font-bold text-slate-700 select-none cursor-pointer">
                                  Include Co-Applicant
                                </label>
                              </div>
                            </div>
                          </div>

                          {/* Right Column */}
                          <div className="space-y-4">
                            <InlineEditableSelect
                              label="Gender"
                              value={personalForm.gender}
                              options={[
                                { label: 'Select Gender', value: '' },
                                { label: 'Female', value: 'Female' },
                                { label: 'Male', value: 'Male' },
                              ]}
                              onSave={val => savePersonalField('gender', val)}
                            />

                            <InlineEditableSelect
                              label="Marital Status"
                              value={personalForm.marital_status}
                              options={[
                                { label: 'Select Status', value: '' },
                                { label: 'Single', value: 'Single' },
                                { label: 'Married', value: 'Married' },
                              ]}
                              onSave={val => savePersonalField('marital_status', val)}
                            />

                            <InlineEditableSelect
                              label="Immigration Status"
                              value={personalForm.immigration_status}
                              options={[
                                { label: 'Select Status', value: '' },
                                { label: 'Resident', value: 'Resident' },
                                { label: 'Work Permit', value: 'Work Permit' },
                                { label: 'Citizen', value: 'Citizen' },
                                { label: 'Other', value: 'Other' },
                              ]}
                              onSave={val => savePersonalField('immigration_status', val)}
                            />

                            {/* CONDITIONAL IMMIGRATION FIELDS */}
                            {personalForm.immigration_status === 'Resident' && (
                              <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 space-y-4 animate-fade-in">
                                <InlineEditableText
                                  label="Alien Number"
                                  value={personalForm.alien_number}
                                  onSave={val => savePersonalField('alien_number', val)}
                                />
                                <InlineEditableText
                                  label="Card Number"
                                  value={personalForm.card_number}
                                  onSave={val => savePersonalField('card_number', val)}
                                />
                                <InlineEditableDate
                                  label="Expiration Date"
                                  value={personalForm.immigration_expiration_date}
                                  onSave={iso => savePersonalField('immigration_expiration_date', iso || '')}
                                />
                              </div>
                            )}

                            {personalForm.immigration_status === 'Work Permit' && (
                              <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 space-y-4 animate-fade-in">
                                <InlineEditableText
                                  label="Card Number"
                                  value={personalForm.card_number}
                                  onSave={val => savePersonalField('card_number', val)}
                                />
                                <InlineEditableText
                                  label="USCIS Number"
                                  value={personalForm.uscis_number}
                                  onSave={val => savePersonalField('uscis_number', val)}
                                />
                                <InlineEditableText
                                  label="Category"
                                  value={personalForm.immigration_category}
                                  onSave={val => savePersonalField('immigration_category', val)}
                                />
                                <InlineEditableDate
                                  label="Expiration Date"
                                  value={personalForm.immigration_expiration_date}
                                  onSave={iso => savePersonalField('immigration_expiration_date', iso || '')}
                                />
                              </div>
                            )}

                            {personalForm.immigration_status === 'Other' && (
                              <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 space-y-2 animate-fade-in">
                                <InlineEditableTextarea
                                  label="Other Immigration Status Description"
                                  value={personalForm.immigration_other_description}
                                  onSave={val => savePersonalField('immigration_other_description', val)}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Co-Applicant Section - Rendered BELOW Main Applicant Grid */}
                        {personalForm.has_co_applicant && (
                          <div className="pt-8 mt-8 border-t border-slate-200">
                            <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-widest mb-6">Co-Applicant Personal Information</h4>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
                              {/* Left Column */}
                              <div className="space-y-4">
                                <InlineEditableText
                                  label="Co-Applicant Name"
                                  value={coApplicantForm.full_name}
                                  onSave={val => saveCoApplicantField('full_name', val)}
                                />

                                <InlineEditableDate
                                  label="DOB"
                                  value={coApplicantForm.date_of_birth}
                                  onSave={iso => saveCoApplicantField('date_of_birth', iso || '')}
                                />

                                <div>
                                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Age</span>
                                  <span className="font-semibold text-slate-700 block bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 min-h-[42px] flex items-center text-xs">
                                    {calculateAge(coApplicantForm.date_of_birth)}
                                  </span>
                                </div>

                                <InlineEditableSSN
                                  label="SSN"
                                  value={coApplicantForm.ssn}
                                  onSave={val => saveCoApplicantField('ssn', val)}
                                />

                                <InlineEditablePhone
                                  label="Primary Phone"
                                  value={coApplicantForm.primary_phone}
                                  onSave={val => saveCoApplicantField('primary_phone', val)}
                                />

                                <InlineEditablePhone
                                  label="Secondary Phone"
                                  value={coApplicantForm.secondary_phone}
                                  onSave={val => saveCoApplicantField('secondary_phone', val)}
                                />

                                <InlineEditableText
                                  label="Primary Email"
                                  type="email"
                                  value={coApplicantForm.primary_email}
                                  onSave={val => saveCoApplicantField('primary_email', val)}
                                />

                                <InlineEditableText
                                  label="Secondary Email"
                                  type="email"
                                  value={coApplicantForm.secondary_email}
                                  onSave={val => saveCoApplicantField('secondary_email', val)}
                                />
                              </div>

                              {/* Right Column */}
                              <div className="space-y-4">
                                <InlineEditableSelect
                                  label="Gender"
                                  value={coApplicantForm.gender}
                                  options={[
                                    { label: 'Select Gender', value: '' },
                                    { label: 'Female', value: 'Female' },
                                    { label: 'Male', value: 'Male' },
                                  ]}
                                  onSave={val => saveCoApplicantField('gender', val)}
                                />

                                <InlineEditableSelect
                                  label="Marital Status"
                                  value={coApplicantForm.marital_status}
                                  options={[
                                    { label: 'Select Status', value: '' },
                                    { label: 'Single', value: 'Single' },
                                    { label: 'Married', value: 'Married' },
                                  ]}
                                  onSave={val => saveCoApplicantField('marital_status', val)}
                                />

                                <InlineEditableSelect
                                  label="Immigration Status"
                                  value={coApplicantForm.immigration_status}
                                  options={[
                                    { label: 'Select Status', value: '' },
                                    { label: 'Resident', value: 'Resident' },
                                    { label: 'Work Permit', value: 'Work Permit' },
                                    { label: 'Citizen', value: 'Citizen' },
                                    { label: 'Other', value: 'Other' },
                                  ]}
                                  onSave={val => saveCoApplicantField('immigration_status', val)}
                                />

                                {coApplicantForm.immigration_status === 'Resident' && (
                                  <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 space-y-4 animate-fade-in">
                                    <InlineEditableText
                                      label="Alien Number"
                                      value={coApplicantForm.alien_number}
                                      onSave={val => saveCoApplicantField('alien_number', val)}
                                    />
                                    <InlineEditableText
                                      label="Card Number"
                                      value={coApplicantForm.card_number}
                                      onSave={val => saveCoApplicantField('card_number', val)}
                                    />
                                    <InlineEditableDate
                                      label="Expiration Date"
                                      value={coApplicantForm.immigration_expiration_date}
                                      onSave={iso => saveCoApplicantField('immigration_expiration_date', iso || '')}
                                    />
                                  </div>
                                )}

                                {coApplicantForm.immigration_status === 'Work Permit' && (
                                  <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 space-y-4 animate-fade-in">
                                    <InlineEditableText
                                      label="Card Number"
                                      value={coApplicantForm.card_number}
                                      onSave={val => saveCoApplicantField('card_number', val)}
                                    />
                                    <InlineEditableText
                                      label="USCIS Number"
                                      value={coApplicantForm.uscis_number}
                                      onSave={val => saveCoApplicantField('uscis_number', val)}
                                    />
                                    <InlineEditableText
                                      label="Category"
                                      value={coApplicantForm.immigration_category}
                                      onSave={val => saveCoApplicantField('immigration_category', val)}
                                    />
                                    <InlineEditableDate
                                      label="Expiration Date"
                                      value={coApplicantForm.immigration_expiration_date}
                                      onSave={iso => saveCoApplicantField('immigration_expiration_date', iso || '')}
                                    />
                                  </div>
                                )}

                                {coApplicantForm.immigration_status === 'Other' && (
                                  <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 space-y-2 animate-fade-in">
                                    <InlineEditableTextarea
                                      label="Other Description"
                                      value={coApplicantForm.immigration_other_description}
                                      onSave={val => saveCoApplicantField('immigration_other_description', val)}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}\n\n              `;

content = beforeTab + newTabContent + afterTab;

fs.writeFileSync(targetFile, content, 'utf-8');
console.log('Successfully replaced Personal Information card with true field-by-field inline editing!');
