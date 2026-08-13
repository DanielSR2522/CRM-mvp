import React, { useState, useEffect, useMemo } from 'react';
import { HealthPolicy, HealthTaxHouseholdMember, HealthPrimaryApplicant } from '@/lib/health/types';
import HealthSensitiveField from './HealthSensitiveField';
import TaxMemberSensitiveField from './TaxMemberSensitiveField';
import ClientIncomeInformationSection from '@/components/clients/ClientIncomeInformationSection';
import {
  saveHealthPolicy,
  saveHealthSecret,
  fetchPrimaryApplicant,
  updatePrimaryApplicantField,
  fetchClientResidence,
  updateClientResidenceField,
  ClientResidenceData,
  fetchTotalHouseholdIncome,
  fetchTaxHouseholdMembers,
  upsertTaxHouseholdMember,
  deleteTaxHouseholdMembers,
  updateHealthPolicyTaxHouseholdCount,
  updateAppliedMarketplacePlan,
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
import { formatSsnInput } from '@/utils/ssnUtils';
import MarketplacePlanLookupPanel from './MarketplacePlanLookupPanel';
import HealthMedicalSection from './HealthMedicalSection';
import { MarketplacePlanPreview, MarketplaceClientContext } from '@/lib/marketplace/types';
import { transformHouseholdToMarketplacePeople } from '@/lib/marketplace/people-helper';
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
  onMarketplacePlanLoaded?: (plan: any) => void;
  onMarketplaceContextUpdated?: (info: any) => void;
  addToast: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
}

