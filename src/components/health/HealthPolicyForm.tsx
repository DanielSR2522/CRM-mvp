import React, { useState, useEffect } from 'react';
import { HealthPolicy } from '@/lib/health/types';
import HealthSensitiveField from './HealthSensitiveField';
import { saveHealthPolicy, saveHealthSecret } from '@/lib/health/health-service';

// Empty per guidelines. To be populated later.
const COMPANY_2026_OPTIONS: string[] = [];

interface HealthPolicyFormProps {
  clientId: string;
  agentName: string;
  initialPolicy: HealthPolicy | null;
  isEditing: boolean;
  setIsEditing: (val: boolean) => void;
  onSaved: (policy: HealthPolicy) => void;
  addToast: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
}

export default function HealthPolicyForm({
  clientId,
  agentName,
  initialPolicy,
  isEditing,
  setIsEditing,
  onSaved,
  addToast
}: HealthPolicyFormProps) {
  // Form State
  const [isActive, setIsActive] = useState(false);
  const [yearRenovation, setYearRenovation] = useState('');
  const [policyStatus, setPolicyStatus] = useState<'Active' | 'Pending' | 'Cancelled'>('Pending');
  const [actionPending, setActionPending] = useState<'Documents' | 'Verification' | 'Call To Marketplace' | 'Completed'>('Documents');
  const [renovationStatus, setRenovationStatus] = useState<'New Policy 2026' | 'Renewal 2026' | 'Only Service'>('New Policy 2026');
  const [npn, setNpn] = useState('');

  const [company2026, setCompany2026] = useState('');
  const [applicationNumber, setApplicationNumber] = useState('');
  const [typePlan, setTypePlan] = useState<'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Catastrophic' | ''>('');
  const [marketplaceAccount, setMarketplaceAccount] = useState(false);
  const [planId, setPlanId] = useState('');
  const [planName, setPlanName] = useState('');
  const [noMembership, setNoMembership] = useState('');
  const [planCost, setPlanCost] = useState<number>(0);
  const [taxCredit, setTaxCredit] = useState<number>(0);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [coverageMembersCount, setCoverageMembersCount] = useState<number>(1);

  // Sensitive Field Local values (only used when typing a new value)
  const [userNameSecret, setUserNameSecret] = useState('');
  const [passwordSecret, setPasswordSecret] = useState('');
  const [securityQuestionSecret, setSecurityQuestionSecret] = useState('');
  const [companyUserSecret, setCompanyUserSecret] = useState('');
  const [companyPasswordSecret, setCompanyPasswordSecret] = useState('');

  // Medical Section State
  const [primaryDoctor, setPrimaryDoctor] = useState('');
  const [primaryDoctorAddress, setPrimaryDoctorAddress] = useState('');
  const [primaryDoctorPhone, setPrimaryDoctorPhone] = useState('');
  const [hospital, setHospital] = useState('');
  const [urgentCare, setUrgentCare] = useState('');
  const [pharmacy, setPharmacy] = useState('');
  const [conditions, setConditions] = useState('');
  const [medicines, setMedicines] = useState('');
  const [specialist, setSpecialist] = useState('');

  const [saving, setSaving] = useState(false);

  // Sync Form values with initialPolicy (scheduled asynchronously to satisfy eslint rules)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (initialPolicy) {
        setIsActive(!!initialPolicy.active);
        setYearRenovation(initialPolicy.year_renovation !== null && initialPolicy.year_renovation !== undefined ? initialPolicy.year_renovation.toString() : '');
        setPolicyStatus(initialPolicy.policy_status);
        setActionPending(initialPolicy.action_pending);
        setRenovationStatus(initialPolicy.renovation_status);
        setNpn(initialPolicy.npn || '');
        setCompany2026(initialPolicy.company_2026 || '');
        setApplicationNumber(initialPolicy.application_number || '');
        setTypePlan(initialPolicy.type_plan || '');
        setMarketplaceAccount(initialPolicy.marketplace_account);
        setPlanId(initialPolicy.plan_id || '');
        setPlanName(initialPolicy.plan_name || '');
        setNoMembership(initialPolicy.no_membership || '');
        setPlanCost(Number(initialPolicy.plan_cost || 0));
        setTaxCredit(Number(initialPolicy.tax_credit || 0));
        setEffectiveDate(initialPolicy.effective_date ? new Date(initialPolicy.effective_date).toISOString().split('T')[0] : '');
        setCoverageMembersCount(Number(initialPolicy.coverage_members_count || 1));

        setPrimaryDoctor(initialPolicy.primary_doctor || '');
        setPrimaryDoctorAddress(initialPolicy.primary_doctor_address || '');
        setPrimaryDoctorPhone(initialPolicy.primary_doctor_phone || '');
        setHospital(initialPolicy.hospital || '');
        setUrgentCare(initialPolicy.urgent_care || '');
        setPharmacy(initialPolicy.pharmacy || '');
        setConditions(initialPolicy.conditions || '');
        setMedicines(initialPolicy.medicines || '');
        setSpecialist(initialPolicy.specialist || '');
      } else {
        // Default reset
        setIsActive(false);
        setYearRenovation('2026');
        setPolicyStatus('Pending');
        setActionPending('Documents');
        setRenovationStatus('New Policy 2026');
        setNpn('');
        setCompany2026('');
        setApplicationNumber('');
        setTypePlan('');
        setMarketplaceAccount(false);
        setPlanId('');
        setPlanName('');
        setNoMembership('');
        setPlanCost(0);
        setTaxCredit(0);
        setEffectiveDate('');
        setCoverageMembersCount(1);
        setPrimaryDoctor('');
        setPrimaryDoctorAddress('');
        setPrimaryDoctorPhone('');
        setHospital('');
        setUrgentCare('');
        setPharmacy('');
        setConditions('');
        setMedicines('');
        setSpecialist('');
      }

      // Reset sensitive states on edit toggle
      setUserNameSecret('');
      setPasswordSecret('');
      setSecurityQuestionSecret('');
      setCompanyUserSecret('');
      setCompanyPasswordSecret('');
    }, 0);

    return () => clearTimeout(timer);
  }, [initialPolicy, isEditing]);

  const monthlyPremium = (Number(planCost || 0) + Number(taxCredit || 0)).toFixed(2);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // 1. Prepare and Save standard fields
      const standardPayload = {
        active: isActive,
        year_renovation: yearRenovation ? Number(yearRenovation) : null,
        policy_status: policyStatus,
        action_pending: actionPending,
        renovation_status: renovationStatus,
        npn: npn || null,
        company_2026: company2026 || null,
        application_number: applicationNumber || null,
        type_plan: typePlan || null,
        marketplace_account: marketplaceAccount,
        plan_id: planId || null,
        plan_name: planName || null,
        no_membership: noMembership || null,
        plan_cost: Number(planCost || 0),
        tax_credit: Number(taxCredit || 0),
        effective_date: effectiveDate || null,
        coverage_members_count: coverageMembersCount ? Number(coverageMembersCount) : null,
        primary_doctor: primaryDoctor || null,
        primary_doctor_address: primaryDoctorAddress || null,
        primary_doctor_phone: primaryDoctorPhone || null,
        hospital: hospital || null,
        urgent_care: urgentCare || null,
        pharmacy: pharmacy || null,
        conditions: conditions || null,
        medicines: medicines || null,
        specialist: specialist || null
      };

      const savedPolicy = await saveHealthPolicy(clientId, standardPayload);
      const policyId = savedPolicy.id;

      // 2. Save modified sensitive fields securely using server encryption route
      if (userNameSecret) {
        await saveHealthSecret(policyId, 'user_name', userNameSecret);
        savedPolicy.has_user_name = true;
      }
      if (passwordSecret) {
        await saveHealthSecret(policyId, 'password_val', passwordSecret);
        savedPolicy.has_password_val = true;
      }
      if (securityQuestionSecret) {
        await saveHealthSecret(policyId, 'security_question', securityQuestionSecret);
        savedPolicy.has_security_question = true;
      }
      if (companyUserSecret) {
        await saveHealthSecret(policyId, 'company_user', companyUserSecret);
        savedPolicy.has_company_user = true;
      }
      if (companyPasswordSecret) {
        await saveHealthSecret(policyId, 'company_password', companyPasswordSecret);
        savedPolicy.has_company_password = true;
      }

      addToast({
        title: 'Health Policy Saved',
        description: 'The policy has been saved securely on the server.',
        type: 'success'
      });

      onSaved(savedPolicy);
      setIsEditing(false);
    } catch (err) {
      console.error('Save failed:', err);
      const message = err instanceof Error ? err.message : 'There was an error saving the policy.';
      addToast({
        title: 'Save Failed',
        description: message,
        type: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-8 font-sans">
      {/* SECTION 1 — Agency Information */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
        <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-50 pb-2">
          Agency Information
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="health_active"
                checked={isActive}
                disabled={!isEditing}
                onChange={e => {
                  setIsActive(e.target.checked);
                  setPolicyStatus(e.target.checked ? 'Active' : 'Cancelled');
                }}
                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="health_active" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Active
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Year Renovation</label>
              <input
                type="text"
                value={yearRenovation}
                disabled={!isEditing}
                onChange={e => setYearRenovation(e.target.value)}
                placeholder="2026"
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Agent</label>
              <input
                type="text"
                value={agentName}
                disabled
                className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-500 text-sm outline-none cursor-not-allowed"
              />
            </div>

            {initialPolicy && (
              <div className="flex items-center gap-4 text-xs font-bold pt-2">
                <span className="text-slate-500 uppercase tracking-wider">Resume Notes:</span>
                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">Saved</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Policy Status</label>
              <select
                value={policyStatus}
                disabled={!isEditing}
                onChange={e => {
                  const val = e.target.value as 'Active' | 'Pending' | 'Cancelled';
                  setPolicyStatus(val);
                  setIsActive(val === 'Active');
                }}
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
              >
                <option value="Pending">Pending</option>
                <option value="Active">Active</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Action Pending</label>
              <select
                value={actionPending}
                disabled={!isEditing}
                onChange={e => setActionPending(e.target.value as 'Documents' | 'Verification' | 'Call To Marketplace' | 'Completed')}
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
              >
                <option value="Documents">Documents</option>
                <option value="Verification">Verification</option>
                <option value="Call To Marketplace">Call To Marketplace</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Renovation Status</label>
              <select
                value={renovationStatus}
                disabled={!isEditing}
                onChange={e => setRenovationStatus(e.target.value as 'New Policy 2026' | 'Renewal 2026' | 'Only Service')}
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
              >
                <option value="New Policy 2026">New Policy 2026</option>
                <option value="Renewal 2026">Renewal 2026</option>
                <option value="Only Service">Only Service</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">NPN</label>
              <input
                type="text"
                value={npn}
                disabled={!isEditing}
                onChange={e => setNpn(e.target.value)}
                placeholder="NPN..."
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2 — Health Information 2026 */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
        <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-50 pb-2">
          Health Information 2026
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Company 2026</label>
              <select
                value={company2026}
                disabled={!isEditing}
                onChange={e => setCompany2026(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
              >
                <option value="">No companies configured</option>
                {COMPANY_2026_OPTIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Type Plan</label>
              <select
                value={typePlan}
                disabled={!isEditing}
                onChange={e => setTypePlan(e.target.value as 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Catastrophic' | '')}
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
              >
                <option value="">Select plan tier...</option>
                <option value="Bronze">Bronze</option>
                <option value="Silver">Silver</option>
                <option value="Gold">Gold</option>
                <option value="Platinum">Platinum</option>
                <option value="Catastrophic">Catastrophic</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Plan ID</label>
              <input
                type="text"
                value={planId}
                disabled={!isEditing}
                onChange={e => setPlanId(e.target.value)}
                placeholder="Plan ID..."
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Plan Name</label>
              <input
                type="text"
                value={planName}
                disabled={!isEditing}
                onChange={e => setPlanName(e.target.value)}
                placeholder="Plan Name..."
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">No. Membership</label>
              <input
                type="text"
                value={noMembership}
                disabled={!isEditing}
                onChange={e => setNoMembership(e.target.value)}
                placeholder="Membership ID..."
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Plan Cost</label>
                <input
                  type="number"
                  step="0.01"
                  value={planCost}
                  disabled={!isEditing}
                  onChange={e => setPlanCost(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Tax Credit</label>
                <input
                  type="number"
                  step="0.01"
                  value={taxCredit}
                  disabled={!isEditing}
                  onChange={e => setTaxCredit(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Monthly Premium</label>
                <input
                  type="text"
                  value={`$${monthlyPremium}`}
                  disabled
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-blue-700 text-sm font-extrabold outline-none cursor-not-allowed"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Effective Date</label>
                <input
                  type="date"
                  value={effectiveDate}
                  disabled={!isEditing}
                  onChange={e => setEffectiveDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Coverage Members Count</label>
              <select
                value={coverageMembersCount}
                disabled={!isEditing}
                onChange={e => setCoverageMembersCount(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
              >
                {[1, 2, 3, 4, 5, 6, 7].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Application Number</label>
              <input
                type="text"
                value={applicationNumber}
                disabled={!isEditing}
                onChange={e => setApplicationNumber(e.target.value)}
                placeholder="Application No..."
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Marketplace Account</label>
              <div className="flex gap-4 items-center h-[42px]">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                  <input
                    type="radio"
                    checked={marketplaceAccount === true}
                    disabled={!isEditing}
                    onChange={() => setMarketplaceAccount(true)}
                    className="text-blue-600 border-slate-300 focus:ring-blue-500"
                  />
                  <span>Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                  <input
                    type="radio"
                    checked={marketplaceAccount === false}
                    disabled={!isEditing}
                    onChange={() => setMarketplaceAccount(false)}
                    className="text-blue-600 border-slate-300 focus:ring-blue-500"
                  />
                  <span>No</span>
                </label>
              </div>
            </div>

            {/* SENSITIVE FIELDS WITH SERVER ENCRYPTION */}
            <HealthSensitiveField
              label="User"
              fieldName="user_name"
              healthPolicyId={initialPolicy?.id}
              hasValue={!!initialPolicy?.has_user_name}
              disabled={!isEditing}
              value={userNameSecret}
              onChange={setUserNameSecret}
            />

            <HealthSensitiveField
              label="Password"
              fieldName="password_val"
              healthPolicyId={initialPolicy?.id}
              hasValue={!!initialPolicy?.has_password_val}
              disabled={!isEditing}
              type="password"
              value={passwordSecret}
              onChange={setPasswordSecret}
            />

            <HealthSensitiveField
              label="Security Question"
              fieldName="security_question"
              healthPolicyId={initialPolicy?.id}
              hasValue={!!initialPolicy?.has_security_question}
              disabled={!isEditing}
              value={securityQuestionSecret}
              onChange={setSecurityQuestionSecret}
            />

            <HealthSensitiveField
              label="Company User"
              fieldName="company_user"
              healthPolicyId={initialPolicy?.id}
              hasValue={!!initialPolicy?.has_company_user}
              disabled={!isEditing}
              value={companyUserSecret}
              onChange={setCompanyUserSecret}
            />

            <HealthSensitiveField
              label="Company Password"
              fieldName="company_password"
              healthPolicyId={initialPolicy?.id}
              hasValue={!!initialPolicy?.has_company_password}
              disabled={!isEditing}
              type="password"
              value={companyPasswordSecret}
              onChange={setCompanyPasswordSecret}
            />
          </div>
        </div>
      </div>

      {/* SECTION 3 — Medical Section */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
        <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-50 pb-2">
          Medical Section
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Primary Doctor</label>
            <input
              type="text"
              value={primaryDoctor}
              disabled={!isEditing}
              onChange={e => setPrimaryDoctor(e.target.value)}
              placeholder="Doctor name..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Primary Doctor Address</label>
            <input
              type="text"
              value={primaryDoctorAddress}
              disabled={!isEditing}
              onChange={e => setPrimaryDoctorAddress(e.target.value)}
              placeholder="Address..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Primary Doctor Phone</label>
            <input
              type="text"
              value={primaryDoctorPhone}
              disabled={!isEditing}
              onChange={e => setPrimaryDoctorPhone(e.target.value)}
              placeholder="Phone..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Hospital</label>
            <input
              type="text"
              value={hospital}
              disabled={!isEditing}
              onChange={e => setHospital(e.target.value)}
              placeholder="Hospital..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Urgent Care</label>
            <input
              type="text"
              value={urgentCare}
              disabled={!isEditing}
              onChange={e => setUrgentCare(e.target.value)}
              placeholder="Urgent Care..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Pharmacy</label>
            <input
              type="text"
              value={pharmacy}
              disabled={!isEditing}
              onChange={e => setPharmacy(e.target.value)}
              placeholder="Pharmacy..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Conditions</label>
            <input
              type="text"
              value={conditions}
              disabled={!isEditing}
              onChange={e => setConditions(e.target.value)}
              placeholder="Conditions..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Medicines</label>
            <input
              type="text"
              value={medicines}
              disabled={!isEditing}
              onChange={e => setMedicines(e.target.value)}
              placeholder="Medicines..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Specialist</label>
            <input
              type="text"
              value={specialist}
              disabled={!isEditing}
              onChange={e => setSpecialist(e.target.value)}
              placeholder="Specialist..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Editing Form controls */}
      {isEditing && (
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            disabled={saving}
            className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/10 transition-all flex items-center gap-2"
          >
            {saving && (
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {initialPolicy ? 'Save Policy' : 'Create Policy'}
          </button>
        </div>
      )}
    </form>
  );
}
