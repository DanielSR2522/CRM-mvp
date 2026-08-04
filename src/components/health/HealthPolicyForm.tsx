import React, { useState, useEffect } from 'react';
import { HealthPolicy, HealthTaxHouseholdMember } from '@/lib/health/types';
import HealthSensitiveField from './HealthSensitiveField';
import TaxMemberSensitiveField from './TaxMemberSensitiveField';
import {
  saveHealthPolicy,
  saveHealthSecret,
  fetchTaxHouseholdMembers,
  upsertTaxHouseholdMember,
  deleteTaxHouseholdMembers,
  updateHealthPolicyTaxHouseholdCount,
  saveTaxMemberSecret,
  fetchHealthNotes,
  fetchHealthDocuments
} from '@/lib/health/health-service';
import { supabase } from '@/lib/supabaseClient';
import {
  formatIsoToUsDate,
  formatDateForDisplay,
  parseDisplayDate,
  isValidDisplayDate,
  calculateAgeFromDateOnly,
  formatAsDateInput
} from '@/utils/dateUtils';
import MarketplacePlanLookupPanel from './MarketplacePlanLookupPanel';
import { MarketplacePlanPreview } from '@/lib/marketplace/types';
import { saveMarketplacePlanSnapshot, fetchLatestMarketplaceSnapshot } from '@/lib/marketplace/snapshot-service';

