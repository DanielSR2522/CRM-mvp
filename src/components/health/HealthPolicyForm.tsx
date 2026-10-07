import React, { useState, useEffect, useMemo } from 'react';
import { HealthPolicy, HealthPolicyStatus, HealthActionPending, HealthTaxHouseholdMember, HealthPrimaryApplicant } from '@/lib/health/types';
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
  fetchHealthDocuments,
  fetchClientDocumentsCount
} from '@/lib/health/health-service';
import { fetchClientNotesCount } from '@/lib/notes/notes-service';
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
import { fetchAgentNpns, AgentNpn, formatAgentNpnLabel } from '@/lib/agent/agent-npn-service';

// Helper to calculate age dynamically from DOB string without timezone offset
const calculateAgeFromDob = (dobStr: string | null | undefined): string => {
  const age = calculateAgeFromDateOnly(dobStr);
  return age !== null ? `${age} yrs` : '—';
};

function HorizontalFieldRow({
  label,
  value,
  isEditing,
  onStartEdit,
  readOnly = false,
  renderEditor,
  valueClassName = '',
}: {
  label: string;
  value: React.ReactNode;
  isEditing?: boolean;
  onStartEdit?: () => void;
  readOnly?: boolean;
  renderEditor?: () => React.ReactNode;
  valueClassName?: string;
}) {
  const displayValue = value !== undefined && value !== null && value !== '' ? value : '—';

  return (
    <div className="py-[2px] grid grid-cols-[185px_minmax(0,1fr)] items-center gap-x-[18px] min-h-[36px]">
      <span className="text-[15px] font-normal text-[#52627A] leading-snug text-right w-[185px] pr-[18px] leading-snug break-words shrink-0">
        {label}
      </span>
      {isEditing && renderEditor ? (
        renderEditor()
      ) : readOnly ? (
        <span className={`text-[15px] font-normal text-[#253247] leading-snug select-none ${valueClassName}`}>
          {displayValue}
        </span>
      ) : (
        <div
          onClick={onStartEdit}
          className={`group inline-flex items-center gap-1.5 cursor-pointer text-[15px] font-normal text-[#253247] leading-snug transition-colors ${valueClassName}`}
          title={`Click to edit ${label}`}
        >
          <span>{displayValue}</span>
          <svg
            className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </div>
      )}
    </div>
  );
}

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
  const [policyStatus, setPolicyStatus] = useState<HealthPolicyStatus | string>('Pending');
  const [actionPending, setActionPending] = useState<HealthActionPending | string>('Documents');
  const [renovationStatus, setRenovationStatus] = useState<'New Policy 2026' | 'Renewal 2026' | 'Only Service' | null>('New Policy 2026');
  const [npn, setNpn] = useState('');
  const [authorizedNpns, setAuthorizedNpns] = useState<AgentNpn[]>([]);

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

  // Agency Info Summary Meta States (Client-wide Notes & Documents Counters)
  const [notesCount, setNotesCount] = useState<number | null>(null);
  const [notesLoading, setNotesLoading] = useState<boolean>(true);
  const [notesError, setNotesError] = useState<boolean>(false);

  const [documentsCount, setDocumentsCount] = useState<number | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState<boolean>(true);
  const [documentsError, setDocumentsError] = useState<boolean>(false);
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

  // Load Client-wide Notes Count
  const loadClientNotesCount = React.useCallback(async () => {
    if (!clientId) return;
    setNotesLoading(true);
    setNotesError(false);
    try {
      const count = await fetchClientNotesCount(clientId);
      setNotesCount(count);
    } catch (err) {
      console.error('Failed to load client notes count:', err);
      setNotesError(true);
    } finally {
      setNotesLoading(false);
    }
  }, [clientId]);

  // Load Client-wide Documents Count
  const loadClientDocumentsCount = React.useCallback(async () => {
    if (!clientId) return;
    setDocumentsLoading(true);
    setDocumentsError(false);
    try {
      const count = await fetchClientDocumentsCount(clientId);
      setDocumentsCount(count);
    } catch (err) {
      console.error('Failed to load client documents count:', err);
      setDocumentsError(true);
    } finally {
      setDocumentsLoading(false);
    }
  }, [clientId]);

  // Initial & Client-switch trigger for notes and documents counts
  useEffect(() => {
    loadClientNotesCount();
    loadClientDocumentsCount();
  }, [clientId, loadClientNotesCount, loadClientDocumentsCount]);

  // Real-time refresh listeners for creation/deletion/upload events across modules
  useEffect(() => {
    const handleNotesRefresh = () => {
      loadClientNotesCount();
    };

    const handleDocsRefresh = () => {
      loadClientDocumentsCount();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('client-notes-updated', handleNotesRefresh);
      window.addEventListener('notes-updated', handleNotesRefresh);
      window.addEventListener('crm:notes-refresh', handleNotesRefresh);
      window.addEventListener('client-documents-updated', handleDocsRefresh);
      window.addEventListener('documents-updated', handleDocsRefresh);
      window.addEventListener('crm:documents-refresh', handleDocsRefresh);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('client-notes-updated', handleNotesRefresh);
        window.removeEventListener('notes-updated', handleNotesRefresh);
        window.removeEventListener('crm:notes-refresh', handleNotesRefresh);
        window.removeEventListener('client-documents-updated', handleDocsRefresh);
        window.removeEventListener('documents-updated', handleDocsRefresh);
        window.removeEventListener('crm:documents-refresh', handleDocsRefresh);
      }
    };
  }, [loadClientNotesCount, loadClientDocumentsCount]);

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

      const loadAgentNpns = async () => {
        try {
          const { data: clientData } = await supabase
            .from('clients')
            .select('agent_id')
            .eq('id', clientId)
            .maybeSingle();

          let targetAgentId = clientData?.agent_id;
          if (!targetAgentId) {
            const { data: { session } } = await supabase.auth.getSession();
            targetAgentId = session?.user?.id;
          }
          if (targetAgentId) {
            const npns = await fetchAgentNpns(targetAgentId);
            setAuthorizedNpns(npns);
          }
        } catch (err: any) {
          console.warn('Failed to load client agent NPNs:', err);
        }
      };

      loadAgentNpns();
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
        // Default reset or restore transferred household draft from Personal Info
        let initialDraftCount = 1;
        const initialDraftMembers: { [key: number]: HealthTaxHouseholdMember } = {};
        if (typeof window !== 'undefined' && clientId) {
          try {
            const rawDraft = sessionStorage.getItem(`health_household_draft_${clientId}`);
            if (rawDraft) {
              const parsedDraft = JSON.parse(rawDraft);
              if (parsedDraft && typeof parsedDraft.taxMemberCount === 'number') {
                initialDraftCount = Math.max(1, parsedDraft.taxMemberCount);
                if (Array.isArray(parsedDraft.members)) {
                  parsedDraft.members.forEach((m: any) => {
                    if (m && m.member_number) {
                      initialDraftMembers[m.member_number] = {
                        health_policy_id: '',
                        member_number: m.member_number,
                        coverage: m.coverage !== false,
                        full_name: m.full_name || '',
                        date_of_birth: m.date_of_birth || null,
                        relationship_to_applicant: m.relationship_to_applicant || 'Son',
                        gender: m.gender || '',
                        us_citizen: m.us_citizen !== false,
                        uses_tobacco: !!m.uses_tobacco,
                        annual_income: m.annual_income || 0,
                        immigration_status: m.immigration_status || ''
                      };
                    }
                  });
                }
              }
            }
          } catch (e) {
            console.error('Error loading household draft from sessionStorage:', e);
          }
        }

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
        setCoverageMembersCount(initialDraftCount);
        setTaxMemberCount(initialDraftCount);
        setTaxMembers(initialDraftMembers);
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
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem(`health_household_draft_${clientId}`);
        } catch {}
      }
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

  const npnSelectOptions = useMemo(() => {
    const list = authorizedNpns.map(item => ({
      value: item.npn,
      label: formatAgentNpnLabel(item.npn, item.display_name)
    }));

    if (initialPolicy?.npn && !list.some(o => o.value === initialPolicy.npn)) {
      list.unshift({
        value: initialPolicy.npn,
        label: initialPolicy.npn
      });
    }

    return list;
  }, [authorizedNpns, initialPolicy?.npn]);

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
      <div className="w-full space-y-8 font-sans">
        {/* SECTION 1 — Agency Information */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h4 className="text-base font-bold text-slate-900 tracking-tight">
              Agency Information
            </h4>
            <span className="text-xs font-medium text-slate-400">
              Click value to edit
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1 text-sm font-sans">
            {/* LEFT COLUMN */}
            <div className="space-y-0">
              {/* 1. Active (formerly Enrolled) */}
              <HorizontalFieldRow
                label="Active"
                value={isActive ? 'Yes' : 'No'}
                isEditing={editingAgencyField === 'active'}
                onStartEdit={() => {
                  setEditingAgencyField('active');
                  setAgencyDraftValue(isActive);
                  setAgencyFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <select
                      value={agencyDraftValue ? 'Yes' : 'No'}
                      onChange={e => setAgencyDraftValue(e.target.value === 'Yes')}
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingAgencyField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveAgencyField('active', agencyDraftValue);
                        }
                      }}
                    >
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                    <button
                      type="button"
                      disabled={agencyFieldSaving}
                      onClick={() => handleInlineSaveAgencyField('active', agencyDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAgencyField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {agencyFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{agencyFieldError}</span>}
                  </div>
                )}
              />

              {/* 2. Renovation Year 2026 */}
              <HorizontalFieldRow
                label="Renovation Year 2026"
                value={yearRenovation || '2026'}
                isEditing={editingAgencyField === 'yearRenovation'}
                onStartEdit={() => {
                  setEditingAgencyField('yearRenovation');
                  setAgencyDraftValue(yearRenovation || '2026');
                  setAgencyFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <input
                      type="text"
                      value={agencyDraftValue}
                      onChange={e => setAgencyDraftValue(e.target.value)}
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingAgencyField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveAgencyField('yearRenovation', agencyDraftValue);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={agencyFieldSaving}
                      onClick={() => handleInlineSaveAgencyField('yearRenovation', agencyDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAgencyField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {agencyFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{agencyFieldError}</span>}
                  </div>
                )}
              />

              {/* 3. Notes */}
              <HorizontalFieldRow
                label="Notes"
                value={
                  notesLoading ? (
                    <span className="inline-flex items-center text-slate-400 text-sm">
                      <svg className="animate-spin h-3.5 w-3.5 text-slate-400 mr-1.5 shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Loading...
                    </span>
                  ) : notesError ? (
                    <span className="text-rose-500 font-medium text-xs">Error</span>
                  ) : (
                    notesCount ?? 0
                  )
                }
                readOnly={true}
              />

              {/* 4. Documents */}
              <HorizontalFieldRow
                label="Documents"
                value={
                  documentsLoading ? (
                    <span className="inline-flex items-center text-slate-400 text-sm">
                      <svg className="animate-spin h-3.5 w-3.5 text-slate-400 mr-1.5 shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Loading...
                    </span>
                  ) : documentsError ? (
                    <span className="text-rose-500 font-medium text-xs">Error</span>
                  ) : (
                    documentsCount ?? 0
                  )
                }
                readOnly={true}
              />
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-0">
              {/* 1. Policy Status */}
              <HorizontalFieldRow
                label="Policy Status"
                value={policyStatus || '—'}
                isEditing={editingAgencyField === 'policyStatus'}
                onStartEdit={() => {
                  setEditingAgencyField('policyStatus');
                  setAgencyDraftValue(policyStatus || 'Pending');
                  setAgencyFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <select
                      value={agencyDraftValue || 'Pending'}
                      onChange={e => setAgencyDraftValue(e.target.value)}
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingAgencyField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveAgencyField('policyStatus', agencyDraftValue);
                        }
                      }}
                    >
                      {agencyDraftValue && !['Sold', 'Enrolled', 'Pending', 'Cancelled'].includes(agencyDraftValue) && (
                        <option value={agencyDraftValue} disabled>{agencyDraftValue} (Legacy)</option>
                      )}
                      <option value="Sold">Sold</option>
                      <option value="Enrolled">Enrolled</option>
                      <option value="Pending">Pending</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                    <button
                      type="button"
                      disabled={agencyFieldSaving}
                      onClick={() => handleInlineSaveAgencyField('policyStatus', agencyDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAgencyField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {agencyFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{agencyFieldError}</span>}
                  </div>
                )}
              />

              {/* 2. Action Pending */}
              <HorizontalFieldRow
                label="Action Pending"
                value={actionPending || '—'}
                isEditing={editingAgencyField === 'actionPending'}
                onStartEdit={() => {
                  setEditingAgencyField('actionPending');
                  setAgencyDraftValue(actionPending || 'Documents');
                  setAgencyFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <select
                      value={agencyDraftValue || 'Documents'}
                      onChange={e => setAgencyDraftValue(e.target.value)}
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingAgencyField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveAgencyField('actionPending', agencyDraftValue);
                        }
                      }}
                    >
                      <option value="Payment">Payment</option>
                      <option value="Enroll">Enroll</option>
                      <option value="Documents">Documents</option>
                      <option value="Verification">Verification</option>
                      <option value="Call To Marketplace">Call To Marketplace</option>
                      <option value="Completed">Completed</option>
                    </select>
                    <button
                      type="button"
                      disabled={agencyFieldSaving}
                      onClick={() => handleInlineSaveAgencyField('actionPending', agencyDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAgencyField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {agencyFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{agencyFieldError}</span>}
                  </div>
                )}
              />

              {/* 3. Renovation Status */}
              <HorizontalFieldRow
                label="Renovation Status"
                value={renovationStatus || '—'}
                isEditing={editingAgencyField === 'renovationStatus'}
                onStartEdit={() => {
                  setEditingAgencyField('renovationStatus');
                  setAgencyDraftValue(renovationStatus || 'New Policy 2026');
                  setAgencyFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <select
                      value={agencyDraftValue || 'New Policy 2026'}
                      onChange={e => setAgencyDraftValue(e.target.value)}
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingAgencyField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveAgencyField('renovationStatus', agencyDraftValue);
                        }
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
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAgencyField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {agencyFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{agencyFieldError}</span>}
                  </div>
                )}
              />

              {/* 4. Agent */}
              <HorizontalFieldRow
                label="Agent"
                value={agentName || '—'}
                readOnly={true}
              />

              {/* 5. NPN */}
              <HorizontalFieldRow
                label="NPN"
                value={npnSelectOptions.find(o => o.value === npn)?.label || npn || '—'}
                isEditing={editingAgencyField === 'npn'}
                onStartEdit={() => {
                  setEditingAgencyField('npn');
                  setAgencyDraftValue(npn || (npnSelectOptions[0]?.value ?? ''));
                  setAgencyFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <select
                      value={agencyDraftValue}
                      onChange={e => setAgencyDraftValue(e.target.value)}
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingAgencyField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveAgencyField('npn', agencyDraftValue);
                        }
                      }}
                    >
                      {npnSelectOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={agencyFieldSaving}
                      onClick={() => handleInlineSaveAgencyField('npn', agencyDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAgencyField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {agencyFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{agencyFieldError}</span>}
                  </div>
                )}
              />

              {/* 6. Consent Ready */}
              <HorizontalFieldRow
                label="Consent Ready"
                value={isConsentReady ? 'Yes' : 'No'}
                readOnly={true}
              />
            </div>
          </div>
        </div>

        {/* SECTION 2 — Health Information 2026 */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h4 className="text-base font-bold text-slate-900 tracking-tight">
              Health Information 2026
            </h4>
            <span className="text-xs font-medium text-slate-400">
              Click value to edit
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1 text-sm font-sans">
            {/* LEFT COLUMN */}
            <div className="space-y-0">
              {/* 1. Company 2026 */}
              <HorizontalFieldRow
                label="Company 2026"
                value={company2026}
                isEditing={editingHealthField === 'company2026'}
                onStartEdit={() => {
                  setEditingHealthField('company2026');
                  setHealthDraftValue(company2026);
                  setHealthFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <input
                      type="text"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="Company..."
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingHealthField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveHealthField('company2026', healthDraftValue);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('company2026', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{healthFieldError}</span>}
                  </div>
                )}
              />

              {/* 2. Type Plan */}
              <HorizontalFieldRow
                label="Type Plan"
                value={typePlan}
                isEditing={editingHealthField === 'typePlan'}
                onStartEdit={() => {
                  setEditingHealthField('typePlan');
                  setHealthDraftValue(typePlan);
                  setHealthFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <select
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingHealthField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveHealthField('typePlan', healthDraftValue);
                        }
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
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{healthFieldError}</span>}
                  </div>
                )}
              />

              {/* 3. Plan ID */}
              <HorizontalFieldRow
                label="Plan ID"
                value={planId}
                isEditing={editingHealthField === 'planId'}
                onStartEdit={() => {
                  setEditingHealthField('planId');
                  setHealthDraftValue(planId);
                  setHealthFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <input
                      type="text"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="Plan ID..."
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingHealthField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveHealthField('planId', healthDraftValue);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('planId', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{healthFieldError}</span>}
                  </div>
                )}
              />

              {/* 4. Plan Name */}
              <HorizontalFieldRow
                label="Plan Name"
                value={planName}
                isEditing={editingHealthField === 'planName'}
                onStartEdit={() => {
                  setEditingHealthField('planName');
                  setHealthDraftValue(planName);
                  setHealthFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <input
                      type="text"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="Plan Name..."
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingHealthField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveHealthField('planName', healthDraftValue);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('planName', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{healthFieldError}</span>}
                  </div>
                )}
              />

              {/* 5. No. Membership */}
              <HorizontalFieldRow
                label="No. Membership"
                value={noMembership}
                isEditing={editingHealthField === 'noMembership'}
                onStartEdit={() => {
                  setEditingHealthField('noMembership');
                  setHealthDraftValue(noMembership);
                  setHealthFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <input
                      type="text"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="Membership No..."
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingHealthField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveHealthField('noMembership', healthDraftValue);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('noMembership', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{healthFieldError}</span>}
                  </div>
                )}
              />

              {/* 6. Plan Cost */}
              <HorizontalFieldRow
                label="Plan Cost"
                value={`$${Number(planCost || 0).toFixed(2)}`}
                isEditing={editingHealthField === 'planCost'}
                onStartEdit={() => {
                  setEditingHealthField('planCost');
                  setHealthDraftValue(planCost);
                  setHealthFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <input
                      type="number"
                      step="0.01"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="0.00"
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingHealthField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveHealthField('planCost', healthDraftValue);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('planCost', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{healthFieldError}</span>}
                  </div>
                )}
              />

              {/* 7. Tax Credit */}
              <HorizontalFieldRow
                label="Tax Credit"
                value={`$${Number(taxCredit || 0).toFixed(2)}`}
                isEditing={editingHealthField === 'taxCredit'}
                onStartEdit={() => {
                  setEditingHealthField('taxCredit');
                  setHealthDraftValue(taxCredit);
                  setHealthFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <input
                      type="number"
                      step="0.01"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="0.00"
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingHealthField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveHealthField('taxCredit', healthDraftValue);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('taxCredit', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{healthFieldError}</span>}
                  </div>
                )}
              />

              {/* 8. Monthly Premium */}
              <HorizontalFieldRow
                label="Monthly Premium"
                value={`$${monthlyPremium}`}
                readOnly={true}
              />

              {/* 9. Effective Date */}
              <HorizontalFieldRow
                label="Effective Date"
                value={effectiveDate ? formatDateForDisplay(effectiveDate) : ''}
                isEditing={editingHealthField === 'effectiveDate'}
                onStartEdit={() => {
                  setEditingHealthField('effectiveDate');
                  setHealthDraftValue(effectiveDate ? formatDateForDisplay(effectiveDate) : '');
                  setHealthFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <input
                      type="text"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(formatAsDateInput(e.target.value))}
                      placeholder="MM/DD/YYYY"
                      className="h-[34px] w-full flex-1 min-w-0 bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingHealthField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveHealthField('effectiveDate', healthDraftValue);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('effectiveDate', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{healthFieldError}</span>}
                  </div>
                )}
              />

              {/* 10. Coverage Members Count */}
              <HorizontalFieldRow
                label="Coverage Members Count"
                value={calculatedCoverageMembersCount}
                readOnly={true}
              />
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-0">
              {/* 1. Application Number 2026 */}
              <HorizontalFieldRow
                label="Application Number 2026"
                value={applicationNumber}
                isEditing={editingHealthField === 'applicationNumber'}
                onStartEdit={() => {
                  setEditingHealthField('applicationNumber');
                  setHealthDraftValue(applicationNumber);
                  setHealthFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <input
                      type="text"
                      value={healthDraftValue}
                      onChange={e => setHealthDraftValue(e.target.value)}
                      placeholder="Application No..."
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingHealthField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveHealthField('applicationNumber', healthDraftValue);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('applicationNumber', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{healthFieldError}</span>}
                  </div>
                )}
              />

              {/* 2. Marketplace Account */}
              <HorizontalFieldRow
                label="Marketplace Account"
                value={marketplaceAccount ? 'Yes' : 'No'}
                isEditing={editingHealthField === 'marketplaceAccount'}
                onStartEdit={() => {
                  setEditingHealthField('marketplaceAccount');
                  setHealthDraftValue(marketplaceAccount);
                  setHealthFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <select
                      value={healthDraftValue ? 'Yes' : 'No'}
                      onChange={e => setHealthDraftValue(e.target.value === 'Yes')}
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingHealthField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleInlineSaveHealthField('marketplaceAccount', healthDraftValue);
                        }
                      }}
                    >
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                    <button
                      type="button"
                      disabled={healthFieldSaving}
                      onClick={() => handleInlineSaveHealthField('marketplaceAccount', healthDraftValue)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                    {healthFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{healthFieldError}</span>}
                  </div>
                )}
              />

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
              <HorizontalFieldRow
                label="Company Account"
                value={companyAccount ? 'Yes' : 'No'}
                isEditing={editingHealthField === 'companyAccount'}
                onStartEdit={() => {
                  setEditingHealthField('companyAccount');
                  setHealthFieldError(null);
                }}
                renderEditor={() => (
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                    <select
                      value={companyAccount ? 'Yes' : 'No'}
                      onChange={e => setCompanyAccount(e.target.value === 'Yes')}
                      className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingHealthField(null);
                        }
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          setEditingHealthField(null);
                        }
                      }}
                    >
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0"
                      title="Save"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingHealthField(null)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                )}
              />

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
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-2">
          <div>
            <h4 className="text-base font-bold text-slate-900 tracking-tight">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1 text-sm font-sans">
          {/* LEFT COLUMN */}
          <div className="space-y-0">
            {/* 1. Coverage */}
            <HorizontalFieldRow
              label="Coverage"
              value={applicantCoverage ? 'Yes' : 'No'}
              isEditing={editingHealthField === 'applicantCoverage'}
              onStartEdit={() => setEditingHealthField('applicantCoverage')}
              renderEditor={() => (
                <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                  <select
                    value={applicantCoverage ? 'Yes' : 'No'}
                    onChange={e => setApplicantCoverage(e.target.value === 'Yes')}
                    className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingHealthField(null);
                      }
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        setEditingHealthField(null);
                      }
                    }}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setEditingHealthField(null)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingHealthField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                    title="Cancel"
                  >
                    ✕
                  </button>
                </div>
              )}
            />

            {/* 2. Applicant Name */}
            <HorizontalFieldRow
              label="Applicant Name"
              value={primaryApplicant?.fullName}
              isEditing={editingApplicantField === 'full_name'}
              onStartEdit={() => {
                setEditingApplicantField('full_name');
                setApplicantDraftValue(primaryApplicant?.fullName || '');
                setApplicantFieldError(null);
              }}
              renderEditor={() => (
                <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                  <input
                    type="text"
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(e.target.value)}
                    className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingApplicantField(null);
                      }
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleInlineSaveApplicantField('full_name', applicantDraftValue);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={applicantFieldSaving}
                    onClick={() => handleInlineSaveApplicantField('full_name', applicantDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{applicantFieldError}</span>}
                </div>
              )}
            />

            {/* 3. DOB */}
            <HorizontalFieldRow
              label="DOB"
              value={formatDateForDisplay(primaryApplicant?.dateOfBirth)}
              isEditing={editingApplicantField === 'date_of_birth'}
              onStartEdit={() => {
                setEditingApplicantField('date_of_birth');
                setApplicantDraftValue(primaryApplicant?.dateOfBirth ? formatDateForDisplay(primaryApplicant.dateOfBirth) : '');
                setApplicantFieldError(null);
              }}
              renderEditor={() => (
                <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                  <input
                    type="text"
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(formatAsDateInput(e.target.value))}
                    placeholder="MM/DD/YYYY"
                    className="h-[34px] w-full flex-1 min-w-0 bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingApplicantField(null);
                      }
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
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
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{applicantFieldError}</span>}
                </div>
              )}
            />

            {/* 4. Age */}
            <HorizontalFieldRow
              label="Age"
              value={primaryApplicant?.dateOfBirth ? calculateAgeFromDob(primaryApplicant.dateOfBirth) : '—'}
              readOnly={true}
            />

            {/* 5. SSN (Visible unmasked) */}
            <HorizontalFieldRow
              label="SSN"
              value={primaryApplicant?.ssn ? formatSsnInput(primaryApplicant.ssn) : '—'}
              valueClassName="font-mono"
              isEditing={editingApplicantField === 'ssn'}
              onStartEdit={() => {
                setEditingApplicantField('ssn');
                setApplicantDraftValue(primaryApplicant?.ssn ? formatSsnInput(primaryApplicant.ssn) : '');
                setApplicantFieldError(null);
              }}
              renderEditor={() => (
                <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                  <input
                    type="text"
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(formatSsnInput(e.target.value))}
                    placeholder="XXX-XX-XXXX"
                    className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-mono w-full flex-1 min-w-0"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingApplicantField(null);
                      }
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleInlineSaveApplicantField('ssn', applicantDraftValue.replace(/\D/g, ''));
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={applicantFieldSaving}
                    onClick={() => handleInlineSaveApplicantField('ssn', applicantDraftValue.replace(/\D/g, ''))}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{applicantFieldError}</span>}
                </div>
              )}
            />

            {/* 6. Email */}
            <HorizontalFieldRow
              label="Email"
              value={primaryApplicant?.email}
              isEditing={editingApplicantField === 'email'}
              onStartEdit={() => {
                setEditingApplicantField('email');
                setApplicantDraftValue(primaryApplicant?.email || '');
                setApplicantFieldError(null);
              }}
              renderEditor={() => (
                <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                  <input
                    type="email"
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(e.target.value)}
                    placeholder="email@domain.com"
                    className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingApplicantField(null);
                      }
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleInlineSaveApplicantField('email', applicantDraftValue);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={applicantFieldSaving}
                    onClick={() => handleInlineSaveApplicantField('email', applicantDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{applicantFieldError}</span>}
                </div>
              )}
            />

            {/* 7. Phone */}
            <HorizontalFieldRow
              label="Phone"
              value={primaryApplicant?.phone}
              isEditing={editingApplicantField === 'phone'}
              onStartEdit={() => {
                setEditingApplicantField('phone');
                setApplicantDraftValue(primaryApplicant?.phone || '');
                setApplicantFieldError(null);
              }}
              renderEditor={() => (
                <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                  <input
                    type="text"
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(e.target.value)}
                    placeholder="Phone number"
                    className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingApplicantField(null);
                      }
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleInlineSaveApplicantField('phone', applicantDraftValue);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={applicantFieldSaving}
                    onClick={() => handleInlineSaveApplicantField('phone', applicantDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{applicantFieldError}</span>}
                </div>
              )}
            />

            {/* 8. Number of People on Tax Return */}
            <HorizontalFieldRow
              label="Number of People on Tax Return"
              value={taxMemberCount}
              isEditing={editingApplicantField === 'tax_household_count'}
              onStartEdit={() => {
                setEditingApplicantField('tax_household_count');
                setApplicantDraftValue(taxMemberCount);
              }}
              renderEditor={() => (
                <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                  <select
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(Number(e.target.value))}
                    className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingApplicantField(null);
                      }
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
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
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                    title="Cancel"
                  >
                    ✕
                  </button>
                </div>
              )}
            />
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-0">
            {/* 1. Relationship */}
            <HorizontalFieldRow
              label="Relationship"
              value="Self"
              readOnly={true}
            />

            {/* 2. Gender */}
            <HorizontalFieldRow
              label="Gender"
              value={primaryApplicant?.gender}
              isEditing={editingApplicantField === 'gender'}
              onStartEdit={() => {
                setEditingApplicantField('gender');
                setApplicantDraftValue(primaryApplicant?.gender || '');
                setApplicantFieldError(null);
              }}
              renderEditor={() => (
                <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                  <select
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(e.target.value)}
                    className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingApplicantField(null);
                      }
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleInlineSaveApplicantField('gender', applicantDraftValue);
                      }
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
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{applicantFieldError}</span>}
                </div>
              )}
            />

            {/* 3. Marital Status */}
            <HorizontalFieldRow
              label="Marital Status"
              value={primaryApplicant?.maritalStatus}
              isEditing={editingApplicantField === 'marital_status'}
              onStartEdit={() => {
                setEditingApplicantField('marital_status');
                setApplicantDraftValue(primaryApplicant?.maritalStatus || '');
                setApplicantFieldError(null);
              }}
              renderEditor={() => (
                <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                  <select
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(e.target.value)}
                    className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingApplicantField(null);
                      }
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleInlineSaveApplicantField('marital_status', applicantDraftValue);
                      }
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
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{applicantFieldError}</span>}
                </div>
              )}
            />

            {/* 4. U.S. Citizen */}
            <HorizontalFieldRow
              label="U.S. Citizen"
              value={primaryApplicant?.usCitizen !== null && primaryApplicant?.usCitizen !== undefined ? (primaryApplicant.usCitizen ? 'Yes' : 'No') : ''}
              isEditing={editingApplicantField === 'us_citizen'}
              onStartEdit={() => {
                setEditingApplicantField('us_citizen');
                setApplicantDraftValue(primaryApplicant?.usCitizen !== false);
                setApplicantFieldError(null);
              }}
              renderEditor={() => (
                <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                  <select
                    value={applicantDraftValue ? 'Yes' : 'No'}
                    onChange={e => setApplicantDraftValue(e.target.value === 'Yes')}
                    className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingApplicantField(null);
                      }
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleInlineSaveApplicantField('born_in_usa', applicantDraftValue);
                      }
                    }}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                  <button
                    type="button"
                    disabled={applicantFieldSaving}
                    onClick={() => handleInlineSaveApplicantField('born_in_usa', applicantDraftValue)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{applicantFieldError}</span>}
                </div>
              )}
            />

            {/* 5. Immigration Status */}
            <HorizontalFieldRow
              label="Immigration Status"
              value={primaryApplicant?.immigrationStatus}
              isEditing={editingApplicantField === 'immigration_status'}
              onStartEdit={() => {
                setEditingApplicantField('immigration_status');
                setApplicantDraftValue(primaryApplicant?.immigrationStatus || '');
                setApplicantFieldError(null);
              }}
              renderEditor={() => (
                <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                  <select
                    value={applicantDraftValue}
                    onChange={e => setApplicantDraftValue(e.target.value)}
                    className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingApplicantField(null);
                      }
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleInlineSaveApplicantField('immigration_status', applicantDraftValue);
                      }
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
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                    title="Save"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingApplicantField(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                    title="Cancel"
                  >
                    ✕
                  </button>
                  {applicantFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{applicantFieldError}</span>}
                </div>
              )}
            />

            {/* CONDITIONAL IMMIGRATION FIELDS: Work Permit */}
            {primaryApplicant?.immigrationStatus === 'Work Permit' && (
              <>
                <HorizontalFieldRow
                  label="Card Number"
                  value={primaryApplicant?.cardNumber}
                  valueClassName="font-mono"
                  isEditing={editingApplicantField === 'card_number'}
                  onStartEdit={() => {
                    setEditingApplicantField('card_number');
                    setApplicantDraftValue(primaryApplicant?.cardNumber || '');
                  }}
                  renderEditor={() => (
                    <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                      <input
                        type="text"
                        value={applicantDraftValue}
                        onChange={e => setApplicantDraftValue(e.target.value)}
                        placeholder="Card Number..."
                        className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-mono w-full flex-1 min-w-0"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingApplicantField(null);
                          }
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            handleInlineSaveApplicantField('card_number', applicantDraftValue);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={applicantFieldSaving}
                        onClick={() => handleInlineSaveApplicantField('card_number', applicantDraftValue)}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingApplicantField(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                />

                <HorizontalFieldRow
                  label="USCIS Number"
                  value={primaryApplicant?.uscisNumber}
                  valueClassName="font-mono"
                  isEditing={editingApplicantField === 'uscis_number'}
                  onStartEdit={() => {
                    setEditingApplicantField('uscis_number');
                    setApplicantDraftValue(primaryApplicant?.uscisNumber || '');
                  }}
                  renderEditor={() => (
                    <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                      <input
                        type="text"
                        value={applicantDraftValue}
                        onChange={e => setApplicantDraftValue(e.target.value)}
                        placeholder="USCIS Number..."
                        className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-mono w-full flex-1 min-w-0"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingApplicantField(null);
                          }
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            handleInlineSaveApplicantField('uscis_number', applicantDraftValue);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={applicantFieldSaving}
                        onClick={() => handleInlineSaveApplicantField('uscis_number', applicantDraftValue)}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingApplicantField(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                />

                <HorizontalFieldRow
                  label="Category"
                  value={primaryApplicant?.immigrationCategory}
                  isEditing={editingApplicantField === 'immigration_category'}
                  onStartEdit={() => {
                    setEditingApplicantField('immigration_category');
                    setApplicantDraftValue(primaryApplicant?.immigrationCategory || '');
                  }}
                  renderEditor={() => (
                    <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                      <input
                        type="text"
                        value={applicantDraftValue}
                        onChange={e => setApplicantDraftValue(e.target.value)}
                        placeholder="Category..."
                        className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingApplicantField(null);
                          }
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            handleInlineSaveApplicantField('immigration_category', applicantDraftValue);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={applicantFieldSaving}
                        onClick={() => handleInlineSaveApplicantField('immigration_category', applicantDraftValue)}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingApplicantField(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                />

                <HorizontalFieldRow
                  label="Expiration Date"
                  value={primaryApplicant?.immigrationExpirationDate ? formatDateForDisplay(primaryApplicant.immigrationExpirationDate) : ''}
                  isEditing={editingApplicantField === 'immigration_expiration_date'}
                  onStartEdit={() => {
                    setEditingApplicantField('immigration_expiration_date');
                    setApplicantDraftValue(primaryApplicant?.immigrationExpirationDate ? formatDateForDisplay(primaryApplicant.immigrationExpirationDate) : '');
                  }}
                  renderEditor={() => (
                    <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                      <input
                        type="text"
                        value={applicantDraftValue}
                        onChange={e => setApplicantDraftValue(formatAsDateInput(e.target.value))}
                        placeholder="MM/DD/YYYY"
                        className="h-[34px] w-full flex-1 min-w-0 bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingApplicantField(null);
                          }
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
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
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingApplicantField(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                />
              </>
            )}

            {/* CONDITIONAL IMMIGRATION FIELDS: Resident */}
            {(primaryApplicant?.immigrationStatus === 'Resident' || primaryApplicant?.immigrationStatus === 'Permanent Resident') && (
              <>
                <HorizontalFieldRow
                  label="Alien Number"
                  value={primaryApplicant?.alienNumber}
                  valueClassName="font-mono"
                  isEditing={editingApplicantField === 'alien_number'}
                  onStartEdit={() => {
                    setEditingApplicantField('alien_number');
                    setApplicantDraftValue(primaryApplicant?.alienNumber || '');
                  }}
                  renderEditor={() => (
                    <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                      <input
                        type="text"
                        value={applicantDraftValue}
                        onChange={e => setApplicantDraftValue(e.target.value)}
                        placeholder="Alien Number..."
                        className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-mono w-full flex-1 min-w-0"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingApplicantField(null);
                          }
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            handleInlineSaveApplicantField('alien_number', applicantDraftValue);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={applicantFieldSaving}
                        onClick={() => handleInlineSaveApplicantField('alien_number', applicantDraftValue)}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingApplicantField(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                />

                <HorizontalFieldRow
                  label="Card Number"
                  value={primaryApplicant?.cardNumber}
                  valueClassName="font-mono"
                  isEditing={editingApplicantField === 'card_number'}
                  onStartEdit={() => {
                    setEditingApplicantField('card_number');
                    setApplicantDraftValue(primaryApplicant?.cardNumber || '');
                  }}
                  renderEditor={() => (
                    <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                      <input
                        type="text"
                        value={applicantDraftValue}
                        onChange={e => setApplicantDraftValue(e.target.value)}
                        placeholder="Card Number..."
                        className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-mono w-full flex-1 min-w-0"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingApplicantField(null);
                          }
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            handleInlineSaveApplicantField('card_number', applicantDraftValue);
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={applicantFieldSaving}
                        onClick={() => handleInlineSaveApplicantField('card_number', applicantDraftValue)}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingApplicantField(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                />

                <HorizontalFieldRow
                  label="Expiration Date"
                  value={primaryApplicant?.immigrationExpirationDate ? formatDateForDisplay(primaryApplicant.immigrationExpirationDate) : ''}
                  isEditing={editingApplicantField === 'immigration_expiration_date'}
                  onStartEdit={() => {
                    setEditingApplicantField('immigration_expiration_date');
                    setApplicantDraftValue(primaryApplicant?.immigrationExpirationDate ? formatDateForDisplay(primaryApplicant.immigrationExpirationDate) : '');
                  }}
                  renderEditor={() => (
                    <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                      <input
                        type="text"
                        value={applicantDraftValue}
                        onChange={e => setApplicantDraftValue(formatAsDateInput(e.target.value))}
                        placeholder="MM/DD/YYYY"
                        className="h-[34px] w-full flex-1 min-w-0 bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingApplicantField(null);
                          }
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            e.preventDefault();
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
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingApplicantField(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* TAX HOUSEHOLD MEMBERS DYNAMIC SECTIONS */}
        {taxMemberCount > 1 && (
          <div className="pt-8 border-t border-slate-100">
            <div className="flex items-center justify-between mb-5">
              <h4 className="text-[16px] font-semibold text-[#111827]">
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
                  <div key={memberNumber} className="font-sans mt-8">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-[15px] font-semibold text-[#111827]">
                        Tax Household Member {memberNumber}
                      </h4>
                      <span className="text-[11px] font-medium text-slate-400">
                        Click value to edit
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1 text-sm font-sans">
                      {/* LEFT COLUMN */}
                      <div className="space-y-0">
                        {/* 1. Coverage */}
                        <HorizontalFieldRow
                          label="Coverage"
                          value={member.coverage !== false ? 'Yes' : 'No'}
                          isEditing={editingTaxMemberField === `m_${memberNumber}_coverage`}
                          onStartEdit={() => {
                            setEditingTaxMemberField(`m_${memberNumber}_coverage`);
                            setTaxMemberDraftValue(member.coverage !== false);
                            setTaxMemberFieldError(null);
                          }}
                          renderEditor={() => (
                            <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                              <select
                                value={taxMemberDraftValue ? 'Yes' : 'No'}
                                onChange={e => setTaxMemberDraftValue(e.target.value === 'Yes')}
                                className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setEditingTaxMemberField(null);
                                  }
                                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
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
                                className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTaxMemberField(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        />

                        {/* 2. Full Name */}
                        <HorizontalFieldRow
                          label="Full Name"
                          value={member.full_name}
                          isEditing={editingTaxMemberField === `m_${memberNumber}_fullName`}
                          onStartEdit={() => {
                            setEditingTaxMemberField(`m_${memberNumber}_fullName`);
                            setTaxMemberDraftValue(member.full_name || '');
                            setTaxMemberFieldError(null);
                          }}
                          renderEditor={() => (
                            <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                              <input
                                type="text"
                                value={taxMemberDraftValue}
                                onChange={e => setTaxMemberDraftValue(e.target.value)}
                                placeholder="Full name..."
                                className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setEditingTaxMemberField(null);
                                  }
                                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
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
                                className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTaxMemberField(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        />

                        {/* 3. DOB */}
                        <HorizontalFieldRow
                          label="DOB"
                          value={formatDateForDisplay(member.date_of_birth)}
                          isEditing={editingTaxMemberField === `m_${memberNumber}_dob`}
                          onStartEdit={() => {
                            setEditingTaxMemberField(`m_${memberNumber}_dob`);
                            setTaxMemberDraftValue(member.date_of_birth ? formatDateForDisplay(member.date_of_birth) : '');
                            setTaxMemberFieldError(null);
                          }}
                          renderEditor={() => (
                            <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                              <input
                                type="text"
                                value={taxMemberDraftValue}
                                onChange={e => setTaxMemberDraftValue(formatAsDateInput(e.target.value))}
                                placeholder="MM/DD/YYYY"
                                className="h-[34px] w-full flex-1 min-w-0 bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setEditingTaxMemberField(null);
                                  }
                                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
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
                                className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTaxMemberField(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                                title="Cancel"
                              >
                                ✕
                              </button>
                              {taxMemberFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{taxMemberFieldError}</span>}
                            </div>
                          )}
                        />

                        {/* 4. Age (Calculated read-only) */}
                        <HorizontalFieldRow
                          label="Age"
                          value={calculateAgeFromDob(member.date_of_birth) !== null ? calculateAgeFromDob(member.date_of_birth) : '—'}
                          readOnly={true}
                        />

                        {/* 5. SSN (Sensitive Field) */}
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

                      {/* RIGHT COLUMN */}
                      <div className="space-y-0">
                        {/* 1. Relationship to Applicant */}
                        <HorizontalFieldRow
                          label="Relationship to Applicant"
                          value={member.relationship_to_applicant || 'Spouse'}
                          isEditing={editingTaxMemberField === `m_${memberNumber}_relationship`}
                          onStartEdit={() => {
                            setEditingTaxMemberField(`m_${memberNumber}_relationship`);
                            setTaxMemberDraftValue(member.relationship_to_applicant || 'Spouse');
                            setTaxMemberFieldError(null);
                          }}
                          renderEditor={() => (
                            <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                              <select
                                value={taxMemberDraftValue}
                                onChange={e => setTaxMemberDraftValue(e.target.value)}
                                className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setEditingTaxMemberField(null);
                                  }
                                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
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
                                className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTaxMemberField(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        />

                        {/* 2. U.S. Citizen */}
                        <HorizontalFieldRow
                          label="U.S. Citizen"
                          value={member.us_citizen !== false ? 'Yes' : 'No'}
                          isEditing={editingTaxMemberField === `m_${memberNumber}_usCitizen`}
                          onStartEdit={() => {
                            setEditingTaxMemberField(`m_${memberNumber}_usCitizen`);
                            setTaxMemberDraftValue(member.us_citizen !== false);
                            setTaxMemberFieldError(null);
                          }}
                          renderEditor={() => (
                            <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                              <select
                                value={taxMemberDraftValue ? 'Yes' : 'No'}
                                onChange={e => setTaxMemberDraftValue(e.target.value === 'Yes')}
                                className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setEditingTaxMemberField(null);
                                  }
                                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
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
                                className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTaxMemberField(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        />

                        {/* 3. Immigration Status */}
                        <HorizontalFieldRow
                          label="Immigration Status"
                          value={member.immigration_status}
                          isEditing={editingTaxMemberField === `m_${memberNumber}_immigrationStatus`}
                          onStartEdit={() => {
                            setEditingTaxMemberField(`m_${memberNumber}_immigrationStatus`);
                            setTaxMemberDraftValue(member.immigration_status || '');
                            setTaxMemberFieldError(null);
                          }}
                          renderEditor={() => (
                            <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                              <select
                                value={taxMemberDraftValue}
                                onChange={e => setTaxMemberDraftValue(e.target.value)}
                                className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0 cursor-pointer"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setEditingTaxMemberField(null);
                                  }
                                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
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
                                className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0"
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTaxMemberField(null)}
                                className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        />

                        {/* CONDITIONAL IMMIGRATION FIELDS: Work Permit */}
                        {member.immigration_status === 'Work Permit' && (
                          <>
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
                            <HorizontalFieldRow
                              label="Category"
                              value={member.immigration_category}
                              isEditing={editingTaxMemberField === `m_${memberNumber}_immigrationCategory`}
                              onStartEdit={() => {
                                setEditingTaxMemberField(`m_${memberNumber}_immigrationCategory`);
                                setTaxMemberDraftValue(member.immigration_category || '');
                                setTaxMemberFieldError(null);
                              }}
                              renderEditor={() => (
                                <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                                  <input
                                    type="text"
                                    value={taxMemberDraftValue}
                                    onChange={e => setTaxMemberDraftValue(e.target.value)}
                                    placeholder="e.g. C09"
                                    className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                                    autoFocus
                                    onKeyDown={e => {
                                      if (e.key === 'Escape') {
                                        e.preventDefault();
                                        setEditingTaxMemberField(null);
                                      }
                                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                        e.preventDefault();
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
                                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0"
                                    title="Save"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTaxMemberField(null)}
                                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                                    title="Cancel"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                            />
                            <HorizontalFieldRow
                              label="Expiration Date"
                              value={member.immigration_expiration_date ? formatDateForDisplay(member.immigration_expiration_date) : ''}
                              isEditing={editingTaxMemberField === `m_${memberNumber}_immigrationExpDate`}
                              onStartEdit={() => {
                                setEditingTaxMemberField(`m_${memberNumber}_immigrationExpDate`);
                                setTaxMemberDraftValue(member.immigration_expiration_date ? formatDateForDisplay(member.immigration_expiration_date) : '');
                                setTaxMemberFieldError(null);
                              }}
                              renderEditor={() => (
                                <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                                  <input
                                    type="text"
                                    value={taxMemberDraftValue}
                                    onChange={e => setTaxMemberDraftValue(formatAsDateInput(e.target.value))}
                                    placeholder="MM/DD/YYYY"
                                    className="h-[34px] w-full flex-1 min-w-0 bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans"
                                    autoFocus
                                    onKeyDown={async e => {
                                      if (e.key === 'Escape') {
                                        e.preventDefault();
                                        setEditingTaxMemberField(null);
                                      }
                                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                        e.preventDefault();
                                        const parsedIso = parseDisplayDate(taxMemberDraftValue);
                                        if (taxMemberDraftValue && !parsedIso) {
                                          setTaxMemberFieldError('Invalid date (MM/DD/YYYY)');
                                          return;
                                        }
                                        await updateMember({ immigration_expiration_date: parsedIso });
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const parsedIso = parseDisplayDate(taxMemberDraftValue);
                                      if (taxMemberDraftValue && !parsedIso) {
                                        setTaxMemberFieldError('Invalid date (MM/DD/YYYY)');
                                        return;
                                      }
                                      await updateMember({ immigration_expiration_date: parsedIso });
                                    }}
                                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0"
                                    title="Save"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTaxMemberField(null)}
                                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                                    title="Cancel"
                                  >
                                    ✕
                                  </button>
                                  {taxMemberFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{taxMemberFieldError}</span>}
                                </div>
                              )}
                            />
                          </>
                        )}

                        {/* CONDITIONAL IMMIGRATION FIELDS: Resident & Permanent Resident */}
                        {(member.immigration_status === 'Resident' || member.immigration_status === 'Permanent Resident') && (
                          <>
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
                            <HorizontalFieldRow
                              label="Expiration Date"
                              value={member.immigration_expiration_date ? formatDateForDisplay(member.immigration_expiration_date) : ''}
                              isEditing={editingTaxMemberField === `m_${memberNumber}_immigrationExpDate`}
                              onStartEdit={() => {
                                setEditingTaxMemberField(`m_${memberNumber}_immigrationExpDate`);
                                setTaxMemberDraftValue(member.immigration_expiration_date ? formatDateForDisplay(member.immigration_expiration_date) : '');
                                setTaxMemberFieldError(null);
                              }}
                              renderEditor={() => (
                                <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                                  <input
                                    type="text"
                                    value={taxMemberDraftValue}
                                    onChange={e => setTaxMemberDraftValue(formatAsDateInput(e.target.value))}
                                    placeholder="MM/DD/YYYY"
                                    className="h-[34px] w-full flex-1 min-w-0 bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans"
                                    autoFocus
                                    onKeyDown={async e => {
                                      if (e.key === 'Escape') {
                                        e.preventDefault();
                                        setEditingTaxMemberField(null);
                                      }
                                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                        e.preventDefault();
                                        const parsedIso = parseDisplayDate(taxMemberDraftValue);
                                        if (taxMemberDraftValue && !parsedIso) {
                                          setTaxMemberFieldError('Invalid date (MM/DD/YYYY)');
                                          return;
                                        }
                                        await updateMember({ immigration_expiration_date: parsedIso });
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const parsedIso = parseDisplayDate(taxMemberDraftValue);
                                      if (taxMemberDraftValue && !parsedIso) {
                                        setTaxMemberFieldError('Invalid date (MM/DD/YYYY)');
                                        return;
                                      }
                                      await updateMember({ immigration_expiration_date: parsedIso });
                                    }}
                                    className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0"
                                    title="Save"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTaxMemberField(null)}
                                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                                    title="Cancel"
                                  >
                                    ✕
                                  </button>
                                  {taxMemberFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{taxMemberFieldError}</span>}
                                </div>
                              )}
                            />
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
      <div className="font-sans">
        <div className="mb-5">
          <h4 className="text-[16px] font-semibold text-[#111827]">
            Residence Information
          </h4>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Primary applicant residence address (Click value to edit)
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1 text-sm font-sans">
          {/* 1. Street Address */}
          <HorizontalFieldRow
            label="Street Address"
            value={clientResidence?.address}
            isEditing={editingResidenceField === 'address'}
            onStartEdit={() => {
              setEditingResidenceField('address');
              setResidenceDraftValue(clientResidence?.address || '');
              setResidenceFieldError(null);
            }}
            renderEditor={() => (
              <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                <input
                  type="text"
                  value={residenceDraftValue}
                  onChange={e => setResidenceDraftValue(e.target.value)}
                  placeholder="Street address..."
                  className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingResidenceField(null);
                    }
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleInlineSaveResidenceField('address', residenceDraftValue);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={residenceFieldSaving}
                  onClick={() => handleInlineSaveResidenceField('address', residenceDraftValue)}
                  className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                  title="Save"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setEditingResidenceField(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                  title="Cancel"
                >
                  ✕
                </button>
                {residenceFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{residenceFieldError}</span>}
              </div>
            )}
          />

          {/* 2. City */}
          <HorizontalFieldRow
            label="City"
            value={clientResidence?.city}
            isEditing={editingResidenceField === 'city'}
            onStartEdit={() => {
              setEditingResidenceField('city');
              setResidenceDraftValue(clientResidence?.city || '');
              setResidenceFieldError(null);
            }}
            renderEditor={() => (
              <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                <input
                  type="text"
                  value={residenceDraftValue}
                  onChange={e => setResidenceDraftValue(e.target.value)}
                  placeholder="City..."
                  className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingResidenceField(null);
                    }
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleInlineSaveResidenceField('city', residenceDraftValue);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={residenceFieldSaving}
                  onClick={() => handleInlineSaveResidenceField('city', residenceDraftValue)}
                  className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                  title="Save"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setEditingResidenceField(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                  title="Cancel"
                >
                  ✕
                </button>
                {residenceFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{residenceFieldError}</span>}
              </div>
            )}
          />

          {/* 3. State */}
          <HorizontalFieldRow
            label="State"
            value={clientResidence?.state}
            isEditing={editingResidenceField === 'state'}
            onStartEdit={() => {
              setEditingResidenceField('state');
              setResidenceDraftValue(clientResidence?.state || '');
              setResidenceFieldError(null);
            }}
            renderEditor={() => (
              <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                <input
                  type="text"
                  value={residenceDraftValue}
                  onChange={e => setResidenceDraftValue(e.target.value)}
                  placeholder="State (e.g. FL)..."
                  className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingResidenceField(null);
                    }
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleInlineSaveResidenceField('state', residenceDraftValue);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={residenceFieldSaving}
                  onClick={() => handleInlineSaveResidenceField('state', residenceDraftValue)}
                  className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                  title="Save"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setEditingResidenceField(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                  title="Cancel"
                >
                  ✕
                </button>
                {residenceFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{residenceFieldError}</span>}
              </div>
            )}
          />

          {/* 4. Zip Code */}
          <HorizontalFieldRow
            label="Zip Code"
            value={clientResidence?.zipCode}
            isEditing={editingResidenceField === 'zip_code'}
            onStartEdit={() => {
              setEditingResidenceField('zip_code');
              setResidenceDraftValue(clientResidence?.zipCode || '');
              setResidenceFieldError(null);
            }}
            renderEditor={() => (
              <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                <input
                  type="text"
                  value={residenceDraftValue}
                  onChange={e => setResidenceDraftValue(e.target.value)}
                  placeholder="Zip code..."
                  className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingResidenceField(null);
                    }
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleInlineSaveResidenceField('zip_code', residenceDraftValue);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={residenceFieldSaving}
                  onClick={() => handleInlineSaveResidenceField('zip_code', residenceDraftValue)}
                  className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                  title="Save"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setEditingResidenceField(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                  title="Cancel"
                >
                  ✕
                </button>
                {residenceFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{residenceFieldError}</span>}
              </div>
            )}
          />

          {/* 5. County */}
          <HorizontalFieldRow
            label="County"
            value={clientResidence?.county}
            isEditing={editingResidenceField === 'county'}
            onStartEdit={() => {
              setEditingResidenceField('county');
              setResidenceDraftValue(clientResidence?.county || '');
              setResidenceFieldError(null);
            }}
            renderEditor={() => (
              <div className="flex items-center gap-2 flex-nowrap min-w-0 w-full">
                <input
                  type="text"
                  value={residenceDraftValue}
                  onChange={e => setResidenceDraftValue(e.target.value)}
                  placeholder="County..."
                  className="h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] leading-[20px] text-[#253247] font-normal outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors font-sans w-full flex-1 min-w-0"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingResidenceField(null);
                    }
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleInlineSaveResidenceField('county', residenceDraftValue);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={residenceFieldSaving}
                  onClick={() => handleInlineSaveResidenceField('county', residenceDraftValue)}
                  className="text-emerald-600 hover:text-emerald-800 p-0.5 text-xs font-bold shrink-0 disabled:opacity-50"
                  title="Save"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setEditingResidenceField(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 text-xs font-bold shrink-0"
                  title="Cancel"
                >
                  ✕
                </button>
                {residenceFieldError && <span className="text-rose-500 text-xs pl-1 shrink-0">{residenceFieldError}</span>}
              </div>
            )}
          />
        </div>
      </div>

      {/* SECTION 6 — Income Information */}
      <ClientIncomeInformationSection clientId={clientId} />
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
