'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';

interface ProfileData {
  name: string;
  dob: string;
  ssn: string;
  email: string;
  phone: string;
  gender: 'Female' | 'Male' | '';
  marital_status: 'Single' | 'Married' | '';
  immigration_status: 'Resident' | 'EAC' | 'Citizen' | 'Other' | '';
  tax_members: number | '';
}

interface ResidenceData {
  address: string;
  city: string;
  zip_code: string;
  county: string;
}

interface IncomeRow {
  id?: string;
  relationship_to_applicant: 'Applicant' | 'Spouse' | 'Son/Daughter' | 'Mother' | 'Father' | 'Other' | '';
  income_type: 'W2' | '1099' | '';
  employer_name: string;
  employer_phone: string;
  income: number | '';
}

export default function PersonalInformationPage() {
  const [userId, setUserId] = useState<string | null>(null);

  // Section 1 State (Personal Info)
  const [profile, setProfile] = useState<ProfileData>({
    name: '',
    dob: '',
    ssn: '',
    email: '',
    phone: '',
    gender: '',
    marital_status: '',
    immigration_status: '',
    tax_members: '',
  });
  const [profileAge, setProfileAge] = useState<number | ''>('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Section 2 State (Residence Info)
  const [residence, setResidence] = useState<ResidenceData>({
    address: '',
    city: '',
    zip_code: '',
    county: '',
  });
  const [residenceLoading, setResidenceLoading] = useState(true);
  const [residenceSaving, setResidenceSaving] = useState(false);
  const [residenceError, setResidenceError] = useState<string | null>(null);
  const [residenceSuccess, setResidenceSuccess] = useState(false);

  // Section 3 State (Income Info)
  const [incomes, setIncomes] = useState<IncomeRow[]>([]);
  const [incomeLoading, setIncomeLoading] = useState(true);
  const [incomeError, setIncomeError] = useState<string | null>(null);

  // Modal State for Income Add/Edit
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeRow | null>(null);
  const [modalForm, setModalForm] = useState<IncomeRow>({
    relationship_to_applicant: '',
    income_type: '',
    employer_name: '',
    employer_phone: '',
    income: '',
  });
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Helper: Calculate age from DOB
  const calculateAge = (dobString: string): number | '' => {
    if (!dobString) return '';
    const today = new Date();
    const birthDate = new Date(dobString);
    if (isNaN(birthDate.getTime())) return '';

    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 0 ? age : 0;
  };

  // Recalculate age whenever DOB changes
  useEffect(() => {
    setProfileAge(calculateAge(profile.dob));
  }, [profile.dob]);

  // Load user session and data
  useEffect(() => {
    const loadData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      
      const currentUserId = session.user.id;
      setUserId(currentUserId);

      // Fetch Profile
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('name, dob, ssn, email, phone, gender, marital_status, immigration_status, tax_members')
          .eq('id', currentUserId)
          .single();

        if (data) {
          setProfile({
            name: data.name || '',
            dob: data.dob || '',
            ssn: data.ssn || '',
            email: data.email || session.user.email || '',
            phone: data.phone || '',
            gender: (data.gender as any) || '',
            marital_status: (data.marital_status as any) || '',
            immigration_status: (data.immigration_status as any) || '',
            tax_members: data.tax_members ?? '',
          });
        } else {
          // If no profile, prepopulate the email from auth
          setProfile(prev => ({ ...prev, email: session.user.email || '' }));
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      } finally {
        setProfileLoading(false);
      }

      // Fetch Residence
      try {
        const { data, error } = await supabase
          .from('residence_information')
          .select('address, city, zip_code, county')
          .eq('user_id', currentUserId)
          .single();

        if (data) {
          setResidence({
            address: data.address || '',
            city: data.city || '',
            zip_code: data.zip_code || '',
            county: data.county || '',
          });
        }
      } catch (err) {
        console.error('Error loading residence:', err);
      } finally {
        setResidenceLoading(false);
      }

      // Fetch Income
      try {
        const { data, error } = await supabase
          .from('income_information')
          .select('id, relationship_to_applicant, income_type, employer_name, employer_phone, income')
          .eq('user_id', currentUserId);

        if (data) {
          setIncomes(data as IncomeRow[]);
        }
      } catch (err) {
        console.error('Error loading incomes:', err);
      } finally {
        setIncomeLoading(false);
      }
    };

    loadData();
  }, []);

  // Save Section 1 (Profiles)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(false);

    try {
      const payload = {
        id: userId,
        name: profile.name || null,
        dob: profile.dob || null,
        ssn: profile.ssn || null,
        email: profile.email || null,
        phone: profile.phone || null,
        gender: profile.gender || null,
        marital_status: profile.marital_status || null,
        immigration_status: profile.immigration_status || null,
        tax_members: profile.tax_members === '' ? null : Number(profile.tax_members),
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(payload);

      if (error) throw error;
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: any) {
      setProfileError(err?.message || 'Failed to save personal information.');
    } finally {
      setProfileSaving(false);
    }
  };

  // Save Section 2 (Residence)
  const handleSaveResidence = async (e: React.FormEvent) => {
    e.preventDefault();
    setResidenceSaving(true);
    setResidenceError(null);
    setResidenceSuccess(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setResidenceError('Authentication error: User session not found.');
        setResidenceSaving(false);
        return;
      }

      const payload = {
        user_id: user.id,
        address: residence.address || null,
        city: residence.city || null,
        zip_code: residence.zip_code || null,
        county: residence.county || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('residence_information')
        .upsert(payload, { onConflict: 'user_id' });

      if (error) throw error;
      setResidenceSuccess(true);
      setTimeout(() => setResidenceSuccess(false), 3000);
    } catch (err: any) {
      setResidenceError(err?.message || 'Failed to save residence information.');
    } finally {
      setResidenceSaving(false);
    }
  };

  // Open modal to add or edit income row
  const openIncomeModal = (incomeRow?: IncomeRow) => {
    setModalError(null);
    if (incomeRow) {
      setEditingIncome(incomeRow);
      setModalForm({ ...incomeRow });
    } else {
      setEditingIncome(null);
      setModalForm({
        relationship_to_applicant: '',
        income_type: '',
        employer_name: '',
        employer_phone: '',
        income: '',
      });
    }
    setIsIncomeModalOpen(true);
  };

  // Handle Save Income Row (Add or Update)
  const handleSaveIncomeRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    if (!modalForm.relationship_to_applicant || !modalForm.income_type || !modalForm.employer_name || modalForm.income === '') {
      setModalError('Please fill in all required fields.');
      return;
    }

    setModalSaving(true);
    setModalError(null);

    try {
      if (editingIncome?.id) {
        // Update record
        const { error } = await supabase
          .from('income_information')
          .update({
            relationship_to_applicant: modalForm.relationship_to_applicant,
            income_type: modalForm.income_type,
            employer_name: modalForm.employer_name,
            employer_phone: modalForm.employer_phone || null,
            income: Number(modalForm.income),
          })
          .eq('id', editingIncome.id);

        if (error) throw error;

        setIncomes(prev =>
          prev.map(item =>
            item.id === editingIncome.id
              ? { ...item, ...modalForm, income: Number(modalForm.income) }
              : item
          )
        );
      } else {
        // Create record
        const { data, error } = await supabase
          .from('income_information')
          .insert({
            user_id: userId,
            relationship_to_applicant: modalForm.relationship_to_applicant,
            income_type: modalForm.income_type,
            employer_name: modalForm.employer_name,
            employer_phone: modalForm.employer_phone || null,
            income: Number(modalForm.income),
          })
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setIncomes(prev => [...prev, data as IncomeRow]);
        }
      }
      setIsIncomeModalOpen(false);
    } catch (err: any) {
      setModalError(err?.message || 'Failed to save income record.');
    } finally {
      setModalSaving(false);
    }
  };

  // Handle Delete Income Row
  const handleDeleteIncome = async (id: string) => {
    if (!id) return;
    if (!confirm('Are you sure you want to delete this income record?')) return;

    try {
      const { error } = await supabase
        .from('income_information')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setIncomes(prev => prev.filter(item => item.id !== id));
    } catch (err: any) {
      alert(err?.message || 'Failed to delete income record.');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 max-w-5xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Personal Settings</h1>
          <p className="text-slate-400 mt-1">Configure and manage your core profile information, residence location, and income files.</p>
        </div>

        {/* Section 1: Personal Information Card */}
        <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-xl">
          <div className="flex items-center gap-3 border-b border-slate-800/80 pb-4 mb-6">
            <span className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center font-bold text-sm">1</span>
            <h2 className="text-xl font-bold text-white">Personal Information</h2>
          </div>

          {profileLoading ? (
            <div className="flex justify-center py-6">
              <svg className="animate-spin h-6 w-6 text-violet-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              {profileError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">{profileError}</div>
              )}
              {profileSuccess && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">Personal information saved successfully!</div>
              )}

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={e => setProfile({ ...profile, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-700 text-sm transition-all outline-none"
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Date of Birth</label>
                    <input
                      type="date"
                      value={profile.dob}
                      onChange={e => setProfile({ ...profile, dob: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 rounded-xl px-4 py-3 text-white text-sm transition-all outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Age</label>
                    <input
                      type="text"
                      value={profileAge}
                      disabled
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-500 text-sm transition-all outline-none cursor-not-allowed font-medium"
                      placeholder="Auto"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Social Security Number (SSN)</label>
                  <input
                    type="text"
                    value={profile.ssn}
                    onChange={e => setProfile({ ...profile, ssn: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-700 text-sm transition-all outline-none"
                    placeholder="000-00-0000"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Email Address</label>
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-500 text-sm outline-none cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={e => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-700 text-sm transition-all outline-none"
                    placeholder="(123) 456-7890"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">No Taxes Members</label>
                  <input
                    type="number"
                    value={profile.tax_members}
                    onChange={e => setProfile({ ...profile, tax_members: e.target.value === '' ? '' : Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-700 text-sm transition-all outline-none"
                    placeholder="0"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Gender</label>
                  <div className="grid grid-cols-2 gap-4">
                    {['Female', 'Male'].map(opt => (
                      <label
                        key={opt}
                        className={`flex items-center justify-center border rounded-xl py-3 text-sm cursor-pointer transition-all ${
                          profile.gender === opt
                            ? 'bg-violet-600/20 border-violet-500 text-white font-medium shadow-md shadow-violet-500/5'
                            : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="gender"
                          value={opt}
                          checked={profile.gender === opt}
                          onChange={() => setProfile({ ...profile, gender: opt as any })}
                          className="sr-only"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Marital Status</label>
                  <div className="grid grid-cols-2 gap-4">
                    {['Single', 'Married'].map(opt => (
                      <label
                        key={opt}
                        className={`flex items-center justify-center border rounded-xl py-3 text-sm cursor-pointer transition-all ${
                          profile.marital_status === opt
                            ? 'bg-violet-600/20 border-violet-500 text-white font-medium shadow-md shadow-violet-500/5'
                            : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="marital_status"
                          value={opt}
                          checked={profile.marital_status === opt}
                          onChange={() => setProfile({ ...profile, marital_status: opt as any })}
                          className="sr-only"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Immigration Status</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {['Resident', 'EAC', 'Citizen', 'Other'].map(opt => (
                      <label
                        key={opt}
                        className={`flex items-center justify-center border rounded-xl py-3 text-sm cursor-pointer transition-all ${
                          profile.immigration_status === opt
                            ? 'bg-violet-600/20 border-violet-500 text-white font-medium shadow-md shadow-violet-500/5'
                            : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="immigration_status"
                          value={opt}
                          checked={profile.immigration_status === opt}
                          onChange={() => setProfile({ ...profile, immigration_status: opt as any })}
                          className="sr-only"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-semibold rounded-xl px-6 py-3 text-sm transition-all duration-300 shadow-md shadow-violet-500/10 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                >
                  {profileSaving ? 'Saving Information...' : 'Save Personal Details'}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Section 2: Residence Information Card */}
        <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-xl">
          <div className="flex items-center gap-3 border-b border-slate-800/80 pb-4 mb-6">
            <span className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-sm">2</span>
            <h2 className="text-xl font-bold text-white">Residence Information</h2>
          </div>

          {residenceLoading ? (
            <div className="flex justify-center py-6">
              <svg className="animate-spin h-6 w-6 text-cyan-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : (
            <form onSubmit={handleSaveResidence} className="space-y-6">
              {residenceError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">{residenceError}</div>
              )}
              {residenceSuccess && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">Residence information saved successfully!</div>
              )}

              <div className="grid gap-6 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Street Address</label>
                  <input
                    type="text"
                    value={residence.address}
                    onChange={e => setResidence({ ...residence, address: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-700 text-sm transition-all outline-none"
                    placeholder="123 Main St"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">City</label>
                  <input
                    type="text"
                    value={residence.city}
                    onChange={e => setResidence({ ...residence, city: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-700 text-sm transition-all outline-none"
                    placeholder="Miami"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Zip Code</label>
                    <input
                      type="text"
                      value={residence.zip_code}
                      onChange={e => setResidence({ ...residence, zip_code: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-700 text-sm transition-all outline-none"
                      placeholder="33101"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">County</label>
                    <input
                      type="text"
                      value={residence.county}
                      onChange={e => setResidence({ ...residence, county: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-700 text-sm transition-all outline-none"
                      placeholder="Miami-Dade"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={residenceSaving}
                  className="bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-semibold rounded-xl px-6 py-3 text-sm transition-all duration-300 shadow-md shadow-violet-500/10 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                >
                  {residenceSaving ? 'Saving Information...' : 'Save Residence Details'}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Section 3: Income Information Card */}
        <section className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-sm">3</span>
              <h2 className="text-xl font-bold text-white">Income Information</h2>
            </div>
            <button
              onClick={() => openIncomeModal()}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all duration-300 shadow-md active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Add Income Stream
            </button>
          </div>

          {incomeLoading ? (
            <div className="flex justify-center py-6">
              <svg className="animate-spin h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : incomes.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl bg-slate-950/20">
              <svg className="w-12 h-12 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-300">No income records configured</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">Please add your income streams (W2, 1099) below to complete this section.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-850">
              <table className="w-full text-left text-sm text-slate-300 bg-slate-950/20">
                <thead className="bg-slate-900/60 text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-850">
                  <tr>
                    <th className="px-6 py-4">Relationship</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Employer Name</th>
                    <th className="px-6 py-4">Employer Phone</th>
                    <th className="px-6 py-4">Income</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {incomes.map(row => (
                    <tr key={row.id} className="hover:bg-slate-900/20 transition-colors">
                      <td className="px-6 py-4 font-medium text-white">{row.relationship_to_applicant}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                          row.income_type === 'W2'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {row.income_type}
                        </span>
                      </td>
                      <td className="px-6 py-4">{row.employer_name}</td>
                      <td className="px-6 py-4 text-slate-400">{row.employer_phone || '-'}</td>
                      <td className="px-6 py-4 text-emerald-400 font-semibold">${Number(row.income).toLocaleString()}</td>
                      <td className="px-6 py-4 text-right space-x-3">
                        <button
                          onClick={() => openIncomeModal(row)}
                          className="text-violet-400 hover:text-violet-300 font-semibold transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteIncome(row.id!)}
                          className="text-rose-400 hover:text-rose-300 font-semibold transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Modal for adding/editing income */}
      {isIncomeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-6">
              <h3 className="text-xl font-bold text-white">
                {editingIncome ? 'Edit Income Stream' : 'Add Income Stream'}
              </h3>
              <button
                onClick={() => setIsIncomeModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {modalError && (
              <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveIncomeRow} className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Relationship to Applicant</label>
                <select
                  value={modalForm.relationship_to_applicant}
                  onChange={e => setModalForm({ ...modalForm, relationship_to_applicant: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 rounded-xl px-4 py-3 text-white text-sm outline-none transition-all"
                  required
                >
                  <option value="" disabled>Select relationship</option>
                  {['Applicant', 'Spouse', 'Son/Daughter', 'Mother', 'Father', 'Other'].map(opt => (
                    <option key={opt} value={opt} className="bg-slate-900">{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Type of Income</label>
                <select
                  value={modalForm.income_type}
                  onChange={e => setModalForm({ ...modalForm, income_type: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 rounded-xl px-4 py-3 text-white text-sm outline-none transition-all"
                  required
                >
                  <option value="" disabled>Select income type</option>
                  {['W2', '1099'].map(opt => (
                    <option key={opt} value={opt} className="bg-slate-900">{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Employer Name</label>
                <input
                  type="text"
                  value={modalForm.employer_name}
                  onChange={e => setModalForm({ ...modalForm, employer_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-700 text-sm outline-none transition-all"
                  placeholder="Enterprise Inc."
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Employer Phone</label>
                <input
                  type="tel"
                  value={modalForm.employer_phone}
                  onChange={e => setModalForm({ ...modalForm, employer_phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-700 text-sm outline-none transition-all"
                  placeholder="(123) 456-7890"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Income Amount (Annual)</label>
                <input
                  type="number"
                  value={modalForm.income}
                  onChange={e => setModalForm({ ...modalForm, income: e.target.value === '' ? '' : Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-700 text-sm outline-none transition-all"
                  placeholder="50000"
                  required
                />
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setIsIncomeModalOpen(false)}
                  className="border border-slate-850 hover:bg-slate-850 text-slate-300 font-semibold rounded-xl px-5 py-3 text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-semibold rounded-xl px-5 py-3 text-sm transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
                >
                  {modalSaving ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