// Helper to calculate age dynamically from DOB string without timezone offset
const calculateAgeFromDob = (dobStr: string | null | undefined): string => {
  const age = calculateAgeFromDateOnly(dobStr);
  return age !== null ? `${age} yrs` : '—';
};

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

  // Tax Household Members State
  const [taxMemberCount, setTaxMemberCount] = useState<number>(1);
  const [taxMembers, setTaxMembers] = useState<{ [memberNumber: number]: HealthTaxHouseholdMember }>({});
  const [taxMemberSecrets, setTaxMemberSecrets] = useState<{ [key: string]: string }>({});
  const [pendingCountReduction, setPendingCountReduction] = useState<{ newCount: number; membersToDelete: number[] } | null>(null);
  const [deletedMemberNumbers, setDeletedMemberNumbers] = useState<number[]>([]);

  // Sensitive Field Local values for Policy Credential Secrets
  const [userNameSecret, setUserNameSecret] = useState('');
  const [passwordSecret, setPasswordSecret] = useState('');
  const [securityQuestionSecret, setSecurityQuestionSecret] = useState('');
  const [companyUserSecret, setCompanyUserSecret] = useState('');
  const [companyPasswordSecret, setCompanyPasswordSecret] = useState('');
  const [companyAccount, setCompanyAccount] = useState<boolean>(
    !!initialPolicy?.has_company_user || !!initialPolicy?.has_company_password
  );

  // Local Tax Household Changes Protection Guard
  const hasLocalTaxChangesRef = React.useRef<boolean>(false);

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

  // Agency Info Summary Meta States
  const [notesCount, setNotesCount] = useState<number>(0);
  const [documentsCount, setDocumentsCount] = useState<number>(0);
  const [isConsentReady, setIsConsentReady] = useState<boolean>(false);

  // Agency Info Field-level Inline Edit State
  const [editingAgencyField, setEditingAgencyField] = useState<string | null>(null);
  const [agencyDraftValue, setAgencyDraftValue] = useState<any>(null);
  const [agencyFieldSaving, setAgencyFieldSaving] = useState<boolean>(false);
  const [agencyFieldError, setAgencyFieldError] = useState<string | null>(null);

  // Health Info Field-level Inline Edit State
  const [editingHealthField, setEditingHealthField] = useState<string | null>(null);
  const [healthDraftValue, setHealthDraftValue] = useState<any>(null);
  const [healthFieldSaving, setHealthFieldSaving] = useState<boolean>(false);
  const [healthFieldError, setHealthFieldError] = useState<string | null>(null);

  // Tax Member Field-level Inline Edit State
  const [editingTaxMemberField, setEditingTaxMemberField] = useState<string | null>(null);
  const [taxMemberDraftValue, setTaxMemberDraftValue] = useState<any>(null);
  const [taxMemberFieldError, setTaxMemberFieldError] = useState<string | null>(null);

  // Marketplace Applied Plan State
  const [appliedMarketplacePlan, setAppliedMarketplacePlan] = useState<MarketplacePlanPreview | null>(null);

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
        setCompanyAccount(!!initialPolicy.has_company_user || !!initialPolicy.has_company_password);
        setPlanId(initialPolicy.plan_id || '');
        setPlanName(initialPolicy.plan_name || '');
        setNoMembership(initialPolicy.no_membership || '');
        setPlanCost(Number(initialPolicy.plan_cost || 0));
        setTaxCredit(Number(initialPolicy.tax_credit || 0));
        setEffectiveDate(initialPolicy.effective_date ? initialPolicy.effective_date.split('T')[0].split(' ')[0] : '');
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

        // Fetch Notes Count
        fetchHealthNotes(initialPolicy.id)
          .then(notes => setNotesCount(notes.length))
          .catch(() => setNotesCount(0));

        // Fetch Documents Count
        fetchHealthDocuments(initialPolicy.id)
          .then(docs => setDocumentsCount(docs.length))
          .catch(() => setDocumentsCount(0));

        // Check Consent Ready status from signature_requests
        supabase
          .from('signature_requests')
          .select('id, status')
          .or(`policy_id.eq.${initialPolicy.id},client_id.eq.${clientId}`)
          .eq('status', 'signed')
          .limit(1)
          .then(({ data, error }) => {
            setIsConsentReady(!error && !!(data && data.length > 0));
          });

        // Fetch Tax Household Members (only if local unsaved changes are not active)
        if (!hasLocalTaxChangesRef.current) {
          const savedPolicyCount = initialPolicy.number_of_people_on_tax_return;
          fetchTaxHouseholdMembers(initialPolicy.id)
            .then(fetched => {
              if (hasLocalTaxChangesRef.current) return;
              const map: { [key: number]: HealthTaxHouseholdMember } = {};
              let highestMemberNum = 1;
              fetched.forEach(m => {
                map[m.member_number] = m;
                if (m.member_number > highestMemberNum) highestMemberNum = m.member_number;
              });

              // Resolved count priority:
              // 1. Saved policy count (if valid >= 1)
              // 2. Fallback: max(1, highest fetched member_number)
              const targetCount = (savedPolicyCount !== undefined && savedPolicyCount !== null && savedPolicyCount >= 1)
                ? Math.max(savedPolicyCount, highestMemberNum)
                : highestMemberNum;

              // Ensure local placeholders exist for members 2..targetCount
              for (let i = 2; i <= targetCount; i++) {
                if (!map[i]) {
                  map[i] = {
                    health_policy_id: initialPolicy.id,
                    member_number: i,
                    coverage: true,
                    full_name: '',
                    date_of_birth: '',
                    relationship_to_applicant: 'Spouse',
                    immigration_status: ''
                  };
                }
              }

              setTaxMembers(map);
              setTaxMemberCount(targetCount);
            })
            .catch(err => {
              console.error('Failed to load tax household members:', err);
            });
        }

        // Fetch Marketplace Snapshot if available
        fetchLatestMarketplaceSnapshot(initialPolicy.id)
          .then(({ snapshot, benefits }) => {
            if (snapshot) {
              const preview: MarketplacePlanPreview = {
                id: snapshot.plan_id,
                issuerName: snapshot.issuer_name || 'Marketplace Carrier',
                planName: snapshot.plan_name || 'Marketplace Plan',
                coverageYear: snapshot.coverage_year || 2026,
                metalLevel: snapshot.metal_level || '',
                planType: snapshot.plan_type || '',
                networkType: snapshot.network_type || '',
                premiumFull: Number(snapshot.premium_full || 0),
                taxCredit: Number(snapshot.tax_credit || 0),
                premiumNet: Number(snapshot.premium_net || 0),
                premiumAnnual: Number(snapshot.premium_annual || 0),
                deductibleIndividual: snapshot.deductible_individual !== null ? Number(snapshot.deductible_individual) : null,
                deductibleFamily: snapshot.deductible_family !== null ? Number(snapshot.deductible_family) : null,
                drugDeductibleIndividual: snapshot.drug_deductible_individual !== null ? Number(snapshot.drug_deductible_individual) : null,
                drugDeductibleFamily: snapshot.drug_deductible_family !== null ? Number(snapshot.drug_deductible_family) : null,
                oopMaxIndividual: snapshot.oop_max_individual !== null ? Number(snapshot.oop_max_individual) : null,
                oopMaxFamily: snapshot.oop_max_family !== null ? Number(snapshot.oop_max_family) : null,
                benefits: benefits.map(b => ({
                  category: b.category,
                  serviceName: b.service_name,
                  copayAmount: b.copay_amount !== null ? Number(b.copay_amount) : null,
                  coinsurancePercentage: b.coinsurance_percentage !== null ? Number(b.coinsurance_percentage) : null,
                  deductibleApplies: !!b.deductible_applies,
                  coverageStatus: b.coverage_status || 'Covered',
                  individualValue: b.individual_value || '',
                  familyValue: b.family_value || '',
                  limitations: b.limitations || '',
                  notes: b.notes || '',
                  sourceText: b.source_text || '',
                  sourceUrl: b.source_url || '',
                  sortOrder: b.sort_order
                })),
                rawPlan: snapshot.raw_response
              };
              setAppliedMarketplacePlan(preview);
            }
          })
          .catch(err => {
            console.error('Failed to load marketplace snapshot:', err);
          });
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
        setTaxMemberCount(1);
        setTaxMembers({});
        setPrimaryDoctor('');
        setPrimaryDoctorAddress('');
        setPrimaryDoctorPhone('');
        setHospital('');
        setUrgentCare('');
        setPharmacy('');
        setConditions('');
        setMedicines('');
        setSpecialist('');
        setAppliedMarketplacePlan(null);
      }

      // Reset sensitive states on edit toggle
      setUserNameSecret('');
      setPasswordSecret('');
      setSecurityQuestionSecret('');
      setCompanyUserSecret('');
      setCompanyPasswordSecret('');
      setTaxMemberSecrets({});
      setPendingCountReduction(null);
      setDeletedMemberNumbers([]);
    }, 0);

    return () => clearTimeout(timer);
  }, [initialPolicy, isEditing]);

  const handleApplyMarketplacePlan = (plan: MarketplacePlanPreview) => {
    if (plan.issuerName) setCompany2026(plan.issuerName);
    const validMetalTypes = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Catastrophic'];
    const matchedMetal = validMetalTypes.find(m => m.toLowerCase() === (plan.metalLevel || '').toLowerCase());
    if (matchedMetal) {
      setTypePlan(matchedMetal as any);
    }
    if (plan.id) setPlanId(plan.id);
    if (plan.planName) setPlanName(plan.planName);
    if (typeof plan.premiumFull === 'number') setPlanCost(plan.premiumFull);
    if (typeof plan.taxCredit === 'number') setTaxCredit(plan.taxCredit);
    if (plan.coverageYear) setYearRenovation(plan.coverageYear.toString());
    setAppliedMarketplacePlan(plan);
  };

  const handleInlineSaveAgencyField = async (fieldName: string, newValue: any) => {
    setAgencyFieldSaving(true);
    setAgencyFieldError(null);
    try {
      let updatedActive = isActive;
      let updatedYearRenovation = yearRenovation;
      let updatedPolicyStatus = policyStatus;
      let updatedActionPending = actionPending;
      let updatedRenovationStatus = renovationStatus;
      let updatedNpn = npn;

      if (fieldName === 'active') {
        updatedActive = newValue;
        setIsActive(newValue);
      } else if (fieldName === 'yearRenovation') {
        updatedYearRenovation = newValue;
        setYearRenovation(newValue);
      } else if (fieldName === 'policyStatus') {
        updatedPolicyStatus = newValue;
        setPolicyStatus(newValue);
      } else if (fieldName === 'actionPending') {
        updatedActionPending = newValue;
        setActionPending(newValue);
      } else if (fieldName === 'renovationStatus') {
        updatedRenovationStatus = newValue;
        setRenovationStatus(newValue);
      } else if (fieldName === 'npn') {
        updatedNpn = newValue;
        setNpn(newValue);
      }

      if (initialPolicy?.id) {
        const standardPayload = {
          id: initialPolicy.id,
          active: updatedActive,
          year_renovation: updatedYearRenovation ? Number(updatedYearRenovation) : null,
          policy_status: updatedPolicyStatus,
          action_pending: updatedActionPending,
          renovation_status: updatedRenovationStatus,
          npn: updatedNpn || null,
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

        const saved = await saveHealthPolicy(clientId, standardPayload);
        onSaved(saved);
      }

      setEditingAgencyField(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save field';
      setAgencyFieldError(msg);
    } finally {
      setAgencyFieldSaving(false);
    }
  };

  const handleInlineSaveHealthField = async (fieldName: string, newValue: any) => {
    setHealthFieldSaving(true);
    setHealthFieldError(null);
    try {
      let updatedCompany2026 = company2026;
      let updatedTypePlan = typePlan;
      let updatedPlanId = planId;
      let updatedPlanName = planName;
      let updatedNoMembership = noMembership;
      let updatedPlanCost = planCost;
      let updatedTaxCredit = taxCredit;
      let updatedEffectiveDate = effectiveDate;
      let updatedCoverageMembersCount = coverageMembersCount;
      let updatedApplicationNumber = applicationNumber;
      let updatedMarketplaceAccount = marketplaceAccount;

      if (fieldName === 'company2026') {
        updatedCompany2026 = newValue;
        setCompany2026(newValue);
      } else if (fieldName === 'typePlan') {
        updatedTypePlan = newValue;
        setTypePlan(newValue);
      } else if (fieldName === 'planId') {
        updatedPlanId = newValue;
        setPlanId(newValue);
      } else if (fieldName === 'planName') {
        updatedPlanName = newValue;
        setPlanName(newValue);
      } else if (fieldName === 'noMembership') {
        updatedNoMembership = newValue;
        setNoMembership(newValue);
      } else if (fieldName === 'planCost') {
        const num = Number(newValue || 0);
        updatedPlanCost = num;
        setPlanCost(num);
      } else if (fieldName === 'taxCredit') {
        const num = Number(newValue || 0);
        updatedTaxCredit = num;
        setTaxCredit(num);
      } else if (fieldName === 'effectiveDate') {
        updatedEffectiveDate = newValue;
        setEffectiveDate(newValue);
      } else if (fieldName === 'coverageMembersCount') {
        const num = Number(newValue || 1);
        updatedCoverageMembersCount = num;
        setCoverageMembersCount(num);
      } else if (fieldName === 'applicationNumber') {
        updatedApplicationNumber = newValue;
        setApplicationNumber(newValue);
      } else if (fieldName === 'marketplaceAccount') {
        updatedMarketplaceAccount = newValue;
        setMarketplaceAccount(newValue);
      }

      if (initialPolicy?.id) {
        const standardPayload = {
          id: initialPolicy.id,
          active: isActive,
          year_renovation: yearRenovation ? Number(yearRenovation) : null,
          policy_status: policyStatus,
          action_pending: actionPending,
          renovation_status: renovationStatus,
          npn: npn || null,
          company_2026: updatedCompany2026 || null,
          application_number: updatedApplicationNumber || null,
          type_plan: updatedTypePlan || null,
          marketplace_account: updatedMarketplaceAccount,
          plan_id: updatedPlanId || null,
          plan_name: updatedPlanName || null,
          no_membership: updatedNoMembership || null,
          plan_cost: Number(updatedPlanCost || 0),
          tax_credit: Number(updatedTaxCredit || 0),
          effective_date: updatedEffectiveDate || null,
          coverage_members_count: updatedCoverageMembersCount ? Number(updatedCoverageMembersCount) : null,
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

        const saved = await saveHealthPolicy(clientId, standardPayload);
        onSaved(saved);
      }

      setEditingHealthField(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save field';
      setHealthFieldError(msg);
    } finally {
      setHealthFieldSaving(false);
    }
  };

  const monthlyPremium = Math.max(0, Number(planCost || 0) - Number(taxCredit || 0)).toFixed(2);

  // Dedicated inline-edit handler for Number of People on Tax Return
  const handleInlineSaveTaxMemberCount = async (newCount: number) => {
    setHealthFieldError(null);
    const parsedCount = Number(newCount);

    if (isNaN(parsedCount) || parsedCount < 1) {
      setHealthFieldError('Tax Household count must be at least 1');
      return;
    }

    // Handle count reduction with confirmation modal
    if (parsedCount < taxMemberCount) {
      const toRemove: number[] = [];
      for (let i = parsedCount + 1; i <= taxMemberCount; i++) {
        if (taxMembers[i]?.full_name || taxMembers[i]?.id) {
          toRemove.push(i);
        }
      }
      if (toRemove.length > 0) {
        setPendingCountReduction({ newCount: parsedCount, membersToDelete: toRemove });
        return;
      }
    }

    // Immediate DB save if policy ID exists
    setHealthFieldSaving(true);
    try {
      if (initialPolicy?.id) {
        await updateHealthPolicyTaxHouseholdCount(initialPolicy.id, parsedCount);
      }

      hasLocalTaxChangesRef.current = true;
      setTaxMemberCount(parsedCount);
      setTaxMembers(prev => {
        const updated = { ...prev };
        for (let i = 2; i <= parsedCount; i++) {
          if (!updated[i]) {
            updated[i] = {
              health_policy_id: initialPolicy?.id || '',
              member_number: i,
              coverage: true,
              full_name: '',
              date_of_birth: '',
              relationship_to_applicant: 'Spouse',
              immigration_status: ''
            };
          }
        }
        return updated;
      });

      setEditingHealthField(null);
    } catch (err: any) {
      console.error('Failed to save tax household count:', err);
      setHealthFieldError(err?.message || 'Failed to save count');
    } finally {
      setHealthFieldSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // 1. Prepare and Save standard health_policy fields
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
        number_of_people_on_tax_return: taxMemberCount,
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

      // 2. Save modified sensitive policy credential secrets
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

      // 3. Save Tax Household Members (member_number 2..taxMemberCount)
      for (let i = 2; i <= taxMemberCount; i++) {
        const member = taxMembers[i] || {
          health_policy_id: policyId,
          member_number: i,
          coverage: true,
          full_name: '',
          date_of_birth: null,
          relationship_to_applicant: 'Spouse',
          gender: 'Male',
          us_citizen: true,
          uses_tobacco: false,
          annual_income: 0,
          income_type: '',
          employer_name: '',
          employer_phone: '',
          immigration_status: ''
        };

        if (!member.full_name || !member.full_name.trim()) {
          throw new Error(`Tax Household Member ${i}: Full Name is required.`);
        }

        if (!member.relationship_to_applicant) {
          throw new Error(`Tax Household Member ${i}: Relationship to Applicant is required.`);
        }

        if (!member.date_of_birth) {
          throw new Error(`Tax Household Member ${i}: Date of Birth is required.`);
        }

        const dobIso = member.date_of_birth.split('T')[0];
        if (new Date(dobIso + 'T00:00:00') > new Date()) {
          throw new Error(`Tax Household Member ${i}: Date of Birth cannot be in the future.`);
        }

        if (member.us_citizen === false && (!member.immigration_status || !member.immigration_status.trim())) {
          throw new Error(`Tax Household Member ${i}: Immigration Status is required when U.S. Citizen is No.`);
        }

        if (typeof member.annual_income === 'number' && member.annual_income < 0) {
          throw new Error(`Tax Household Member ${i}: Annual Income must be a non-negative number.`);
        }

        await upsertTaxHouseholdMember(policyId, {
          ...member,
          health_policy_id: policyId,
          full_name: member.full_name.trim()
        });

        // Save encrypted secrets for this tax member
        const ssnVal = taxMemberSecrets[`member_${i}_ssn`];
        if (ssnVal) {
          await saveTaxMemberSecret(policyId, i, 'ssn', ssnVal);
        }
        const cardVal = taxMemberSecrets[`member_${i}_immigration_card_number`];
        if (cardVal) {
          await saveTaxMemberSecret(policyId, i, 'immigration_card_number', cardVal);
        }
        const uscisVal = taxMemberSecrets[`member_${i}_immigration_uscis_number`];
        if (uscisVal) {
          await saveTaxMemberSecret(policyId, i, 'immigration_uscis_number', uscisVal);
        }
        const alienVal = taxMemberSecrets[`member_${i}_immigration_alien_number`];
        if (alienVal) {
          await saveTaxMemberSecret(policyId, i, 'immigration_alien_number', alienVal);
        }
      }

      // 4. Delete confirmed removed members
      if (deletedMemberNumbers.length > 0) {
        await deleteTaxHouseholdMembers(policyId, deletedMemberNumbers);
        setDeletedMemberNumbers([]);
      }

      // 5. Save Marketplace Plan Snapshot if applied
      if (appliedMarketplacePlan) {
        await saveMarketplacePlanSnapshot(clientId, policyId, null, appliedMarketplacePlan);
      }

      addToast({
        title: 'Health Policy Saved',
        description: 'The policy, marketplace plan snapshot, and tax household members have been saved securely.',
        type: 'success'
      });

      onSaved(savedPolicy);
      hasLocalTaxChangesRef.current = false;
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
    <form onSubmit={handleSave} className="space-y-8 font-sans relative">
      {/* Reduction Confirmation Modal */}
      {pendingCountReduction && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4 font-sans">
            <h4 className="text-base font-extrabold text-slate-900">Confirm Member Reduction</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Reducing the number of people on the tax return to <strong>{pendingCountReduction.newCount}</strong> will remove{' '}
              <strong>{pendingCountReduction.membersToDelete.map(n => `TAX MEMBER ${n}`).join(', ')}</strong> upon saving. Are you sure?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingCountReduction(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { newCount, membersToDelete } = pendingCountReduction;
                  setDeletedMemberNumbers(prev => [...prev, ...membersToDelete]);
                  setTaxMemberCount(newCount);
                  setPendingCountReduction(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-sm"
              >
                Confirm Reduction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PARENT TWO-COLUMN PAGE LAYOUT STARTING AT AGENCY INFORMATION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Agency Info, Health Info, Applicant Info, Tax Members, Income, Medical Details */}
        <div className="lg:col-span-7 space-y-6">
          {/* SECTION 1 — Agency Information (Zoho Compact Inline Edit Style) */}
          <div className="bg-white border border-slate-200/70 rounded-xl p-5 shadow-2xs space-y-4 font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Agency Information
              </h4>
          <span className="text-[11px] font-medium text-slate-400">
            Click value to edit
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1 text-xs">
          {/* LEFT COLUMN */}
          <div className="space-y-0 divide-y divide-slate-100/70">
            {/* 1. Active */}
            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
              <span className="text-slate-500 font-medium">Active</span>
              {editingAgencyField === 'active' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={agencyDraftValue ? 'Yes' : 'No'}
                    onChange={e => setAgencyDraftValue(e.target.value === 'Yes')}
                    className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-medium outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingAgencyField(null);
                      if (e.key === 'Enter') handleInlineSaveAgencyField('active', agencyDraftValue);
                    }}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                  <button
                    type="button"
                    disabled={agencyFieldSaving}
                    onClick={() => handleInlineSaveAgencyField('active', agencyDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAgencyField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {agencyFieldError && <span className="text-rose-500 text-[10px] pl-1">{agencyFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingAgencyField('active');
                    setAgencyDraftValue(isActive);
                    setAgencyFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Active"
                >
                  {isActive ? 'Yes' : 'No'}
                </span>
              )}
            </div>

            {/* 2. Renovation Year 2026 */}
            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
              <span className="text-slate-500 font-medium">Renovation Year 2026</span>
              {editingAgencyField === 'yearRenovation' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={agencyDraftValue}
                    onChange={e => setAgencyDraftValue(e.target.value)}
                    className="w-20 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold text-right outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingAgencyField(null);
                      if (e.key === 'Enter') handleInlineSaveAgencyField('yearRenovation', agencyDraftValue);
                    }}
                  />
                  <button
                    type="button"
                    disabled={agencyFieldSaving}
                    onClick={() => handleInlineSaveAgencyField('yearRenovation', agencyDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAgencyField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {agencyFieldError && <span className="text-rose-500 text-[10px] pl-1">{agencyFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingAgencyField('yearRenovation');
                    setAgencyDraftValue(yearRenovation || '2026');
                    setAgencyFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Renovation Year"
                >
                  {yearRenovation || '2026'}
                </span>
              )}
            </div>

            {/* 3. Notes */}
            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
              <span className="text-slate-500 font-medium">Notes</span>
              <span className="text-slate-900 font-semibold select-none">
                {notesCount}
              </span>
            </div>

            {/* 4. Documents */}
            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
              <span className="text-slate-500 font-medium">Documents</span>
              <span className="text-slate-900 font-semibold select-none">
                {documentsCount}
              </span>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-0 divide-y divide-slate-100/70">
            {/* 1. Policy Status */}
            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
              <span className="text-slate-500 font-medium">Policy Status</span>
              {editingAgencyField === 'policyStatus' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={agencyDraftValue}
                    onChange={e => setAgencyDraftValue(e.target.value)}
                    className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingAgencyField(null);
                      if (e.key === 'Enter') handleInlineSaveAgencyField('policyStatus', agencyDraftValue);
                    }}
                  >
                    <option value="Active">Active</option>
                    <option value="Pending">Pending</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                  <button
                    type="button"
                    disabled={agencyFieldSaving}
                    onClick={() => handleInlineSaveAgencyField('policyStatus', agencyDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAgencyField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {agencyFieldError && <span className="text-rose-500 text-[10px] pl-1">{agencyFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingAgencyField('policyStatus');
                    setAgencyDraftValue(policyStatus);
                    setAgencyFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Policy Status"
                >
                  {policyStatus}
                </span>
              )}
            </div>

            {/* 2. Action Pending */}
            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
              <span className="text-slate-500 font-medium">Action Pending</span>
              {editingAgencyField === 'actionPending' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={agencyDraftValue}
                    onChange={e => setAgencyDraftValue(e.target.value)}
                    className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingAgencyField(null);
                      if (e.key === 'Enter') handleInlineSaveAgencyField('actionPending', agencyDraftValue);
                    }}
                  >
                    <option value="Documents">Documents</option>
                    <option value="Verification">Verification</option>
                    <option value="Call To Marketplace">Call To Marketplace</option>
                    <option value="Completed">Completed</option>
                  </select>
                  <button
                    type="button"
                    disabled={agencyFieldSaving}
                    onClick={() => handleInlineSaveAgencyField('actionPending', agencyDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAgencyField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {agencyFieldError && <span className="text-rose-500 text-[10px] pl-1">{agencyFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingAgencyField('actionPending');
                    setAgencyDraftValue(actionPending);
                    setAgencyFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Action Pending"
                >
                  {actionPending}
                </span>
              )}
            </div>

            {/* 3. Renovation Status */}
            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
              <span className="text-slate-500 font-medium">Renovation Status</span>
              {editingAgencyField === 'renovationStatus' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={agencyDraftValue}
                    onChange={e => setAgencyDraftValue(e.target.value)}
                    className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingAgencyField(null);
                      if (e.key === 'Enter') handleInlineSaveAgencyField('renovationStatus', agencyDraftValue);
                    }}
                  >
                    <option value="New Policy 2026">New Policy 2026</option>
                    <option value="Renewal 2026">Renewal 2026</option>
                    <option value="Only Service">Only Service</option>
                  </select>
                  <button
                    type="button"
                    disabled={agencyFieldSaving}
                    onClick={() => handleInlineSaveAgencyField('renovationStatus', agencyDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAgencyField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {agencyFieldError && <span className="text-rose-500 text-[10px] pl-1">{agencyFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingAgencyField('renovationStatus');
                    setAgencyDraftValue(renovationStatus);
                    setAgencyFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Renovation Status"
                >
                  {renovationStatus}
                </span>
              )}
            </div>

            {/* 4. Agent */}
            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
              <span className="text-slate-500 font-medium">Agent</span>
              <span className="text-slate-900 font-semibold select-none">
                {agentName || '—'}
              </span>
            </div>

            {/* 5. NPN */}
            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
              <span className="text-slate-500 font-medium">NPN</span>
              {editingAgencyField === 'npn' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={agencyDraftValue}
                    onChange={e => setAgencyDraftValue(e.target.value)}
                    className="w-28 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingAgencyField(null);
                      if (e.key === 'Enter') handleInlineSaveAgencyField('npn', agencyDraftValue);
                    }}
                  />
                  <button
                    type="button"
                    disabled={agencyFieldSaving}
                    onClick={() => handleInlineSaveAgencyField('npn', agencyDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAgencyField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {agencyFieldError && <span className="text-rose-500 text-[10px] pl-1">{agencyFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingAgencyField('npn');
                    setAgencyDraftValue(npn);
                    setAgencyFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit NPN"
                >
                  {npn || '—'}
                </span>
              )}
            </div>

            {/* 6. Consent Ready */}
            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
              <span className="text-slate-500 font-medium">Consent Ready</span>
              <span className="text-slate-900 font-semibold select-none">
                {isConsentReady ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>
      </div>

        {/* SECTION 2 — Health Information 2026 */}
        <div className="bg-white border border-slate-200/70 rounded-xl p-5 shadow-2xs space-y-4 font-sans">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Health Information 2026
            </h4>
            <span className="text-[11px] font-medium text-slate-400">
              Click value to edit
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs">
            {/* LEFT COLUMN */}
            <div className="space-y-0 divide-y divide-slate-100/70">
              {/* 1. Company 2026 */}
              <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-slate-500 font-medium">Company 2026</span>
                {editingHealthField === 'company2026' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="Company..."
                      className="w-32 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingHealthField(null);
                        if (e.key === 'Enter') handleInlineSaveHealthField('company2026', healthDraftValue);
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('company2026', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-[10px] pl-1">{healthFieldError}</span>}
                  </div>
                ) : (
                  <span
                    onClick={() => {
                      setEditingHealthField('company2026');
                      setHealthDraftValue(company2026);
                      setHealthFieldError(null);
                    }}
                    className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                    title="Click to edit Company 2026"
                  >
                    {company2026 || '—'}
                  </span>
                )}
              </div>

              {/* 2. Type Plan */}
              <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-slate-500 font-medium">Type Plan</span>
                {editingHealthField === 'typePlan' ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingHealthField(null);
                        if (e.key === 'Enter') handleInlineSaveHealthField('typePlan', healthDraftValue);
                      }}
                    >
                      <option value="">Select Plan Type...</option>
                      <option value="Bronze">Bronze</option>
                      <option value="Silver">Silver</option>
                      <option value="Gold">Gold</option>
                      <option value="Platinum">Platinum</option>
                      <option value="Catastrophic">Catastrophic</option>
                    </select>
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('typePlan', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-[10px] pl-1">{healthFieldError}</span>}
                  </div>
                ) : (
                  <span
                    onClick={() => {
                      setEditingHealthField('typePlan');
                      setHealthDraftValue(typePlan);
                      setHealthFieldError(null);
                    }}
                    className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                    title="Click to edit Type Plan"
                  >
                    {typePlan || '—'}
                  </span>
                )}
              </div>

              {/* 3. Plan ID */}
              <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-slate-500 font-medium">Plan ID</span>
                {editingHealthField === 'planId' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="Plan ID..."
                      className="w-32 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingHealthField(null);
                        if (e.key === 'Enter') handleInlineSaveHealthField('planId', healthDraftValue);
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('planId', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-[10px] pl-1">{healthFieldError}</span>}
                  </div>
                ) : (
                  <span
                    onClick={() => {
                      setEditingHealthField('planId');
                      setHealthDraftValue(planId);
                      setHealthFieldError(null);
                    }}
                    className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                    title="Click to edit Plan ID"
                  >
                    {planId || '—'}
                  </span>
                )}
              </div>

              {/* 4. Plan Name */}
              <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-slate-500 font-medium">Plan Name</span>
                {editingHealthField === 'planName' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="Plan Name..."
                      className="w-36 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingHealthField(null);
                        if (e.key === 'Enter') handleInlineSaveHealthField('planName', healthDraftValue);
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('planName', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-[10px] pl-1">{healthFieldError}</span>}
                  </div>
                ) : (
                  <span
                    onClick={() => {
                      setEditingHealthField('planName');
                      setHealthDraftValue(planName);
                      setHealthFieldError(null);
                    }}
                    className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors text-right break-words max-w-[260px]"
                    title={planName || 'Click to edit Plan Name'}
                  >
                    {planName || '—'}
                  </span>
                )}
              </div>

              {/* 5. No. Membership */}
              <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-slate-500 font-medium">No. Membership</span>
                {editingHealthField === 'noMembership' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="Membership No..."
                      className="w-28 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingHealthField(null);
                        if (e.key === 'Enter') handleInlineSaveHealthField('noMembership', healthDraftValue);
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('noMembership', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-[10px] pl-1">{healthFieldError}</span>}
                  </div>
                ) : (
                  <span
                    onClick={() => {
                      setEditingHealthField('noMembership');
                      setHealthDraftValue(noMembership);
                      setHealthFieldError(null);
                    }}
                    className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                    title="Click to edit Membership Number"
                  >
                    {noMembership || '—'}
                  </span>
                )}
              </div>

              {/* 6. Plan Cost */}
              <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-slate-500 font-medium">Plan Cost</span>
                {editingHealthField === 'planCost' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="0.00"
                      className="w-24 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold text-right outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingHealthField(null);
                        if (e.key === 'Enter') handleInlineSaveHealthField('planCost', healthDraftValue);
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('planCost', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-[10px] pl-1">{healthFieldError}</span>}
                  </div>
                ) : (
                  <span
                    onClick={() => {
                      setEditingHealthField('planCost');
                      setHealthDraftValue(planCost);
                      setHealthFieldError(null);
                    }}
                    className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                    title="Click to edit Plan Cost"
                  >
                    ${Number(planCost || 0).toFixed(2)}
                  </span>
                )}
              </div>

              {/* 7. Tax Credit */}
              <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-slate-500 font-medium">Tax Credit</span>
                {editingHealthField === 'taxCredit' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="0.00"
                      className="w-24 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold text-right outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingHealthField(null);
                        if (e.key === 'Enter') handleInlineSaveHealthField('taxCredit', healthDraftValue);
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('taxCredit', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-[10px] pl-1">{healthFieldError}</span>}
                  </div>
                ) : (
                  <span
                    onClick={() => {
                      setEditingHealthField('taxCredit');
                      setHealthDraftValue(taxCredit);
                      setHealthFieldError(null);
                    }}
                    className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                    title="Click to edit Tax Credit"
                  >
                    ${Number(taxCredit || 0).toFixed(2)}
                  </span>
                )}
              </div>

              {/* 8. Monthly Premium */}
              <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-slate-500 font-medium">Monthly Premium</span>
                <span className="text-slate-900 font-bold select-none">
                  ${monthlyPremium}
                </span>
              </div>

              {/* 9. Effective Date */}
              <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-slate-500 font-medium">Effective Date</span>
                {editingHealthField === 'effectiveDate' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(formatAsDateInput(e.target.value))}
                      placeholder="MM/DD/YYYY"
                      className="w-28 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none font-sans"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingHealthField(null);
                        if (e.key === 'Enter') handleInlineSaveHealthField('effectiveDate', healthDraftValue);
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('effectiveDate', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-[10px] pl-1">{healthFieldError}</span>}
                  </div>
                ) : (
                  <span
                    onClick={() => {
                      setEditingHealthField('effectiveDate');
                      setHealthDraftValue(effectiveDate ? formatDateForDisplay(effectiveDate) : '');
                      setHealthFieldError(null);
                    }}
                    className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                    title="Click to edit Effective Date"
                  >
                    {effectiveDate ? formatDateForDisplay(effectiveDate) : '—'}
                  </span>
                )}
              </div>

              {/* 10. Coverage Members Count */}
              <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-slate-500 font-medium">Coverage Members Count</span>
                {editingHealthField === 'coverageMembersCount' ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(Number(e.target.value))}
                      className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingHealthField(null);
                        if (e.key === 'Enter') handleInlineSaveHealthField('coverageMembersCount', healthDraftValue);
                      }}
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('coverageMembersCount', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-[10px] pl-1">{healthFieldError}</span>}
                  </div>
                ) : (
                  <span
                    onClick={() => {
                      setEditingHealthField('coverageMembersCount');
                      setHealthDraftValue(coverageMembersCount);
                      setHealthFieldError(null);
                    }}
                    className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                    title="Click to edit Coverage Members Count"
                  >
                    {coverageMembersCount}
                  </span>
                )}
              </div>

              {/* 11. Number of People on Tax Return */}
              <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-slate-500 font-medium">Number of People on Tax Return</span>
                {editingHealthField === 'taxMemberCount' ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(Number(e.target.value))}
                      className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingHealthField(null);
                        if (e.key === 'Enter') handleInlineSaveTaxMemberCount(healthDraftValue);
                      }}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveTaxMemberCount(healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-[10px] pl-1">{healthFieldError}</span>}
                  </div>
                ) : (
                  <span
                    onClick={() => {
                      setEditingHealthField('taxMemberCount');
                      setHealthDraftValue(taxMemberCount);
                      setHealthFieldError(null);
                    }}
                    className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                    title="Click to edit Tax Household Member Count"
                  >
                    {taxMemberCount}
                  </span>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-0 divide-y divide-slate-100/70">
              {/* 1. Application Number 2026 */}
              <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-slate-500 font-medium">Application Number 2026</span>
                {editingHealthField === 'applicationNumber' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="Application No..."
                      className="w-32 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingHealthField(null);
                        if (e.key === 'Enter') handleInlineSaveHealthField('applicationNumber', healthDraftValue);
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('applicationNumber', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-[10px] pl-1">{healthFieldError}</span>}
                  </div>
                ) : (
                  <span
                    onClick={() => {
                      setEditingHealthField('applicationNumber');
                      setHealthDraftValue(applicationNumber);
                      setHealthFieldError(null);
                    }}
                    className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                    title="Click to edit Application Number"
                  >
                    {applicationNumber || '—'}
                  </span>
                )}
              </div>

              {/* 2. Marketplace Account */}
              <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-slate-500 font-medium">Marketplace Account</span>
                {editingHealthField === 'marketplaceAccount' ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={healthDraftValue ? 'Yes' : 'No'}
                      onChange={e => setHealthDraftValue(e.target.value === 'Yes')}
                      className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-medium outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingHealthField(null);
                        if (e.key === 'Enter') handleInlineSaveHealthField('marketplaceAccount', healthDraftValue);
                      }}
                    >
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('marketplaceAccount', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-[10px] pl-1">{healthFieldError}</span>}
                  </div>
                ) : (
                  <span
                    onClick={() => {
                      setEditingHealthField('marketplaceAccount');
                      setHealthDraftValue(marketplaceAccount);
                      setHealthFieldError(null);
                    }}
                    className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                    title="Click to edit Marketplace Account"
                  >
                    {marketplaceAccount ? 'Yes' : 'No'}
                  </span>
                )}
              </div>

              {/* 3. Conditional Marketplace Credentials */}
              {marketplaceAccount && (
                <>
                  <HealthSensitiveField
                    label="Marketplace User"
                    fieldName="user_name"
                    healthPolicyId={initialPolicy?.id}
                    hasValue={!!initialPolicy?.has_user_name}
                    value={userNameSecret}
                    onChange={setUserNameSecret}
                  />
                  <HealthSensitiveField
                    label="Marketplace Password"
                    fieldName="password_val"
                    healthPolicyId={initialPolicy?.id}
                    hasValue={!!initialPolicy?.has_password_val}
                    type="password"
                    value={passwordSecret}
                    onChange={setPasswordSecret}
                  />
                  <HealthSensitiveField
                    label="Marketplace Security Questions"
                    fieldName="security_question"
                    healthPolicyId={initialPolicy?.id}
                    hasValue={!!initialPolicy?.has_security_question}
                    value={securityQuestionSecret}
                    onChange={setSecurityQuestionSecret}
                  />
                </>
              )}

              {/* 4. Company Account Toggle */}
              <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                <span className="text-slate-500 font-medium">Company Account</span>
                {editingHealthField === 'companyAccount' ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={companyAccount ? 'Yes' : 'No'}
                      onChange={e => setCompanyAccount(e.target.value === 'Yes')}
                      className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-medium outline-none"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') setEditingHealthField(null);
                        if (e.key === 'Enter') setEditingHealthField(null);
                      }}
                    >
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span
                    onClick={() => {
                      setEditingHealthField('companyAccount');
                      setHealthFieldError(null);
                    }}
                    className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                    title="Click to edit Company Account"
                  >
                    {companyAccount ? 'Yes' : 'No'}
                  </span>
                )}
              </div>

              {/* 5. Conditional Company Credentials */}
              {companyAccount && (
                <>
                  <HealthSensitiveField
                    label="Company User"
                    fieldName="company_user"
                    healthPolicyId={initialPolicy?.id}
                    hasValue={!!initialPolicy?.has_company_user}
                    value={companyUserSecret}
                    onChange={setCompanyUserSecret}
                  />
                  <HealthSensitiveField
                    label="Company Password"
                    fieldName="company_password"
                    healthPolicyId={initialPolicy?.id}
                    hasValue={!!initialPolicy?.has_company_password}
                    type="password"
                    value={companyPasswordSecret}
                    onChange={setCompanyPasswordSecret}
                  />
                </>
              )}
            </div>
          </div>
        </div>

      {/* TAX HOUSEHOLD MEMBERS DYNAMIC SECTIONS */}
        {taxMemberCount > 1 && (
          <div className="space-y-6 pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                Tax Household Members
              </h4>
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                Primary Applicant + {taxMemberCount - 1} Additional Member{taxMemberCount > 2 ? 's' : ''}
              </span>
            </div>

            {Array.from({ length: taxMemberCount - 1 }, (_, index) => {
              const memberNumber = index + 2;
              const member = taxMembers[memberNumber] || {
                health_policy_id: initialPolicy?.id || '',
                member_number: memberNumber,
                coverage: true,
                full_name: '',
                date_of_birth: '',
                relationship_to_applicant: 'Spouse',
                gender: 'Male',
                us_citizen: true,
                uses_tobacco: false,
                annual_income: 0,
                income_type: '',
                employer_name: '',
                employer_phone: '',
                immigration_status: ''
              };

              const updateMember = (updates: Partial<HealthTaxHouseholdMember>) => {
                hasLocalTaxChangesRef.current = true;
                setTaxMembers(prev => ({
                  ...prev,
                  [memberNumber]: {
                    ...(prev[memberNumber] || member),
                    ...updates
                  }
                }));
              };

                return (
                  <div key={memberNumber} className="bg-white border border-slate-200/70 rounded-xl p-5 shadow-2xs space-y-4 font-sans">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Tax Household Member {memberNumber}
                      </h4>
                      <span className="text-[11px] font-medium text-slate-400">
                        Click value to edit
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs">
                      {/* LEFT COLUMN */}
                      <div className="space-y-0 divide-y divide-slate-100/70">
                        {/* 1. Coverage */}
                        <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                          <span className="text-slate-500 font-medium">Coverage</span>
                          {editingTaxMemberField === `m_${memberNumber}_coverage` ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={taxMemberDraftValue ? 'Yes' : 'No'}
                                onChange={e => setTaxMemberDraftValue(e.target.value === 'Yes')}
                                className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Escape') setEditingTaxMemberField(null);
                                  if (e.key === 'Enter') {
                                    updateMember({ coverage: taxMemberDraftValue });
                                    setEditingTaxMemberField(null);
                                  }
                                }}
                              >
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  updateMember({ coverage: taxMemberDraftValue });
                                  setEditingTaxMemberField(null);
                                }}
                                className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTaxMemberField(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => {
                                setEditingTaxMemberField(`m_${memberNumber}_coverage`);
                                setTaxMemberDraftValue(member.coverage !== false);
                                setTaxMemberFieldError(null);
                              }}
                              className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                              title="Click to edit Coverage"
                            >
                              {member.coverage !== false ? 'Yes' : 'No'}
                            </span>
                          )}
                        </div>

                        {/* 2. Full Name */}
                        <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                          <span className="text-slate-500 font-medium">Full Name</span>
                          {editingTaxMemberField === `m_${memberNumber}_fullName` ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={taxMemberDraftValue}
                                onChange={e => setTaxMemberDraftValue(e.target.value)}
                                placeholder="Full name..."
                                className="w-36 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Escape') setEditingTaxMemberField(null);
                                  if (e.key === 'Enter') {
                                    updateMember({ full_name: taxMemberDraftValue });
                                    setEditingTaxMemberField(null);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  updateMember({ full_name: taxMemberDraftValue });
                                  setEditingTaxMemberField(null);
                                }}
                                className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTaxMemberField(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => {
                                setEditingTaxMemberField(`m_${memberNumber}_fullName`);
                                setTaxMemberDraftValue(member.full_name || '');
                                setTaxMemberFieldError(null);
                              }}
                              className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                              title="Click to edit Full Name"
                            >
                              {member.full_name || '—'}
                            </span>
                          )}
                        </div>

                        {/* 3. DOB */}
                        <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                          <span className="text-slate-500 font-medium">DOB</span>
                          {editingTaxMemberField === `m_${memberNumber}_dob` ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={taxMemberDraftValue}
                                onChange={e => setTaxMemberDraftValue(formatAsDateInput(e.target.value))}
                                placeholder="MM/DD/YYYY"
                                className="w-28 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none font-sans"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Escape') setEditingTaxMemberField(null);
                                  if (e.key === 'Enter') {
                                    const parsedIso = parseDisplayDate(taxMemberDraftValue);
                                    if (taxMemberDraftValue && !parsedIso) {
                                      setTaxMemberFieldError('Invalid date (MM/DD/YYYY)');
                                      return;
                                    }
                                    updateMember({ date_of_birth: parsedIso });
                                    setEditingTaxMemberField(null);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const parsedIso = parseDisplayDate(taxMemberDraftValue);
                                  if (taxMemberDraftValue && !parsedIso) {
                                    setTaxMemberFieldError('Invalid date (MM/DD/YYYY)');
                                    return;
                                  }
                                  updateMember({ date_of_birth: parsedIso });
                                  setEditingTaxMemberField(null);
                                }}
                                className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTaxMemberField(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                                title="Cancel"
                              >
                                ✕
                              </button>
                              {taxMemberFieldError && <span className="text-rose-500 text-[10px] pl-1">{taxMemberFieldError}</span>}
                            </div>
                          ) : (
                            <span
                              onClick={() => {
                                setEditingTaxMemberField(`m_${memberNumber}_dob`);
                                setTaxMemberDraftValue(member.date_of_birth ? formatDateForDisplay(member.date_of_birth) : '');
                                setTaxMemberFieldError(null);
                              }}
                              className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                              title="Click to edit Date of Birth"
                            >
                              {formatDateForDisplay(member.date_of_birth)}
                            </span>
                          )}
                        </div>

                        {/* 4. Age (Calculated read-only) */}
                        <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                          <span className="text-slate-500 font-medium">Age</span>
                          <span className="text-slate-900 font-semibold select-none">
                            {calculateAgeFromDob(member.date_of_birth) !== null ? calculateAgeFromDob(member.date_of_birth) : '—'}
                          </span>
                        </div>

                        {/* 5. SSN (Sensitive Field) */}
                        <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                          <TaxMemberSensitiveField
                            label="SSN"
                            healthPolicyId={initialPolicy?.id}
                            memberNumber={memberNumber}
                            fieldName="ssn"
                            hasValue={!!member.has_ssn}
                            disabled={!isEditing}
                            value={taxMemberSecrets[`member_${memberNumber}_ssn`] || ''}
                            onChange={val => setTaxMemberSecrets(prev => ({ ...prev, [`member_${memberNumber}_ssn`]: val }))}
                            placeholder="SSN (e.g. XXX-XX-XXXX)"
                          />
                        </div>
                      </div>

                      {/* RIGHT COLUMN */}
                      <div className="space-y-0 divide-y divide-slate-100/70">
                        {/* 1. Relationship to Applicant */}
                        <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                          <span className="text-slate-500 font-medium">Relationship to Applicant</span>
                          {editingTaxMemberField === `m_${memberNumber}_relationship` ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={taxMemberDraftValue}
                                onChange={e => setTaxMemberDraftValue(e.target.value)}
                                className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Escape') setEditingTaxMemberField(null);
                                  if (e.key === 'Enter') {
                                    updateMember({ relationship_to_applicant: taxMemberDraftValue });
                                    setEditingTaxMemberField(null);
                                  }
                                }}
                              >
                                {['Spouse', 'Son', 'Daughter', 'Child', 'Stepchild', 'Parent', 'Sibling', 'Domestic Partner', 'Other Dependent', 'Other'].map(r => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  updateMember({ relationship_to_applicant: taxMemberDraftValue });
                                  setEditingTaxMemberField(null);
                                }}
                                className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTaxMemberField(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => {
                                setEditingTaxMemberField(`m_${memberNumber}_relationship`);
                                setTaxMemberDraftValue(member.relationship_to_applicant || 'Spouse');
                                setTaxMemberFieldError(null);
                              }}
                              className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                              title="Click to edit Relationship"
                            >
                              {member.relationship_to_applicant || 'Spouse'}
                            </span>
                          )}
                        </div>

                        {/* 2. Born in USA? */}
                        <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                          <span className="text-slate-500 font-medium">Born in USA?</span>
                          {editingTaxMemberField === `m_${memberNumber}_bornInUsa` ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={taxMemberDraftValue ? 'Yes' : 'No'}
                                onChange={e => setTaxMemberDraftValue(e.target.value === 'Yes')}
                                className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Escape') setEditingTaxMemberField(null);
                                  if (e.key === 'Enter') {
                                    updateMember({ us_citizen: taxMemberDraftValue });
                                    setEditingTaxMemberField(null);
                                  }
                                }}
                              >
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  updateMember({ us_citizen: taxMemberDraftValue });
                                  setEditingTaxMemberField(null);
                                }}
                                className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTaxMemberField(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => {
                                setEditingTaxMemberField(`m_${memberNumber}_bornInUsa`);
                                setTaxMemberDraftValue(member.us_citizen !== false);
                                setTaxMemberFieldError(null);
                              }}
                              className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                              title="Click to edit Born in USA"
                            >
                              {member.us_citizen !== false ? 'Yes' : 'No'}
                            </span>
                          )}
                        </div>

                        {/* 3. U.S. Citizen */}
                        <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                          <span className="text-slate-500 font-medium">U.S. Citizen</span>
                          {editingTaxMemberField === `m_${memberNumber}_usCitizen` ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={taxMemberDraftValue ? 'Yes' : 'No'}
                                onChange={e => setTaxMemberDraftValue(e.target.value === 'Yes')}
                                className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Escape') setEditingTaxMemberField(null);
                                  if (e.key === 'Enter') {
                                    updateMember({ us_citizen: taxMemberDraftValue });
                                    setEditingTaxMemberField(null);
                                  }
                                }}
                              >
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  updateMember({ us_citizen: taxMemberDraftValue });
                                  setEditingTaxMemberField(null);
                                }}
                                className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTaxMemberField(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => {
                                setEditingTaxMemberField(`m_${memberNumber}_usCitizen`);
                                setTaxMemberDraftValue(member.us_citizen !== false);
                                setTaxMemberFieldError(null);
                              }}
                              className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                              title="Click to edit U.S. Citizen"
                            >
                              {member.us_citizen !== false ? 'Yes' : 'No'}
                            </span>
                          )}
                        </div>

                        {/* 4. Immigration Status */}
                        <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                          <span className="text-slate-500 font-medium">Immigration Status</span>
                          {editingTaxMemberField === `m_${memberNumber}_immigrationStatus` ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={taxMemberDraftValue}
                                onChange={e => setTaxMemberDraftValue(e.target.value)}
                                className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Escape') setEditingTaxMemberField(null);
                                  if (e.key === 'Enter') {
                                    updateMember({ immigration_status: taxMemberDraftValue });
                                    setEditingTaxMemberField(null);
                                  }
                                }}
                              >
                                <option value="">Select Immigration Status...</option>
                                <option value="Resident">Resident</option>
                                <option value="Work Permit">Work Permit</option>
                                <option value="Citizen">Citizen</option>
                                <option value="Other">Other</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  updateMember({ immigration_status: taxMemberDraftValue });
                                  setEditingTaxMemberField(null);
                                }}
                                className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTaxMemberField(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => {
                                setEditingTaxMemberField(`m_${memberNumber}_immigrationStatus`);
                                setTaxMemberDraftValue(member.immigration_status || '');
                                setTaxMemberFieldError(null);
                              }}
                              className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                              title="Click to edit Immigration Status"
                            >
                              {member.immigration_status || '—'}
                            </span>
                          )}
                        </div>

                        {/* CONDITIONAL IMMIGRATION FIELDS: Work Permit */}
                        {member.immigration_status === 'Work Permit' && (
                          <>
                            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                              <TaxMemberSensitiveField
                                label="Card Number"
                                healthPolicyId={initialPolicy?.id}
                                memberNumber={memberNumber}
                                fieldName="immigration_card_number"
                                hasValue={!!member.has_card_number}
                                disabled={!isEditing}
                                value={taxMemberSecrets[`member_${memberNumber}_immigration_card_number`] || ''}
                                onChange={val => setTaxMemberSecrets(prev => ({ ...prev, [`member_${memberNumber}_immigration_card_number`]: val }))}
                              />
                            </div>
                            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                              <TaxMemberSensitiveField
                                label="USCIS Number"
                                healthPolicyId={initialPolicy?.id}
                                memberNumber={memberNumber}
                                fieldName="immigration_uscis_number"
                                hasValue={!!member.has_uscis_number}
                                disabled={!isEditing}
                                value={taxMemberSecrets[`member_${memberNumber}_immigration_uscis_number`] || ''}
                                onChange={val => setTaxMemberSecrets(prev => ({ ...prev, [`member_${memberNumber}_immigration_uscis_number`]: val }))}
                              />
                            </div>
                            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                              <span className="text-slate-500 font-medium">Category</span>
                              {editingTaxMemberField === `m_${memberNumber}_immigrationCategory` ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={taxMemberDraftValue}
                                    onChange={e => setTaxMemberDraftValue(e.target.value)}
                                    placeholder="e.g. C09"
                                    className="w-24 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                                    autoFocus
                                    onKeyDown={e => {
                                      if (e.key === 'Escape') setEditingTaxMemberField(null);
                                      if (e.key === 'Enter') {
                                        updateMember({ immigration_category: taxMemberDraftValue });
                                        setEditingTaxMemberField(null);
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      updateMember({ immigration_category: taxMemberDraftValue });
                                      setEditingTaxMemberField(null);
                                    }}
                                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                                    title="Save"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTaxMemberField(null)}
                                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                                    title="Cancel"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <span
                                  onClick={() => {
                                    setEditingTaxMemberField(`m_${memberNumber}_immigrationCategory`);
                                    setTaxMemberDraftValue(member.immigration_category || '');
                                    setTaxMemberFieldError(null);
                                  }}
                                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                                  title="Click to edit Category"
                                >
                                  {member.immigration_category || '—'}
                                </span>
                              )}
                            </div>
                            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                              <span className="text-slate-500 font-medium">Expiration Date</span>
                              {editingTaxMemberField === `m_${memberNumber}_immigrationExpDate` ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={taxMemberDraftValue}
                                    onChange={e => setTaxMemberDraftValue(formatAsDateInput(e.target.value))}
                                    placeholder="MM/DD/YYYY"
                                    className="w-28 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none font-sans"
                                    autoFocus
                                    onKeyDown={e => {
                                      if (e.key === 'Escape') setEditingTaxMemberField(null);
                                      if (e.key === 'Enter') {
                                        const parsedIso = parseDisplayDate(taxMemberDraftValue);
                                        if (taxMemberDraftValue && !parsedIso) {
                                          setTaxMemberFieldError('Invalid date (MM/DD/YYYY)');
                                          return;
                                        }
                                        updateMember({ immigration_expiration_date: parsedIso });
                                        setEditingTaxMemberField(null);
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const parsedIso = parseDisplayDate(taxMemberDraftValue);
                                      if (taxMemberDraftValue && !parsedIso) {
                                        setTaxMemberFieldError('Invalid date (MM/DD/YYYY)');
                                        return;
                                      }
                                      updateMember({ immigration_expiration_date: parsedIso });
                                      setEditingTaxMemberField(null);
                                    }}
                                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                                    title="Save"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTaxMemberField(null)}
                                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                                    title="Cancel"
                                  >
                                    ✕
                                  </button>
                                  {taxMemberFieldError && <span className="text-rose-500 text-[10px] pl-1">{taxMemberFieldError}</span>}
                                </div>
                              ) : (
                                <span
                                  onClick={() => {
                                    setEditingTaxMemberField(`m_${memberNumber}_immigrationExpDate`);
                                    setTaxMemberDraftValue(member.immigration_expiration_date ? formatDateForDisplay(member.immigration_expiration_date) : '');
                                    setTaxMemberFieldError(null);
                                  }}
                                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                                  title="Click to edit Expiration Date"
                                >
                                  {formatDateForDisplay(member.immigration_expiration_date)}
                                </span>
                              )}
                            </div>
                          </>
                        )}

                        {/* CONDITIONAL IMMIGRATION FIELDS: Resident */}
                        {member.immigration_status === 'Resident' && (
                          <>
                            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                              <TaxMemberSensitiveField
                                label="Alien Number"
                                healthPolicyId={initialPolicy?.id}
                                memberNumber={memberNumber}
                                fieldName="immigration_alien_number"
                                hasValue={!!member.has_alien_number}
                                disabled={!isEditing}
                                value={taxMemberSecrets[`member_${memberNumber}_immigration_alien_number`] || ''}
                                onChange={val => setTaxMemberSecrets(prev => ({ ...prev, [`member_${memberNumber}_immigration_alien_number`]: val }))}
                              />
                            </div>
                            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                              <TaxMemberSensitiveField
                                label="Card Number"
                                healthPolicyId={initialPolicy?.id}
                                memberNumber={memberNumber}
                                fieldName="immigration_card_number"
                                hasValue={!!member.has_card_number}
                                disabled={!isEditing}
                                value={taxMemberSecrets[`member_${memberNumber}_immigration_card_number`] || ''}
                                onChange={val => setTaxMemberSecrets(prev => ({ ...prev, [`member_${memberNumber}_immigration_card_number`]: val }))}
                              />
                            </div>
                            <div className="py-2 flex items-center justify-between gap-4 min-h-[36px]">
                              <span className="text-slate-500 font-medium">Expiration Date</span>
                              {editingTaxMemberField === `m_${memberNumber}_immigrationExpDate` ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={taxMemberDraftValue}
                                    onChange={e => setTaxMemberDraftValue(formatAsDateInput(e.target.value))}
                                    placeholder="MM/DD/YYYY"
                                    className="w-28 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none font-sans"
                                    autoFocus
                                    onKeyDown={e => {
                                      if (e.key === 'Escape') setEditingTaxMemberField(null);
                                      if (e.key === 'Enter') {
                                        const parsedIso = parseDisplayDate(taxMemberDraftValue);
                                        if (taxMemberDraftValue && !parsedIso) {
                                          setTaxMemberFieldError('Invalid date (MM/DD/YYYY)');
                                          return;
                                        }
                                        updateMember({ immigration_expiration_date: parsedIso });
                                        setEditingTaxMemberField(null);
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const parsedIso = parseDisplayDate(taxMemberDraftValue);
                                      if (taxMemberDraftValue && !parsedIso) {
                                        setTaxMemberFieldError('Invalid date (MM/DD/YYYY)');
                                        return;
                                      }
                                      updateMember({ immigration_expiration_date: parsedIso });
                                      setEditingTaxMemberField(null);
                                    }}
                                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                                    title="Save"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTaxMemberField(null)}
                                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                                    title="Cancel"
                                  >
                                    ✕
                                  </button>
                                  {taxMemberFieldError && <span className="text-rose-500 text-[10px] pl-1">{taxMemberFieldError}</span>}
                                </div>
                              ) : (
                                <span
                                  onClick={() => {
                                    setEditingTaxMemberField(`m_${memberNumber}_immigrationExpDate`);
                                    setTaxMemberDraftValue(member.immigration_expiration_date ? formatDateForDisplay(member.immigration_expiration_date) : '');
                                    setTaxMemberFieldError(null);
                                  }}
                                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                                  title="Click to edit Expiration Date"
                                >
                                  {formatDateForDisplay(member.immigration_expiration_date)}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
            })}
          </div>
        )}

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
        </div>

        {/* RIGHT COLUMN: Marketplace Plan Lookup & Approved Plan Benefits */}
        <div className="lg:col-span-5">
          <MarketplacePlanLookupPanel
            initialPlanId={planId}
            initialYear={yearRenovation || '2026'}
            initialZip=""
            initialCounty=""
            initialState=""
            householdIncome={45000}
            peopleCount={taxMemberCount}
            isEditing={isEditing}
            onApplyPlan={handleApplyMarketplacePlan}
            appliedPlan={appliedMarketplacePlan}
            addToast={addToast}
          />
        </div>
      </div>

      {/* CONFIRMATION MODAL FOR TAX MEMBER COUNT REDUCTION */}
      {pendingCountReduction && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 font-sans">
            <h3 className="text-base font-extrabold text-slate-800">
              Confirm Tax Household Member Reduction
            </h3>
            <p className="text-xs text-slate-600">
              Reducing the number of people on tax return from <strong className="text-slate-900">{taxMemberCount}</strong> to <strong className="text-slate-900">{pendingCountReduction.newCount}</strong> will remove {pendingCountReduction.membersToDelete.length} member card{pendingCountReduction.membersToDelete.length > 1 ? 's' : ''} (Member {pendingCountReduction.membersToDelete.join(', ')}).
            </p>
            <p className="text-xs text-rose-600 font-semibold bg-rose-50 p-2.5 rounded-lg border border-rose-100">
              Warning: Data for removed members will be deleted immediately upon confirmation.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingCountReduction(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetCount = pendingCountReduction.newCount;
                  const toDeleteNums = pendingCountReduction.membersToDelete;
                  setPendingCountReduction(null);

                  try {
                    if (initialPolicy?.id) {
                      await deleteTaxHouseholdMembers(initialPolicy.id, toDeleteNums);
                      await updateHealthPolicyTaxHouseholdCount(initialPolicy.id, targetCount);
                    }

                    setTaxMemberCount(targetCount);
                    setTaxMembers(prev => {
                      const updated = { ...prev };
                      toDeleteNums.forEach(num => {
                        delete updated[num];
                      });
                      return updated;
                    });
                    setDeletedMemberNumbers(prev => [...prev, ...toDeleteNums]);
                    hasLocalTaxChangesRef.current = true;
                    setEditingHealthField(null);
                  } catch (err: any) {
                    console.error('Failed to update count reduction:', err);
                    setHealthFieldError(err?.message || 'Failed to update count');
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-all"
              >
                Confirm & Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