export default function HealthPolicyForm({
  clientId,
  agentName,
  initialPolicy,
  isEditing,
  setIsEditing,
  onSaved,
  onMarketplacePlanLoaded,
  onMarketplaceContextUpdated,
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

  // Primary Applicant State (Member 1 - Self) Sourced from Personal Information
  const [primaryApplicant, setPrimaryApplicant] = useState<HealthPrimaryApplicant | null>(null);
  const [applicantCoverage, setApplicantCoverage] = useState<boolean>(true);
  const [clientResidence, setClientResidence] = useState<ClientResidenceData | null>(null);
  const [totalHouseholdIncome, setTotalHouseholdIncome] = useState<number | null>(null);

  // Tax Household Members State
  const [taxMemberCount, setTaxMemberCount] = useState<number>(1);
  const [taxMembers, setTaxMembers] = useState<{ [memberNumber: number]: HealthTaxHouseholdMember }>({});
  const [taxMemberSecrets, setTaxMemberSecrets] = useState<{ [key: string]: string }>({});

  // Automatically Derived Coverage Members Count (Strict explicit true check)
  const calculatedCoverageMembersCount = useMemo(() => {
    const applicantCount = applicantCoverage === true ? 1 : 0;
    const membersCount = Object.values(taxMembers).filter(
      (m: HealthTaxHouseholdMember) => m && m.coverage === true
    ).length;
    return applicantCount + membersCount;
  }, [applicantCoverage, taxMembers]);
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

  // Applicant Info Field-level Inline Edit State
  const [editingApplicantField, setEditingApplicantField] = useState<string | null>(null);
  const [applicantDraftValue, setApplicantDraftValue] = useState<any>(null);
  const [applicantFieldSaving, setApplicantFieldSaving] = useState<boolean>(false);
  const [applicantFieldError, setApplicantFieldError] = useState<string | null>(null);

  // Residence Info Field-level Inline Edit State
  const [editingResidenceField, setEditingResidenceField] = useState<string | null>(null);
  const [residenceDraftValue, setResidenceDraftValue] = useState<any>(null);
  const [residenceFieldSaving, setResidenceFieldSaving] = useState<boolean>(false);
  const [residenceFieldError, setResidenceFieldError] = useState<string | null>(null);

  // Marketplace Applied Plan State
  const [appliedMarketplacePlan, setAppliedMarketplacePlan] = useState<MarketplacePlanPreview | null>(null);

  const [saving, setSaving] = useState(false);

  // Sync Form values with initialPolicy (scheduled asynchronously to satisfy eslint rules)
  useEffect(() => {
    const loadIncome = () => {
      if (clientId) {
        fetchTotalHouseholdIncome(clientId)
          .then(inc => setTotalHouseholdIncome(inc))
          .catch(err => console.error('Failed to load total household income:', err));
      }
    };

    if (clientId) {
      fetchPrimaryApplicant(clientId)
        .then(applicant => setPrimaryApplicant(applicant))
        .catch(err => console.error('Failed to load primary applicant for health:', err));

      fetchClientResidence(clientId)
        .then(residence => setClientResidence(residence))
        .catch(err => console.error('Failed to load client residence for health:', err));

      loadIncome();
    }

    const handleIncomeUpdated = () => {
      loadIncome();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('income-updated', handleIncomeUpdated);
    }

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

              if (process.env.NODE_ENV !== 'production') {
                console.log('[RELOAD_TAX_MEMBERS_FETCHED]', {
                  policyId: initialPolicy.id,
                  savedPolicyCount,
                  fetchedMemberNumbers: fetched.map(m => m.member_number),
                  resolvedTargetCount: targetCount
                });
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

    return () => {
      clearTimeout(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('income-updated', handleIncomeUpdated);
      }
    };
  }, [initialPolicy, isEditing, clientId]);

  const handleApplyMarketplacePlan = async (plan: MarketplacePlanPreview): Promise<{ success: boolean; error?: string }> => {
    const policyId = initialPolicy?.id;
    if (!policyId) {
      const msg = 'Save the Health Policy before applying a Marketplace plan.';
      addToast({
        title: 'Policy Not Saved',
        description: msg,
        type: 'warning'
      });
      return { success: false, error: msg };
    }

    try {
      const updatedCompany2026 = plan.issuerName || company2026;
      const validMetalTypes = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Catastrophic'];
      const matchedMetal = validMetalTypes.find(m => m.toLowerCase() === (plan.metalLevel || '').toLowerCase());
      const updatedTypePlan = matchedMetal || plan.planType || typePlan;
      const updatedPlanId = plan.id || planId;
      const updatedPlanName = plan.planName || planName;
      const updatedPlanCost = typeof plan.premiumFull === 'number' ? plan.premiumFull : planCost;
      const updatedTaxCredit = typeof plan.taxCredit === 'number' ? plan.taxCredit : taxCredit;
      const updatedYearRenovation = plan.coverageYear ? Number(plan.coverageYear) : (yearRenovation ? Number(yearRenovation) : 2026);

      // 1. Immediate partial update to health_policies table in Supabase
      const savedPolicy = await updateAppliedMarketplacePlan(policyId, {
        company_2026: updatedCompany2026 || null,
        type_plan: updatedTypePlan || null,
        plan_id: updatedPlanId || null,
        plan_name: updatedPlanName || null,
        plan_cost: Number(updatedPlanCost || 0),
        tax_credit: Number(updatedTaxCredit || 0),
        year_renovation: updatedYearRenovation
      });

      // 2. Persist full marketplace plan snapshot & benefits
      const snapshotRes = await saveMarketplacePlanSnapshot(clientId, policyId, null, plan);
      if (snapshotRes.error && process.env.NODE_ENV !== 'production') {
        console.warn('Snapshot insert warning:', snapshotRes.error);
      }

      // 3. Update local React state to match persisted values
      if (updatedCompany2026) setCompany2026(updatedCompany2026);
      if (updatedTypePlan) setTypePlan(updatedTypePlan as any);
      if (updatedPlanId) setPlanId(updatedPlanId);
      if (updatedPlanName) setPlanName(updatedPlanName);
      if (typeof updatedPlanCost === 'number') setPlanCost(updatedPlanCost);
      if (typeof updatedTaxCredit === 'number') setTaxCredit(updatedTaxCredit);
      if (updatedYearRenovation) setYearRenovation(updatedYearRenovation.toString());
      setAppliedMarketplacePlan(plan);

      // 4. Update parent policy state silently without navigating
      onSaved(savedPolicy);

      addToast({
        title: 'Plan Applied and Saved',
        description: `Applied ${plan.planName} (${plan.id}) and saved to this policy.`,
        type: 'success'
      });

      return { success: true };
    } catch (err: any) {
      console.error('Failed to save applied marketplace plan:', err);
      const errMsg = err?.message || 'Unable to save applied plan. Please try again.';
      addToast({
        title: 'Unable to Save Plan',
        description: errMsg,
        type: 'error'
      });
      return { success: false, error: errMsg };
    }
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
          coverage_members_count: calculatedCoverageMembersCount,
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

  const handleInlineSaveApplicantField = async (fieldName: string, newValue: any) => {
    setApplicantFieldSaving(true);
    setApplicantFieldError(null);
    try {
      await updatePrimaryApplicantField(clientId, fieldName, newValue);
      const updated = await fetchPrimaryApplicant(clientId);
      setPrimaryApplicant(updated);
      setEditingApplicantField(null);
    } catch (err: any) {
      setApplicantFieldError(err?.message || 'Failed to save applicant field');
    } finally {
      setApplicantFieldSaving(false);
    }
  };

  const handleInlineSaveResidenceField = async (fieldName: string, newValue: any) => {
    setResidenceFieldSaving(true);
    setResidenceFieldError(null);
    try {
      await updateClientResidenceField(clientId, fieldName, newValue);
      const updated = await fetchClientResidence(clientId);
      setClientResidence(updated);
      setEditingResidenceField(null);
    } catch (err: any) {
      setResidenceFieldError(err?.message || 'Failed to save residence field');
    } finally {
      setResidenceFieldSaving(false);
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
          coverage_members_count: calculatedCoverageMembersCount,
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
        coverage_members_count: calculatedCoverageMembersCount,
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
      if (process.env.NODE_ENV !== 'production') {
        console.log('[SAVE_POLICY_TAX_MEMBERS_START]', {
          policyId,
          taxMemberCount,
          savingMembers: Array.from({ length: taxMemberCount - 1 }, (_, index) => index + 2)
        });
      }

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

  const activeCoverageYear = yearRenovation ? Number(yearRenovation) : 2026;
  const activeZip = clientResidence?.zipCode || null;
  const activeState = clientResidence?.state || null;
  const activeIncome = totalHouseholdIncome !== null && totalHouseholdIncome !== undefined && totalHouseholdIncome > 0
    ? totalHouseholdIncome
    : null;

  const peopleResult = useMemo(() => transformHouseholdToMarketplacePeople(
    primaryApplicant,
    applicantCoverage,
    taxMembers,
    taxMemberCount,
    activeCoverageYear,
    activeZip,
    activeState,
    activeIncome
  ), [primaryApplicant, applicantCoverage, taxMembers, taxMemberCount, activeCoverageYear, activeZip, activeState, activeIncome]);

  const marketplaceContext: MarketplaceClientContext = useMemo(() => ({
    coverageYear: activeCoverageYear,
    zipCode: activeZip,
    state: activeState,
    countyName: clientResidence?.county || null,
    countyFips: null,
    householdIncome: activeIncome,
    householdSize: peopleResult.householdSize,
    coveredApplicants: peopleResult.coveredApplicants,
    people: peopleResult.people,
    validationErrors: peopleResult.validationErrors
  }), [activeCoverageYear, activeZip, activeState, clientResidence?.county, activeIncome, peopleResult]);

  useEffect(() => {
    if (onMarketplaceContextUpdated) {
      onMarketplaceContextUpdated({
        context: marketplaceContext,
        planId,
        appliedPlan: appliedMarketplacePlan,
        onApplyPlan: (plan: MarketplacePlanPreview) => {
          handleApplyMarketplacePlan(plan);
          if (onMarketplacePlanLoaded) onMarketplacePlanLoaded(plan);
        },
        addToast,
        isEditing
      });
    }
  }, [marketplaceContext, planId, appliedMarketplacePlan, isEditing, onMarketplaceContextUpdated, onMarketplacePlanLoaded, addToast]);

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

      {/* PARENT FULL-WIDTH PAGE LAYOUT STARTING AT AGENCY INFORMATION */}
      <div className="w-full space-y-6">
        {/* SECTION 1 — Agency Information */}
        <div className="bg-white border border-slate-200/70 rounded-xl p-5 shadow-2xs space-y-4 font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Agency Information
              </h4>
          <span className="text-[11px] font-medium text-slate-400">
            Click value to edit
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1 text-sm font-sans">
          {/* LEFT COLUMN */}
          <div className="space-y-0 divide-y divide-slate-100/70">
            {/* 1. Enrolled */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Enrolled</span>
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
                  title="Click to edit Enrolled"
                >
                  {isActive ? 'Yes' : 'No'}
                </span>
              )}
            </div>

            {/* 2. Renovation Year 2026 */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Renovation Year 2026</span>
              {editingAgencyField === 'yearRenovation' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={agencyDraftValue}
                    onChange={e => setAgencyDraftValue(e.target.value)}
                    className="w-20 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
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
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Notes</span>
              <span className="text-slate-900 font-semibold select-none">
                {notesCount}
              </span>
            </div>

            {/* 4. Documents */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Documents</span>
              <span className="text-slate-900 font-semibold select-none">
                {documentsCount}
              </span>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-0 divide-y divide-slate-100/70">
            {/* 1. Policy Status */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Policy Status</span>
              {editingAgencyField === 'policyStatus' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={agencyDraftValue || 'Pending'}
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
                    setAgencyDraftValue(policyStatus || 'Pending');
                    setAgencyFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Policy Status"
                >
                  {policyStatus || '—'}
                </span>
              )}
            </div>

            {/* 2. Action Pending */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Action Pending</span>
              {editingAgencyField === 'actionPending' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={agencyDraftValue || 'Documents'}
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
                    setAgencyDraftValue(actionPending || 'Documents');
                    setAgencyFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Action Pending"
                >
                  {actionPending || '—'}
                </span>
              )}
            </div>

            {/* 3. Renovation Status */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Renovation Status</span>
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
                  {renovationStatus || '—'}
                </span>
              )}
            </div>

            {/* 4. Agent */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Agent</span>
              <span className="text-slate-900 font-semibold select-none">
                {agentName || '—'}
              </span>
            </div>

            {/* 5. NPN */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">NPN</span>
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
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Consent Ready</span>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm font-sans">
            {/* LEFT COLUMN */}
            <div className="space-y-0 divide-y divide-slate-100/70">
              {/* 1. Company 2026 */}
              <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                <span className="text-slate-500 font-medium leading-snug break-words">Company 2026</span>
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
              <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                <span className="text-slate-500 font-medium leading-snug break-words">Type Plan</span>
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
              <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                <span className="text-slate-500 font-medium leading-snug break-words">Plan ID</span>
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
              <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                <span className="text-slate-500 font-medium leading-snug break-words">Plan Name</span>
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
                    className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors break-words max-w-[260px]"
                    title={planName || 'Click to edit Plan Name'}
                  >
                    {planName || '—'}
                  </span>
                )}
              </div>

              {/* 5. No. Membership */}
              <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                <span className="text-slate-500 font-medium leading-snug break-words">No. Membership</span>
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
              <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                <span className="text-slate-500 font-medium leading-snug break-words">Plan Cost</span>
                {editingHealthField === 'planCost' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="0.00"
                      className="w-24 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
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
              <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                <span className="text-slate-500 font-medium leading-snug break-words">Tax Credit</span>
                {editingHealthField === 'taxCredit' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="0.00"
                      className="w-24 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
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
              <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                <span className="text-slate-500 font-medium leading-snug break-words">Monthly Premium</span>
                <span className="text-slate-900 font-bold select-none">
                  ${monthlyPremium}
                </span>
              </div>

              {/* 9. Effective Date */}
              <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                <span className="text-slate-500 font-medium leading-snug break-words">Effective Date</span>
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
              <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                <span className="text-slate-500 font-medium leading-snug break-words">Coverage Members Count</span>
                <span className="text-slate-900 font-semibold select-none">
                  {calculatedCoverageMembersCount}
                </span>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-0 divide-y divide-slate-100/70">
              {/* 1. Application Number 2026 */}
              <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                <span className="text-slate-500 font-medium leading-snug break-words">Application Number 2026</span>
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
              <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                <span className="text-slate-500 font-medium leading-snug break-words">Marketplace Account</span>
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
              <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                <span className="text-slate-500 font-medium leading-snug break-words">Company Account</span>
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

      {/* SECTION: APPLICANT INFORMATION / TAX HOUSEHOLD MEMBER 1 */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6 font-sans">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-50 pb-4 gap-2">
          <div>
            <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
              Applicant Information
            </h4>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Primary Applicant — Tax Household Member 1 (Click value to edit)
            </p>
          </div>
          <span className="self-start sm:self-auto text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
            Relationship: Self
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm font-sans">
          {/* LEFT COLUMN */}
          <div className="space-y-0 divide-y divide-slate-100/70">
            {/* 1. Coverage */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Coverage</span>
              {editingHealthField === 'applicantCoverage' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={applicantCoverage ? 'Yes' : 'No'}
                    onChange={e => setApplicantCoverage(e.target.value === 'Yes')}
                    className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
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
                  onClick={() => setEditingHealthField('applicantCoverage')}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Coverage status"
                >
                  {applicantCoverage ? 'Yes' : 'No'}
                </span>
              )}
            </div>

            {/* 2. Applicant Name */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Applicant Name</span>
              {editingApplicantField === 'full_name' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(e.target.value)}
                    className="w-36 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingApplicantField(null);
                      if (e.key === 'Enter') handleInlineSaveApplicantField('full_name', applicantDraftValue);
                    }}
                  />
                  <button
                    type="button"
                    disabled={applicantFieldSaving}
                    onClick={() => handleInlineSaveApplicantField('full_name', applicantDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-[10px] pl-1">{applicantFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingApplicantField('full_name');
                    setApplicantDraftValue(primaryApplicant?.fullName || '');
                    setApplicantFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Applicant Name"
                >
                  {primaryApplicant?.fullName || '—'}
                </span>
              )}
            </div>

            {/* 3. DOB */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">DOB</span>
              {editingApplicantField === 'date_of_birth' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(formatAsDateInput(e.target.value))}
                    placeholder="MM/DD/YYYY"
                    className="w-28 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none font-sans"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingApplicantField(null);
                      if (e.key === 'Enter') {
                        const parsedIso = parseDisplayDate(applicantDraftValue);
                        if (applicantDraftValue && !parsedIso) {
                          setApplicantFieldError('Invalid date (MM/DD/YYYY)');
                          return;
                        }
                        handleInlineSaveApplicantField('date_of_birth', parsedIso);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={applicantFieldSaving}
                    onClick={() => {
                      const parsedIso = parseDisplayDate(applicantDraftValue);
                      if (applicantDraftValue && !parsedIso) {
                        setApplicantFieldError('Invalid date (MM/DD/YYYY)');
                        return;
                      }
                      handleInlineSaveApplicantField('date_of_birth', parsedIso);
                    }}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-[10px] pl-1">{applicantFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingApplicantField('date_of_birth');
                    setApplicantDraftValue(primaryApplicant?.dateOfBirth ? formatDateForDisplay(primaryApplicant.dateOfBirth) : '');
                    setApplicantFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Date of Birth"
                >
                  {formatDateForDisplay(primaryApplicant?.dateOfBirth)}
                </span>
              )}
            </div>

            {/* 4. Age */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Age</span>
              <span className="text-slate-900 font-semibold select-none">
                {primaryApplicant?.dateOfBirth ? calculateAgeFromDob(primaryApplicant.dateOfBirth) : '—'}
              </span>
            </div>

            {/* 5. SSN (Visible unmasked) */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">SSN</span>
              {editingApplicantField === 'ssn' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(formatSsnInput(e.target.value))}
                    placeholder="XXX-XX-XXXX"
                    className="w-28 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold font-mono outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingApplicantField(null);
                      if (e.key === 'Enter') handleInlineSaveApplicantField('ssn', applicantDraftValue.replace(/\D/g, ''));
                    }}
                  />
                  <button
                    type="button"
                    disabled={applicantFieldSaving}
                    onClick={() => handleInlineSaveApplicantField('ssn', applicantDraftValue.replace(/\D/g, ''))}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-[10px] pl-1">{applicantFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingApplicantField('ssn');
                    setApplicantDraftValue(primaryApplicant?.ssn ? formatSsnInput(primaryApplicant.ssn) : '');
                    setApplicantFieldError(null);
                  }}
                  className="text-slate-900 font-semibold font-mono cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit SSN"
                >
                  {primaryApplicant?.ssn ? formatSsnInput(primaryApplicant.ssn) : '—'}
                </span>
              )}
            </div>

            {/* 6. Email */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Email</span>
              {editingApplicantField === 'email' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(e.target.value)}
                    placeholder="email@domain.com"
                    className="w-36 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingApplicantField(null);
                      if (e.key === 'Enter') handleInlineSaveApplicantField('email', applicantDraftValue);
                    }}
                  />
                  <button
                    type="button"
                    disabled={applicantFieldSaving}
                    onClick={() => handleInlineSaveApplicantField('email', applicantDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-[10px] pl-1">{applicantFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingApplicantField('email');
                    setApplicantDraftValue(primaryApplicant?.email || '');
                    setApplicantFieldError(null);
                  }}
                  className="text-slate-900 font-semibold truncate cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Email"
                >
                  {primaryApplicant?.email || '—'}
                </span>
              )}
            </div>

            {/* 7. Phone */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Phone</span>
              {editingApplicantField === 'phone' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(e.target.value)}
                    placeholder="Phone number"
                    className="w-32 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingApplicantField(null);
                      if (e.key === 'Enter') handleInlineSaveApplicantField('phone', applicantDraftValue);
                    }}
                  />
                  <button
                    type="button"
                    disabled={applicantFieldSaving}
                    onClick={() => handleInlineSaveApplicantField('phone', applicantDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-[10px] pl-1">{applicantFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingApplicantField('phone');
                    setApplicantDraftValue(primaryApplicant?.phone || '');
                    setApplicantFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Phone"
                >
                  {primaryApplicant?.phone || '—'}
                </span>
              )}
            </div>

            {/* 8. Number of People on Tax Return */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Number of People on Tax Return</span>
              {editingApplicantField === 'tax_household_count' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(Number(e.target.value))}
                    className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingApplicantField(null);
                      if (e.key === 'Enter') {
                        const count = Number(applicantDraftValue);
                        setTaxMemberCount(count);
                        if (initialPolicy?.id) {
                          updateHealthPolicyTaxHouseholdCount(initialPolicy.id, count).catch(console.error);
                        }
                        setEditingApplicantField(null);
                      }
                    }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const count = Number(applicantDraftValue);
                      setTaxMemberCount(count);
                      if (initialPolicy?.id) {
                        updateHealthPolicyTaxHouseholdCount(initialPolicy.id, count).catch(console.error);
                      }
                      setEditingApplicantField(null);
                    }}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingApplicantField('tax_household_count');
                    setApplicantDraftValue(taxMemberCount);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Number of People on Tax Return"
                >
                  {taxMemberCount}
                </span>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-0 divide-y divide-slate-100/70">
            {/* 1. Relationship */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Relationship</span>
              <span className="text-slate-900 font-semibold bg-slate-100 px-2 py-0.5 rounded text-[11px] w-fit">
                Self
              </span>
            </div>

            {/* 2. Gender */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Gender</span>
              {editingApplicantField === 'gender' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(e.target.value)}
                    className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingApplicantField(null);
                      if (e.key === 'Enter') handleInlineSaveApplicantField('gender', applicantDraftValue);
                    }}
                  >
                    <option value="">Select Gender...</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                  </select>
                  <button
                    type="button"
                    disabled={applicantFieldSaving}
                    onClick={() => handleInlineSaveApplicantField('gender', applicantDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-[10px] pl-1">{applicantFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingApplicantField('gender');
                    setApplicantDraftValue(primaryApplicant?.gender || '');
                    setApplicantFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Gender"
                >
                  {primaryApplicant?.gender || '—'}
                </span>
              )}
            </div>

            {/* 3. Marital Status */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Marital Status</span>
              {editingApplicantField === 'marital_status' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(e.target.value)}
                    className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingApplicantField(null);
                      if (e.key === 'Enter') handleInlineSaveApplicantField('marital_status', applicantDraftValue);
                    }}
                  >
                    <option value="">Select Marital Status...</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Separated">Separated</option>
                  </select>
                  <button
                    type="button"
                    disabled={applicantFieldSaving}
                    onClick={() => handleInlineSaveApplicantField('marital_status', applicantDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-[10px] pl-1">{applicantFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingApplicantField('marital_status');
                    setApplicantDraftValue(primaryApplicant?.maritalStatus || '');
                    setApplicantFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Marital Status"
                >
                  {primaryApplicant?.maritalStatus || '—'}
                </span>
              )}
            </div>

            {/* 4. U.S. Citizen */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">U.S. Citizen</span>
              {editingApplicantField === 'us_citizen' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={applicantDraftValue ? 'Yes' : 'No'}
                    onChange={e => setApplicantDraftValue(e.target.value === 'Yes')}
                    className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingApplicantField(null);
                      if (e.key === 'Enter') handleInlineSaveApplicantField('born_in_usa', applicantDraftValue);
                    }}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                  <button
                    type="button"
                    disabled={applicantFieldSaving}
                    onClick={() => handleInlineSaveApplicantField('born_in_usa', applicantDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-[10px] pl-1">{applicantFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingApplicantField('us_citizen');
                    setApplicantDraftValue(primaryApplicant?.usCitizen !== false);
                    setApplicantFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit U.S. Citizen"
                >
                  {primaryApplicant?.usCitizen !== null && primaryApplicant?.usCitizen !== undefined
                    ? (primaryApplicant.usCitizen ? 'Yes' : 'No')
                    : '—'}
                </span>
              )}
            </div>

            {/* 5. Immigration Status */}
            <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
              <span className="text-slate-500 font-medium leading-snug break-words">Immigration Status</span>
              {editingApplicantField === 'immigration_status' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(e.target.value)}
                    className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') setEditingApplicantField(null);
                      if (e.key === 'Enter') handleInlineSaveApplicantField('immigration_status', applicantDraftValue);
                    }}
                  >
                    <option value="">Select Immigration Status...</option>
                    <option value="Citizen">Citizen</option>
                    <option value="Permanent Resident">Permanent Resident</option>
                    <option value="Work Permit">Work Permit</option>
                    <option value="Other">Other</option>
                  </select>
                  <button
                    type="button"
                    disabled={applicantFieldSaving}
                    onClick={() => handleInlineSaveApplicantField('immigration_status', applicantDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-[10px] pl-1">{applicantFieldError}</span>}
                </div>
              ) : (
                <span
                  onClick={() => {
                    setEditingApplicantField('immigration_status');
                    setApplicantDraftValue(primaryApplicant?.immigrationStatus || '');
                    setApplicantFieldError(null);
                  }}
                  className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                  title="Click to edit Immigration Status"
                >
                  {primaryApplicant?.immigrationStatus || '—'}
                </span>
              )}
            </div>

            {/* CONDITIONAL IMMIGRATION FIELDS: Work Permit */}
            {primaryApplicant?.immigrationStatus === 'Work Permit' && (
              <>
                <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                  <span className="text-slate-500 font-medium leading-snug break-words">Card Number</span>
                  {editingApplicantField === 'card_number' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={applicantDraftValue}
                        onChange={e => setApplicantDraftValue(e.target.value)}
                        placeholder="Card Number..."
                        className="w-32 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold font-mono outline-none"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') setEditingApplicantField(null);
                          if (e.key === 'Enter') handleInlineSaveApplicantField('card_number', applicantDraftValue);
                        }}
                      />
                      <button
                        type="button"
                        disabled={applicantFieldSaving}
                        onClick={() => handleInlineSaveApplicantField('card_number', applicantDraftValue)}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingApplicantField(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => {
                        setEditingApplicantField('card_number');
                        setApplicantDraftValue(primaryApplicant?.cardNumber || '');
                      }}
                      className="text-slate-900 font-semibold font-mono cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                      title="Click to edit Card Number"
                    >
                      {primaryApplicant?.cardNumber || '—'}
                    </span>
                  )}
                </div>

                <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                  <span className="text-slate-500 font-medium leading-snug break-words">USCIS Number</span>
                  {editingApplicantField === 'uscis_number' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={applicantDraftValue}
                        onChange={e => setApplicantDraftValue(e.target.value)}
                        placeholder="USCIS Number..."
                        className="w-32 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold font-mono outline-none"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') setEditingApplicantField(null);
                          if (e.key === 'Enter') handleInlineSaveApplicantField('uscis_number', applicantDraftValue);
                        }}
                      />
                      <button
                        type="button"
                        disabled={applicantFieldSaving}
                        onClick={() => handleInlineSaveApplicantField('uscis_number', applicantDraftValue)}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingApplicantField(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => {
                        setEditingApplicantField('uscis_number');
                        setApplicantDraftValue(primaryApplicant?.uscisNumber || '');
                      }}
                      className="text-slate-900 font-semibold font-mono cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                      title="Click to edit USCIS Number"
                    >
                      {primaryApplicant?.uscisNumber || '—'}
                    </span>
                  )}
                </div>

                <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                  <span className="text-slate-500 font-medium leading-snug break-words">Category</span>
                  {editingApplicantField === 'immigration_category' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={applicantDraftValue}
                        onChange={e => setApplicantDraftValue(e.target.value)}
                        placeholder="Category..."
                        className="w-28 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') setEditingApplicantField(null);
                          if (e.key === 'Enter') handleInlineSaveApplicantField('immigration_category', applicantDraftValue);
                        }}
                      />
                      <button
                        type="button"
                        disabled={applicantFieldSaving}
                        onClick={() => handleInlineSaveApplicantField('immigration_category', applicantDraftValue)}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingApplicantField(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => {
                        setEditingApplicantField('immigration_category');
                        setApplicantDraftValue(primaryApplicant?.immigrationCategory || '');
                      }}
                      className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                      title="Click to edit Category"
                    >
                      {primaryApplicant?.immigrationCategory || '—'}
                    </span>
                  )}
                </div>

                <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                  <span className="text-slate-500 font-medium leading-snug break-words">Expiration Date</span>
                  {editingApplicantField === 'immigration_expiration_date' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={applicantDraftValue}
                        onChange={e => setApplicantDraftValue(formatAsDateInput(e.target.value))}
                        placeholder="MM/DD/YYYY"
                        className="w-28 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none font-sans"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') setEditingApplicantField(null);
                          if (e.key === 'Enter') {
                            const parsedIso = parseDisplayDate(applicantDraftValue);
                            handleInlineSaveApplicantField('immigration_expiration_date', parsedIso);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={applicantFieldSaving}
                        onClick={() => {
                          const parsedIso = parseDisplayDate(applicantDraftValue);
                          handleInlineSaveApplicantField('immigration_expiration_date', parsedIso);
                        }}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingApplicantField(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => {
                        setEditingApplicantField('immigration_expiration_date');
                        setApplicantDraftValue(primaryApplicant?.immigrationExpirationDate ? formatDateForDisplay(primaryApplicant.immigrationExpirationDate) : '');
                      }}
                      className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                      title="Click to edit Expiration Date"
                    >
                      {formatDateForDisplay(primaryApplicant?.immigrationExpirationDate)}
                    </span>
                  )}
                </div>
              </>
            )}

            {/* CONDITIONAL IMMIGRATION FIELDS: Resident */}
            {(primaryApplicant?.immigrationStatus === 'Resident' || primaryApplicant?.immigrationStatus === 'Permanent Resident') && (
              <>
                <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                  <span className="text-slate-500 font-medium leading-snug break-words">Alien Number</span>
                  {editingApplicantField === 'alien_number' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={applicantDraftValue}
                        onChange={e => setApplicantDraftValue(e.target.value)}
                        placeholder="Alien Number..."
                        className="w-32 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold font-mono outline-none"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') setEditingApplicantField(null);
                          if (e.key === 'Enter') handleInlineSaveApplicantField('alien_number', applicantDraftValue);
                        }}
                      />
                      <button
                        type="button"
                        disabled={applicantFieldSaving}
                        onClick={() => handleInlineSaveApplicantField('alien_number', applicantDraftValue)}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingApplicantField(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => {
                        setEditingApplicantField('alien_number');
                        setApplicantDraftValue(primaryApplicant?.alienNumber || '');
                      }}
                      className="text-slate-900 font-semibold font-mono cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                      title="Click to edit Alien Number"
                    >
                      {primaryApplicant?.alienNumber || '—'}
                    </span>
                  )}
                </div>

                <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                  <span className="text-slate-500 font-medium leading-snug break-words">Card Number</span>
                  {editingApplicantField === 'card_number' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={applicantDraftValue}
                        onChange={e => setApplicantDraftValue(e.target.value)}
                        placeholder="Card Number..."
                        className="w-32 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold font-mono outline-none"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') setEditingApplicantField(null);
                          if (e.key === 'Enter') handleInlineSaveApplicantField('card_number', applicantDraftValue);
                        }}
                      />
                      <button
                        type="button"
                        disabled={applicantFieldSaving}
                        onClick={() => handleInlineSaveApplicantField('card_number', applicantDraftValue)}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingApplicantField(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => {
                        setEditingApplicantField('card_number');
                        setApplicantDraftValue(primaryApplicant?.cardNumber || '');
                      }}
                      className="text-slate-900 font-semibold font-mono cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                      title="Click to edit Card Number"
                    >
                      {primaryApplicant?.cardNumber || '—'}
                    </span>
                  )}
                </div>

                <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                  <span className="text-slate-500 font-medium leading-snug break-words">Expiration Date</span>
                  {editingApplicantField === 'immigration_expiration_date' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={applicantDraftValue}
                        onChange={e => setApplicantDraftValue(formatAsDateInput(e.target.value))}
                        placeholder="MM/DD/YYYY"
                        className="w-28 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none font-sans"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') setEditingApplicantField(null);
                          if (e.key === 'Enter') {
                            const parsedIso = parseDisplayDate(applicantDraftValue);
                            handleInlineSaveApplicantField('immigration_expiration_date', parsedIso);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={applicantFieldSaving}
                        onClick={() => {
                          const parsedIso = parseDisplayDate(applicantDraftValue);
                          handleInlineSaveApplicantField('immigration_expiration_date', parsedIso);
                        }}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingApplicantField(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => {
                        setEditingApplicantField('immigration_expiration_date');
                        setApplicantDraftValue(primaryApplicant?.immigrationExpirationDate ? formatDateForDisplay(primaryApplicant.immigrationExpirationDate) : '');
                      }}
                      className="text-slate-900 font-semibold cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                      title="Click to edit Expiration Date"
                    >
                      {formatDateForDisplay(primaryApplicant?.immigrationExpirationDate)}
                    </span>
                  )}
                </div>
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

              const updateMember = async (updates: Partial<HealthTaxHouseholdMember>) => {
                setTaxMemberFieldError(null);
                const currentMember = taxMembers[memberNumber] || member;
                const updatedMember: HealthTaxHouseholdMember = {
                  ...currentMember,
                  ...updates,
                  health_policy_id: initialPolicy?.id || currentMember.health_policy_id,
                  member_number: memberNumber
                };

                if (initialPolicy?.id) {
                  try {
                    const saved = await upsertTaxHouseholdMember(initialPolicy.id, updatedMember);
                    setTaxMembers(prev => ({
                      ...prev,
                      [memberNumber]: saved
                    }));
                    setEditingTaxMemberField(null);
                  } catch (err: any) {
                    console.error(`Failed to save Tax Household Member ${memberNumber} field:`, err);
                    setTaxMemberFieldError(err?.message || `Failed to save Member ${memberNumber}`);
                  }
                } else {
                  hasLocalTaxChangesRef.current = true;
                  setTaxMembers(prev => ({
                    ...prev,
                    [memberNumber]: updatedMember
                  }));
                  setEditingTaxMemberField(null);
                }
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm font-sans">
                      {/* LEFT COLUMN */}
                      <div className="space-y-0 divide-y divide-slate-100/70">
                        {/* 1. Coverage */}
                        <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                          <span className="text-slate-500 font-medium leading-snug break-words">Coverage</span>
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
                        <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                          <span className="text-slate-500 font-medium leading-snug break-words">Full Name</span>
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
                        <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                          <span className="text-slate-500 font-medium leading-snug break-words">DOB</span>
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
                        <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                          <span className="text-slate-500 font-medium leading-snug break-words">Age</span>
                          <span className="text-slate-900 font-semibold select-none">
                            {calculateAgeFromDob(member.date_of_birth) !== null ? calculateAgeFromDob(member.date_of_birth) : '—'}
                          </span>
                        </div>

                        {/* 5. SSN (Sensitive Field) */}
                        <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
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
                        <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                          <span className="text-slate-500 font-medium leading-snug break-words">Relationship to Applicant</span>
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

                        {/* 2. U.S. Citizen */}
                        <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                          <span className="text-slate-500 font-medium leading-snug break-words">U.S. Citizen</span>
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

                        {/* 3. Immigration Status */}
                        <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[36px]">
                          <span className="text-slate-500 font-medium leading-snug break-words">Immigration Status</span>
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

      {/* SECTION 5 — Residence Information */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4 font-sans">
        <div className="border-b border-slate-50 pb-3">
          <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
            Residence Information
          </h4>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Primary applicant residence address (Click value to edit)
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1 text-sm font-sans font-sans divide-y divide-slate-100/70">
          {/* 1. Street Address */}
          <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[32px]">
            <span className="text-slate-500 font-medium leading-snug break-words">Street Address</span>
            {editingResidenceField === 'address' ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={residenceDraftValue}
                  onChange={e => setResidenceDraftValue(e.target.value)}
                  placeholder="Street address..."
                  className="w-48 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Escape') setEditingResidenceField(null);
                    if (e.key === 'Enter') handleInlineSaveResidenceField('address', residenceDraftValue);
                  }}
                />
                <button
                  type="button"
                  disabled={residenceFieldSaving}
                  onClick={() => handleInlineSaveResidenceField('address', residenceDraftValue)}
                  className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                  title="Save"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setEditingResidenceField(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                  title="Cancel"
                >
                  ✕
                </button>
                {residenceFieldError && <span className="text-rose-500 text-[10px] pl-1">{residenceFieldError}</span>}
              </div>
            ) : (
              <span
                onClick={() => {
                  setEditingResidenceField('address');
                  setResidenceDraftValue(clientResidence?.address || '');
                  setResidenceFieldError(null);
                }}
                className="font-semibold text-slate-900 cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                title="Click to edit Street Address"
              >
                {clientResidence?.address || '—'}
              </span>
            )}
          </div>

          {/* 2. City */}
          <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[32px]">
            <span className="text-slate-500 font-medium leading-snug break-words">City</span>
            {editingResidenceField === 'city' ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={residenceDraftValue}
                  onChange={e => setResidenceDraftValue(e.target.value)}
                  placeholder="City..."
                  className="w-36 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Escape') setEditingResidenceField(null);
                    if (e.key === 'Enter') handleInlineSaveResidenceField('city', residenceDraftValue);
                  }}
                />
                <button
                  type="button"
                  disabled={residenceFieldSaving}
                  onClick={() => handleInlineSaveResidenceField('city', residenceDraftValue)}
                  className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                  title="Save"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setEditingResidenceField(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                  title="Cancel"
                >
                  ✕
                </button>
                {residenceFieldError && <span className="text-rose-500 text-[10px] pl-1">{residenceFieldError}</span>}
              </div>
            ) : (
              <span
                onClick={() => {
                  setEditingResidenceField('city');
                  setResidenceDraftValue(clientResidence?.city || '');
                  setResidenceFieldError(null);
                }}
                className="font-semibold text-slate-900 cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                title="Click to edit City"
              >
                {clientResidence?.city || '—'}
              </span>
            )}
          </div>

          {/* 3. State */}
          <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[32px]">
            <span className="text-slate-500 font-medium leading-snug break-words">State</span>
            {editingResidenceField === 'state' ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={residenceDraftValue}
                  onChange={e => setResidenceDraftValue(e.target.value)}
                  placeholder="State (e.g. FL)..."
                  className="w-24 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Escape') setEditingResidenceField(null);
                    if (e.key === 'Enter') handleInlineSaveResidenceField('state', residenceDraftValue);
                  }}
                />
                <button
                  type="button"
                  disabled={residenceFieldSaving}
                  onClick={() => handleInlineSaveResidenceField('state', residenceDraftValue)}
                  className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                  title="Save"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setEditingResidenceField(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                  title="Cancel"
                >
                  ✕
                </button>
                {residenceFieldError && <span className="text-rose-500 text-[10px] pl-1">{residenceFieldError}</span>}
              </div>
            ) : (
              <span
                onClick={() => {
                  setEditingResidenceField('state');
                  setResidenceDraftValue(clientResidence?.state || '');
                  setResidenceFieldError(null);
                }}
                className="font-semibold text-slate-900 cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                title="Click to edit State"
              >
                {clientResidence?.state || '—'}
              </span>
            )}
          </div>

          {/* 4. Zip Code */}
          <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[32px]">
            <span className="text-slate-500 font-medium leading-snug break-words">Zip Code</span>
            {editingResidenceField === 'zip_code' ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={residenceDraftValue}
                  onChange={e => setResidenceDraftValue(e.target.value)}
                  placeholder="Zip code..."
                  className="w-24 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Escape') setEditingResidenceField(null);
                    if (e.key === 'Enter') handleInlineSaveResidenceField('zip_code', residenceDraftValue);
                  }}
                />
                <button
                  type="button"
                  disabled={residenceFieldSaving}
                  onClick={() => handleInlineSaveResidenceField('zip_code', residenceDraftValue)}
                  className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                  title="Save"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setEditingResidenceField(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                  title="Cancel"
                >
                  ✕
                </button>
                {residenceFieldError && <span className="text-rose-500 text-[10px] pl-1">{residenceFieldError}</span>}
              </div>
            ) : (
              <span
                onClick={() => {
                  setEditingResidenceField('zip_code');
                  setResidenceDraftValue(clientResidence?.zipCode || '');
                  setResidenceFieldError(null);
                }}
                className="font-semibold text-slate-900 cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                title="Click to edit Zip Code"
              >
                {clientResidence?.zipCode || '—'}
              </span>
            )}
          </div>

          {/* 5. County */}
          <div className="py-2 grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3 min-h-[32px]">
            <span className="text-slate-500 font-medium leading-snug break-words">County</span>
            {editingResidenceField === 'county' ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={residenceDraftValue}
                  onChange={e => setResidenceDraftValue(e.target.value)}
                  placeholder="County..."
                  className="w-32 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs text-slate-900 font-semibold outline-none"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Escape') setEditingResidenceField(null);
                    if (e.key === 'Enter') handleInlineSaveResidenceField('county', residenceDraftValue);
                  }}
                />
                <button
                  type="button"
                  disabled={residenceFieldSaving}
                  onClick={() => handleInlineSaveResidenceField('county', residenceDraftValue)}
                  className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold"
                  title="Save"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setEditingResidenceField(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold"
                  title="Cancel"
                >
                  ✕
                </button>
                {residenceFieldError && <span className="text-rose-500 text-[10px] pl-1">{residenceFieldError}</span>}
              </div>
            ) : (
              <span
                onClick={() => {
                  setEditingResidenceField('county');
                  setResidenceDraftValue(clientResidence?.county || '');
                  setResidenceFieldError(null);
                }}
                className="font-semibold text-slate-900 cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                title="Click to edit County"
              >
                {clientResidence?.county || '—'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 6 — Income Information */}
      <ClientIncomeInformationSection clientId={clientId} />

      {/* SECTION 7 — Medical Section (LAST SECTION) */}
      {initialPolicy?.id && (
        <HealthMedicalSection
          healthPolicyId={initialPolicy.id}
          clientId={clientId}
          addToast={addToast}
        />
      )}

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
