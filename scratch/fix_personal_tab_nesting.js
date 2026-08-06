const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(targetFile, 'utf-8');

// Replace Personal Info tab content block with clean JSX
const tabStart = content.indexOf("{/* PERSONAL INFO TAB CONTENT */}");
const tabEnd = content.indexOf("{activeTab === 'documents' && (");

if (tabStart === -1 || tabEnd === -1) {
  console.error('Could not find Personal Info tab bounds.');
  process.exit(1);
}

const beforeTab = content.substring(0, tabStart);
const afterTab = content.substring(tabEnd);

const cleanTabJSX = `{/* PERSONAL INFO TAB CONTENT */}
              {activeTab === 'personal-info' && (
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

                  {/* SECTION 2: Residence Information Card */}
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 relative">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                      <div>
                        <h3 className="text-lg font-extrabold text-slate-900">Residence Information</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Click any field to edit directly.</p>
                      </div>
                    </div>

                    {loadingResidence ? (
                      <div className="flex justify-center items-center py-10">
                        <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
                      </div>
                    )}
                  </div>

                  {/* SECTION 3: Income Information Card */}
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 relative">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                      <div>
                        <h3 className="text-lg font-extrabold text-slate-900">Income Information</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Manage income records for health eligibility and tax household.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsAddIncomeOpen(true)}
                        className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-2 rounded-xl transition-all shadow-md active:scale-95"
                      >
                        + Add Income
                      </button>
                    </div>

                    {loadingIncome ? (
                      <div className="flex justify-center items-center py-10">
                        <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                    ) : incomeList.length === 0 ? (
                      <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl">
                        <svg className="w-10 h-10 text-slate-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h4 className="text-xs font-bold text-slate-700">No income records registered</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">Click "+ Add Income" above to add income details.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {incomeList.map((income) => (
                          <div
                            key={income.id}
                            className="p-4 border border-slate-150 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 flex-1">
                              <InlineEditableSelect
                                label="Relationship"
                                value={income.relationship_to_applicant}
                                options={[
                                  { label: 'Applicant', value: 'Applicant' },
                                  { label: 'Spouse', value: 'Spouse' },
                                  { label: 'Son/Daughter', value: 'Son/Daughter' },
                                  { label: 'Mother', value: 'Mother' },
                                  { label: 'Father', value: 'Father' },
                                  { label: 'Other', value: 'Other' },
                                ]}
                                onSave={val => saveIncomeField(income.id, 'relationship_to_applicant', val)}
                              />

                              <InlineEditableSelect
                                label="Income Type"
                                value={income.income_type}
                                options={[
                                  { label: 'W2', value: 'W2' },
                                  { label: '1099', value: '1099' },
                                ]}
                                onSave={val => saveIncomeField(income.id, 'income_type', val)}
                              />

                              <InlineEditableText
                                label="Employer / Source"
                                value={income.employer_name}
                                onSave={val => saveIncomeField(income.id, 'employer_name', val)}
                              />

                              <InlineEditablePhone
                                label="Employer Phone"
                                value={income.employer_phone}
                                onSave={val => saveIncomeField(income.id, 'employer_phone', val)}
                              />

                              <InlineEditableText
                                label="Amount ($)"
                                type="number"
                                value={String(income.income || '')}
                                onSave={val => saveIncomeField(income.id, 'income', Number(val))}
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteIncome(income.id)}
                              className="text-xs font-bold text-rose-500 hover:text-rose-700 p-1 self-end sm:self-center"
                              title="Delete income record"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ADD INCOME MODAL */}
                    {isAddIncomeOpen && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
                        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-100">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h4 className="text-base font-extrabold text-slate-900">Add Income Record</h4>
                            <button
                              type="button"
                              onClick={() => setIsAddIncomeOpen(false)}
                              className="text-slate-400 hover:text-slate-600 font-bold"
                            >
                              ✕
                            </button>
                          </div>

                          {incomeError && (
                            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold">
                              {incomeError}
                            </div>
                          )}

                          <div className="space-y-3 text-xs">
                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Relationship</label>
                              <select
                                value={newIncomeRelationship}
                                onChange={e => setNewIncomeRelationship(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none"
                              >
                                <option value="Applicant">Applicant</option>
                                <option value="Spouse">Spouse</option>
                                <option value="Son/Daughter">Son/Daughter</option>
                                <option value="Mother">Mother</option>
                                <option value="Father">Father</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Income Type</label>
                              <select
                                value={newIncomeType}
                                onChange={e => setNewIncomeType(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none"
                              >
                                <option value="W2">W2</option>
                                <option value="1099">1099</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Employer / Source</label>
                              <input
                                type="text"
                                value={newIncomeEmployer}
                                onChange={e => setNewIncomeEmployer(e.target.value)}
                                placeholder="e.g. Acme Corp"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Employer Phone</label>
                              <PhoneInput
                                value={newIncomePhone}
                                onChange={val => setNewIncomePhone(val)}
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Annual Amount ($)</label>
                              <input
                                type="number"
                                value={newIncomeAmount}
                                onChange={e => setNewIncomeAmount(e.target.value)}
                                placeholder="e.g. 55000"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none"
                                required
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => setIsAddIncomeOpen(false)}
                              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 rounded-xl"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleAddIncome}
                              disabled={addingIncome}
                              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs disabled:opacity-50"
                            >
                              {addingIncome ? 'Saving...' : 'Save Income'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              `;

content = beforeTab + cleanTabJSX + afterTab;
fs.writeFileSync(targetFile, content, 'utf-8');
console.log('Successfully cleaned JSX tab nesting in page.tsx!');
