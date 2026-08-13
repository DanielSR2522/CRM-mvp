'use client';

import React, { useState, useEffect, use, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import ClientConsentsTab from '@/components/consents/ClientConsentsTab';
import CollapsibleSidebar from '@/components/common/CollapsibleSidebar';
import HealthClientHeader from '@/components/health/HealthClientHeader';
import HealthPolicyTab from '@/components/health/HealthPolicyTab';
import MedicareTab from '@/components/medicare/MedicareTab';
import SupplementalTab from '@/components/supplemental/SupplementalTab';
import LifePolicyTab from '@/components/life/LifePolicyTab';
import UnifiedNotesManager from '@/components/notes/UnifiedNotesManager';
import { getAssignedAgentDisplay } from '@/lib/auth/agentDisplay';
import { supabase } from '@/lib/supabaseClient';
import { formatIsoToUsDate, usDateToIso, formatAsDateInput } from '@/utils/dateUtils';
import { resolvePolicyAddress } from '@/utils/addressUtils';
import { formatDateMMDDYYYY, formatDateTimeMMDDYYYY, isoDateToMMDDYYYY } from '@/lib/formatters/date';
import FileDropzone from '@/components/ui/FileDropzone';
import DatePicker from '@/components/ui/DatePicker';
import {
  InlineEditableText,
  InlineEditablePhone,
  InlineEditableSSN,
  InlineEditableDate,
  InlineEditableSelect,
  InlineEditableTextarea,
  InlineEditableAddress,
} from '@/components/common/inline-edit';
import SSNInput from '@/components/common/SSNInput';
import PhoneInput from '@/components/common/PhoneInput';
import { formatSSN } from '@/lib/formatters/ssn';
import { formatUSPhone } from '@/lib/formatters/phone';
import { formatEIN } from '@/lib/formatters/ein';
import { useBusinessLines } from '@/contexts/BusinessLinesContext';
import { deleteClientSecure, getClientDeletionSummaryAction, type ClientDeletionSummary } from '@/app/actions/deleteClientAction';
import { DocumentPreviewModal } from '@/components/documents/DocumentPreviewModal';

declare global {
  interface Window {
    google: any;
  }
}

interface AgentProfile {
  name: string | null;
  email: string | null;
}

interface Client {
  id: string;
  agent_id: string;
  full_name: string;
  client_type?: string | null;
  ein?: string | null;
  agency_name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  agent?: AgentProfile | null;
}

export interface UnifiedClientDocument {
  id: string;
  source: 'general' | 'property_casualty' | 'life' | 'health';
  sourceLabel: string;
  clientId: string;
  policyId?: string;
  displayName: string;
  originalFilename: string;
  storagePath: string;
  createdAt: string;
  documentType?: string;
  sizeBytes?: number;
  mimeType?: string;
  bucket: 'policy-documents' | 'life-documents' | 'health-policy-documents';
  canDelete: boolean;
}

interface Policy {
  id: string;
  client_id: string;
  policy_type: string;
  policy_subtype: string | null;
  policy_number: string | null;
  company_name: string | null;
  premium: number;
  effective_date: string | null;
  expiration_date: string | null;
  transaction_type: 'New' | 'Renewal' | 'Endorsement' | '';
  business_type: 'Personal' | 'Commercial' | '';
  status: 'Active' | 'Cancelled' | 'Expired' | 'Pending' | '';
  created_at: string;
  updated_at: string;
  broker_name?: string | null;
  writing_company?: string | null;
  total_premium?: number;
  annual_premium?: number;
  policy_payment_frequency?: string | null;
  billing_type?: string | null;
  policy_ownership_type?: 'personal' | 'company' | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  linkedPersonalClient?: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    role: 'main_applicant' | 'co_applicant';
  } | null;
}

interface ClientPersonalInformation {
  full_name: string;
  date_of_birth: string;
  ssn: string;
  email: string;
  phone: string;
  secondary_phone: string;
  secondary_email: string;
  has_co_applicant: boolean;
  gender: 'Female' | 'Male' | '';
  marital_status: 'Single' | 'Married' | 'Divorced' | 'Widowed' | 'Separated' | '';
  language_preference?: string;
  occupation?: string;
  born_in_usa: boolean | null;
  immigration_status: 'Resident' | 'Permanent Resident' | 'Work Permit' | 'US Citizen' | 'Citizen' | 'Other' | '';
  alien_number: string;
  card_number: string;
  uscis_number: string;
  immigration_category: string;
  immigration_expiration_date: string;
  immigration_other_description: string;
}

interface CoApplicantInformation {
  full_name: string;
  date_of_birth: string;
  ssn: string;
  primary_phone: string;
  secondary_phone: string;
  primary_email: string;
  secondary_email: string;
  gender: 'Female' | 'Male' | '';
  marital_status: 'Single' | 'Married' | 'Divorced' | 'Widowed' | 'Separated' | '';
  language_preference?: string;
  occupation?: string;
  immigration_status: 'Resident' | 'Permanent Resident' | 'Work Permit' | 'US Citizen' | 'Citizen' | 'Other' | '';
  alien_number: string;
  card_number: string;
  uscis_number: string;
  immigration_category: string;
  immigration_expiration_date: string;
  immigration_other_description: string;
}

interface ClientResidenceInformation {
  address: string;
  city: string;
  state: string;
  zip_code: string;
  county: string;
}

interface ClientIncomeInformation {
  id: string;
  client_id: string;
  relationship_to_applicant: 'Applicant' | 'Spouse' | 'Son/Daughter' | 'Mother' | 'Father' | 'Other' | '';
  income_type: 'W2' | '1099' | '';
  employer_name: string;
  employer_phone: string;
  income: number;
}

export default function ClientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex justify-center items-center py-20">
          <div className="h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
        </div>
      </DashboardLayout>
    }>
      <ClientProfileContent params={params} />
    </Suspense>
  );
}

function ClientProfileContent({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { id: clientId } = use(params);
  const { isLineEnabled, loading: businessLinesLoading } = useBusinessLines();

  const isValidUuid = (uuid: string) => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
  };

  // Section mapping & URL-driven tab state
  const rawSection = searchParams.get('section') || searchParams.get('tab');
  const validSections = ['overview', 'personal-information', 'personal-info', 'policies', 'documents', 'notes', 'consents', 'timeline', 'health', 'life', 'medicare', 'supplemental'];
  const normalizedSection = validSections.includes(rawSection || '')
    ? (rawSection === 'personal-info' ? 'personal-information' : rawSection!)
    : 'overview';

  const activeTab = (normalizedSection === 'personal-information' ? 'personal-info' : normalizedSection) as 'overview' | 'personal-info' | 'policies' | 'documents' | 'notes' | 'consents' | 'timeline' | 'health' | 'life' | 'medicare' | 'supplemental';

  const isModuleWorkspace = activeTab === 'health' || activeTab === 'medicare' || activeTab === 'supplemental' || activeTab === 'life';
  const isCoreWorkspace = activeTab === 'overview' || activeTab === 'personal-info' || activeTab === 'documents' || activeTab === 'notes' || activeTab === 'timeline' || activeTab === 'policies';
  const isModernClientWorkspace = isModuleWorkspace || isCoreWorkspace;
  const isOperationalWorkspace = isModuleWorkspace;



  const handleTabChange = useCallback((tab: string) => {
    console.log('[ClientTabNav] Clicked tab key:', tab);
    const targetSection = tab === 'personal-info' ? 'personal-information' : tab;
    const currentSectionInUrl = searchParams.get('section') || searchParams.get('tab');
    if (currentSectionInUrl !== targetSection) {
      const paramsObj = new URLSearchParams(searchParams.toString());
      paramsObj.set('section', targetSection);
      if (paramsObj.has('tab')) paramsObj.set('tab', targetSection);
      router.push(`/clients/${clientId}?${paramsObj.toString()}`);
    }
  }, [clientId, router, searchParams]);

  // Fallback to Overview if current activeTab is disabled by agent's Business Lines configuration
  useEffect(() => {
    if (!businessLinesLoading) {
      if (activeTab === 'health' && !isLineEnabled('health')) handleTabChange('overview');
      else if (activeTab === 'medicare' && !isLineEnabled('medicare')) handleTabChange('overview');
      else if (activeTab === 'life' && !isLineEnabled('life')) handleTabChange('overview');
      else if (activeTab === 'policies' && !isLineEnabled('property_casualty')) handleTabChange('overview');
      else if (activeTab === 'supplemental' && !isLineEnabled('supplemental')) handleTabChange('overview');
    }
  }, [activeTab, businessLinesLoading, isLineEnabled, handleTabChange]);

  // Client Sidebar Collapse Preference
  const [isClientSidebarCollapsed, setIsClientSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('smartrack:client-sidebar-collapsed') === 'true';
      } catch {
        return false;
      }
    }
    return false;
  });

  const [notesSummaryList, setNotesSummaryList] = useState<any[]>([]);

  const loadNotesSummary = useCallback(async () => {
    if (!clientId) return;
    try {
      const { data } = await supabase.from('client_notes').select('id, category').eq('client_id', clientId);
      setNotesSummaryList(data || []);
    } catch (err) {
      console.error('Failed to load notes summary:', err);
    }
  }, [clientId]);

  useEffect(() => {
    if (activeTab === 'notes') {
      loadNotesSummary();
    }
  }, [activeTab, loadNotesSummary]);

  const toggleClientSidebar = useCallback(() => {
    setIsClientSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('smartrack:client-sidebar-collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  // Policies Search and Filters States
  const [policiesSearch, setPoliciesSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lobFilter, setLobFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

  // Master Client & Policies
  const [client, setClient] = useState<Client | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [lifePolicies, setLifePolicies] = useState<any[]>([]);
  const [healthPoliciesOverview, setHealthPoliciesOverview] = useState<any[]>([]);
  const [supplementalPolicies, setSupplementalPolicies] = useState<any[]>([]);
  const [loadingClient, setLoadingClient] = useState(true);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('Agent');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [agentProfile, setAgentProfile] = useState<AgentProfile | null>(null);

  // Linked Company Policies & Relationship state
  const [linkedCompanyPolicies, setLinkedCompanyPolicies] = useState<any[]>([]);
  const [linkedCompanyProfiles, setLinkedCompanyProfiles] = useState<any[]>([]);
  const [linkedPersonalContact, setLinkedPersonalContact] = useState<any | null>(null);

  // Company Search & Link States (Personal Profile Left Sidebar)
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [companySearchResults, setCompanySearchResults] = useState<any[]>([]);
  const [searchingCompanies, setSearchingCompanies] = useState(false);
  const [companySearchError, setCompanySearchError] = useState<string | null>(null);
  const [linkingCompanyId, setLinkingCompanyId] = useState<string | null>(null);
  const [linkSuccessMsg, setLinkSuccessMsg] = useState<string | null>(null);

  // Company Search Handler for Left Sidebar
  const handleCompanySearchChange = useCallback(async (query: string) => {
    setCompanySearchQuery(query);
    setCompanySearchError(null);
    setLinkSuccessMsg(null);

    const q = query.trim();
    if (!q) {
      setCompanySearchResults([]);
      setSearchingCompanies(false);
      return;
    }

    try {
      setSearchingCompanies(true);

      // Query Company Clients
      const { data: compClients, error: compErr } = await supabase
        .from('clients')
        .select('id, full_name, agency_name, email, phone, ein, client_type')
        .eq('client_type', 'company')
        .or(`full_name.ilike.%${q}%,agency_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,ein.ilike.%${q}%`)
        .limit(10);

      if (compErr) throw compErr;

      const foundCompanies = compClients || [];
      if (foundCompanies.length === 0) {
        setCompanySearchResults([]);
        return;
      }

      const compIds = foundCompanies.map(c => c.id);

      // Fetch existing relationships for these companies
      const { data: relsData } = await supabase
        .from('client_company_relationships')
        .select('id, company_client_id, personal_client_id')
        .in('company_client_id', compIds);

      const relsMap: { [companyId: string]: string } = {};
      (relsData || []).forEach((r: any) => {
        relsMap[r.company_client_id] = r.personal_client_id;
      });

      const formattedResults = foundCompanies.map(comp => {
        const linkedPersonalId = relsMap[comp.id];
        let linkStatus: 'current' | 'other' | 'available' = 'available';
        if (linkedPersonalId) {
          linkStatus = linkedPersonalId === clientId ? 'current' : 'other';
        }
        return {
          ...comp,
          linkStatus
        };
      });

      setCompanySearchResults(formattedResults);
    } catch (err: any) {
      console.error('Error searching company clients:', err);
      setCompanySearchError(err?.message || 'Failed to search companies.');
      setCompanySearchResults([]);
    } finally {
      setSearchingCompanies(false);
    }
  }, [clientId]);

  // Link Company Handler
  const handleLinkCompany = async (company: any) => {
    if (!isValidUuid(clientId) || !company?.id) return;
    try {
      setLinkingCompanyId(company.id);
      setCompanySearchError(null);
      setLinkSuccessMsg(null);

      // 1. Double check existing link to prevent duplicates or race condition
      const { data: existingRel } = await supabase
        .from('client_company_relationships')
        .select('id, personal_client_id')
        .eq('company_client_id', company.id)
        .maybeSingle();

      if (existingRel) {
        if (existingRel.personal_client_id === clientId) {
          setCompanySearchError('This company is already linked to this profile.');
        } else {
          setCompanySearchError('This company is already linked to another personal client.');
        }
        return;
      }

      // 2. Insert relationship
      const { error: insertErr } = await supabase
        .from('client_company_relationships')
        .insert({
          company_client_id: company.id,
          personal_client_id: clientId,
          created_at: new Date().toISOString(),
        });

      if (insertErr) throw insertErr;

      // 3. Clear search and refresh sidebar & overview
      setCompanySearchQuery('');
      setCompanySearchResults([]);
      setLinkSuccessMsg(`Linked ${company.agency_name || company.full_name} successfully!`);
      setTimeout(() => setLinkSuccessMsg(null), 3000);

      await fetchLinkedCompanyPolicies();
    } catch (err: any) {
      console.error('Error linking company:', err);
      setCompanySearchError(err?.message || 'Failed to link company.');
    } finally {
      setLinkingCompanyId(null);
    }
  };
  const [loadingLinkedPolicies, setLoadingLinkedPolicies] = useState(false);

  // Sub-modules Loading states
  const [loadingPersonal, setLoadingPersonal] = useState(true);
  const [loadingResidence, setLoadingResidence] = useState(true);
  const [loadingIncome, setLoadingIncome] = useState(true);

  // Activity Timeline Interface
  interface NormalizedTimelineEvent {
    id: string;
    client_id: string;
    policy_id?: string | null;
    module: 'property_casualty' | 'health' | 'life' | 'consent' | 'client';
    category: 'policies' | 'notes' | 'documents' | 'consents';
    event_type: string;
    title: string;
    description: string | null;
    actor_name: string;
    created_at: string;
    related_label: string;
    target_tab: 'policies' | 'health' | 'life' | 'consents' | 'notes' | 'documents' | 'personal-info';
    target_policy_id?: string | null;
    dedup_key?: string;
  }

  // Timeline & Counter States
  const [events, setEvents] = useState<NormalizedTimelineEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'policies' | 'notes' | 'documents' | 'consents'>('all');
  const [noteCounts, setNoteCounts] = useState<{ [policyId: string]: number }>({});

  const [docCounts, setDocCounts] = useState<{ [policyId: string]: number }>({});
  // Client Documents & Notes States
  const [clientDocDisplayName, setClientDocDisplayName] = useState('');
  const [clientDocType, setClientDocType] = useState('Identification');
  const [clientDocDescription, setClientDocDescription] = useState('');
  const [clientDocFile, setClientDocFile] = useState<File | null>(null);
  const [clientDocUploading, setClientDocUploading] = useState(false);
  const [clientDocError, setClientDocError] = useState<string | null>(null);
  const [clientDocsList, setClientDocsList] = useState<UnifiedClientDocument[]>([]);
  const [clientDocsLoading, setClientDocsLoading] = useState(false);
  const [isClientDocModalOpen, setIsClientDocModalOpen] = useState(false);
  const [docFilterCategory, setDocFilterCategory] = useState<'all' | 'general' | 'property_casualty' | 'life' | 'health'>('all');

  const [clientNoteBody, setClientNoteBody] = useState('');
  const [clientNoteFiles, setClientNoteFiles] = useState<File[]>([]);
  const [clientNotePasted, setClientNotePasted] = useState<{ id: string; file: File; previewUrl: string }[]>([]);
  const [clientNotePosting, setClientNotePosting] = useState(false);
  const [clientNotesList, setClientNotesList] = useState<any[]>([]);
  const [clientNotesLoading, setClientNotesLoading] = useState(false);

  const [replyingNoteId, setReplyingNoteId] = useState<string | null>(null);
  const [clientReplyBody, setClientReplyBody] = useState('');
  const [clientReplyFiles, setClientReplyFiles] = useState<File[]>([]);

  const loadClientDocuments = useCallback(async () => {
    try {
      setClientDocsLoading(true);
      const unifiedDocs: UnifiedClientDocument[] = [];

      // 1. General client_documents
      const generalPromise = supabase
        .from('client_documents')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      // 2. P&C policy_documents
      const pcPromise = supabase
        .from('policies')
        .select('id, policy_number, policy_type, policy_documents(*)')
        .eq('client_id', clientId);

      // 3. Life life_policy_documents
      const lifePromise = supabase
        .from('life_policies')
        .select('id, policy_number, life_policy_documents(*)')
        .eq('client_id', clientId);

      // 4. Health health_policy_documents
      const healthPromise = supabase
        .from('health_policies')
        .select('id, plan_name, health_policy_documents(*)')
        .eq('client_id', clientId);

      const [genRes, pcRes, lifeRes, healthRes] = await Promise.allSettled([
        generalPromise,
        pcPromise,
        lifePromise,
        healthPromise
      ]);

      // Process General & Module client_documents
      if (genRes.status === 'fulfilled' && genRes.value.data) {
        genRes.value.data.forEach((d: any) => {
          const modType = (d.module_type || 'general').toLowerCase();
          const sourceLabelMap: Record<string, string> = {
            supplemental: 'Supplemental',
            medicare: 'Medicare',
            health: 'Health',
            life: 'Life',
            property_casualty: 'Property & Casualty',
            general: 'General',
          };
          const resolvedLabel = sourceLabelMap[modType] || 'General';

          unifiedDocs.push({
            id: d.id,
            source: modType as any,
            sourceLabel: resolvedLabel,
            clientId: d.client_id,
            policyId: d.policy_id || undefined,
            displayName: d.display_name || d.original_filename,
            originalFilename: d.original_filename,
            storagePath: d.storage_path,
            createdAt: d.created_at,
            documentType: d.document_type || `${resolvedLabel} Document`,
            sizeBytes: d.size_bytes,
            mimeType: d.mime_type,
            bucket: d.bucket || 'client-documents',
            canDelete: true,
          });
        });
      } else if (genRes.status === 'rejected') {
        console.error('General client documents load error:', genRes.reason);
      }

      // Process P&C
      if (pcRes.status === 'fulfilled' && pcRes.value.data) {
        pcRes.value.data.forEach((p: any) => {
          (p.policy_documents || []).forEach((d: any) => {
            unifiedDocs.push({
              id: d.id,
              source: 'property_casualty',
              sourceLabel: `P&C (${p.policy_type || p.policy_number || 'Policy'})`,
              clientId,
              policyId: p.id,
              displayName: d.display_name || d.original_filename,
              originalFilename: d.original_filename,
              storagePath: d.storage_path,
              createdAt: d.created_at,
              documentType: 'Policy Document',
              sizeBytes: d.size_bytes,
              mimeType: d.mime_type,
              bucket: 'policy-documents',
              canDelete: true,
            });
          });
        });
      } else if (pcRes.status === 'rejected') {
        console.error('P&C policy documents load error:', pcRes.reason);
      }

      // Process Life
      if (lifeRes.status === 'fulfilled' && lifeRes.value.data) {
        lifeRes.value.data.forEach((lp: any) => {
          (lp.life_policy_documents || []).forEach((d: any) => {
            unifiedDocs.push({
              id: d.id,
              source: 'life',
              sourceLabel: `Life (${lp.policy_number || 'Policy'})`,
              clientId,
              policyId: lp.id,
              displayName: d.file_name,
              originalFilename: d.file_name,
              storagePath: d.storage_path,
              createdAt: d.created_at,
              documentType: 'Life Document',
              sizeBytes: d.file_size || undefined,
              mimeType: d.file_type || undefined,
              bucket: 'life-documents',
              canDelete: true,
            });
          });
        });
      } else if (lifeRes.status === 'rejected') {
        console.error('Life policy documents load error:', lifeRes.reason);
      }

      // Process Health
      if (healthRes.status === 'fulfilled' && healthRes.value.data) {
        healthRes.value.data.forEach((hp: any) => {
          (hp.health_policy_documents || []).forEach((d: any) => {
            unifiedDocs.push({
              id: d.id,
              source: 'health',
              sourceLabel: `Health (${hp.plan_name || 'Policy'})`,
              clientId,
              policyId: hp.id,
              displayName: d.file_name || d.original_filename || 'Health Document',
              originalFilename: d.original_filename || d.file_name,
              storagePath: d.storage_path,
              createdAt: d.created_at,
              documentType: 'Health Document',
              sizeBytes: d.file_size_bytes || undefined,
              mimeType: d.mime_type || undefined,
              bucket: 'health-policy-documents',
              canDelete: true,
            });
          });
        });
      } else if (healthRes.status === 'rejected') {
        console.error('Health policy documents load error:', healthRes.reason);
      }

      unifiedDocs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setClientDocsList(unifiedDocs);
    } catch (err: any) {
      console.error('Unified client documents aggregation error:', err);
      setClientDocsList([]);
    } finally {
      setClientDocsLoading(false);
    }
  }, [clientId]);

  // Unified Document Preview State
  const [unifiedPreviewState, setUnifiedPreviewState] = useState<{
    isOpen: boolean;
    fileName: string;
    mimeType?: string | null;
    signedUrl?: string | null;
    officePreview?: any | null;
    loading: boolean;
    error?: string | null;
    bucket?: string;
    storagePath?: string;
  }>({
    isOpen: false,
    fileName: '',
    mimeType: null,
    signedUrl: null,
    officePreview: null,
    loading: false,
    error: null,
  });

  const handlePreviewUnifiedDoc = async (doc: UnifiedClientDocument) => {
    const fileNameVal = doc.displayName || doc.originalFilename;
    const ext = (fileNameVal.split('.').pop() || '').toLowerCase();
    const isOffice = ['docx', 'xlsx', 'xls', 'pptx'].includes(ext);

    setUnifiedPreviewState({
      isOpen: true,
      fileName: fileNameVal,
      mimeType: doc.mimeType || null,
      signedUrl: null,
      officePreview: null,
      loading: true,
      error: null,
      bucket: doc.bucket,
      storagePath: doc.storagePath,
    });

    if (isOffice) {
      try {
        const res = await fetch('/api/documents/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: doc.source, docId: doc.id }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to generate document preview.');
        }

        const officeData = await res.json();
        setUnifiedPreviewState((prev) => ({
          ...prev,
          loading: false,
          officePreview: officeData,
        }));
      } catch (err: any) {
        setUnifiedPreviewState((prev) => ({
          ...prev,
          loading: false,
          error: err.message || 'Unable to preview this document.',
        }));
      }
    } else {
      try {
        const { data, error } = await supabase.storage.from(doc.bucket).createSignedUrl(doc.storagePath, 3600);
        if (error || !data?.signedUrl) {
          throw new Error(error?.message || 'Failed to generate preview URL.');
        }
        setUnifiedPreviewState((prev) => ({
          ...prev,
          loading: false,
          signedUrl: data.signedUrl,
        }));
      } catch (err: any) {
        setUnifiedPreviewState((prev) => ({
          ...prev,
          loading: false,
          error: err.message || 'Unable to preview this document.',
        }));
      }
    }
  };

  const handleDownloadFromPreview = async () => {
    if (!unifiedPreviewState.bucket || !unifiedPreviewState.storagePath) return;
    try {
      const { data } = await supabase.storage.from(unifiedPreviewState.bucket).createSignedUrl(unifiedPreviewState.storagePath, 3600);
      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    } catch (err: any) {
      alert(`Failed to download document: ${err.message || err}`);
    }
  };

  const loadClientNotes = useCallback(async () => {
    try {
      setClientNotesLoading(true);
      const { data } = await supabase.from('client_notes').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
      setClientNotesList(data || []);
    } catch {
      setClientNotesList([]);
    } finally {
      setClientNotesLoading(false);
    }
  }, [clientId]);

  // Payment Information States (PERSONAL CLIENTS ONLY)
  const [paymentInfoLoading, setPaymentInfoLoading] = useState(false);
  const [paymentInfoSaving, setPaymentInfoSaving] = useState(false);
  const [paymentInfoError, setPaymentInfoError] = useState<string | null>(null);
  const [paymentInfoSuccess, setPaymentInfoSuccess] = useState<string | null>(null);

  const [paymentAutoPay, setPaymentAutoPay] = useState(false);
  const [paymentDayVal, setPaymentDayVal] = useState<number | null>(null);
  const [paymentAddress, setPaymentAddress] = useState('');
  const [paymentHolderName, setPaymentHolderName] = useState('');

  const [hasBankAccount, setHasBankAccount] = useState(false);
  const [bankName, setBankName] = useState('');
  const [bankRoutingNumber, setBankRoutingNumber] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankLast4, setBankLast4] = useState('');
  const [isReplacingBank, setIsReplacingBank] = useState(false);

  const [hasCardMethod, setHasCardMethod] = useState(false);
  const [cardTypeVal, setCardTypeVal] = useState<'Debit' | 'Credit'>('Debit');
  const [cardNumberVal, setCardNumberVal] = useState('');
  const [cardExpMonth, setCardExpMonth] = useState('');
  const [cardExpYear, setCardExpYear] = useState('');
  const [cardLast4Val, setCardLast4Val] = useState('');
  const [cardCvvVal, setCardCvvVal] = useState(''); // TRANSIENT ONLY - NEVER PERSISTED
  const [isReplacingCard, setIsReplacingCard] = useState(false);

  const loadPaymentInfo = useCallback(async () => {
    try {
      setPaymentInfoLoading(true);
      const res = await fetch(`/api/clients/${clientId}/payment-info`);
      if (!res.ok) {
        if (res.status === 404 || res.status === 403) return;
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to load payment info');
      }
      const data = await res.json();
      setPaymentAutoPay(Boolean(data.auto_pay));
      setPaymentDayVal(data.payment_day ? Number(data.payment_day) : null);
      setPaymentAddress(data.associated_address || '');
      setPaymentHolderName(data.account_holder_name || '');

      setHasBankAccount(Boolean(data.has_bank_account));
      setBankName(data.bank_name || '');
      setBankLast4(data.bank_last4 || '');
      setIsReplacingBank(false);

      setHasCardMethod(Boolean(data.has_card));
      setCardTypeVal(data.card_type === 'Credit' ? 'Credit' : 'Debit');
      setCardLast4Val(data.card_last4 || '');
      setCardExpMonth(data.expiration_month || '');
      setCardExpYear(data.expiration_year || '');
      setCardCvvVal(''); // Ensure CVV is cleared
      setIsReplacingCard(false);
    } catch (err: any) {
      console.error('loadPaymentInfo error:', err);
    } finally {
      setPaymentInfoLoading(false);
    }
  }, [clientId]);

  const handleSavePaymentInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setPaymentInfoSaving(true);
      setPaymentInfoError(null);
      setPaymentInfoSuccess(null);

      if (hasBankAccount && !bankLast4 && (!bankName || !bankRoutingNumber || !bankAccountNumber)) {
        throw new Error('Bank Name, Routing Number, and Account Number are required when enabling a new Bank Account');
      }

      if (hasCardMethod && !cardLast4Val && (!cardNumberVal || !cardExpMonth || !cardExpYear)) {
        throw new Error('Card Type, Card Number, Expiration Month, and Expiration Year are required when enabling a new Card');
      }

      const payload: any = {
        auto_pay: paymentAutoPay,
        payment_day: paymentDayVal,
        associated_address: paymentAddress,
        account_holder_name: paymentHolderName,
        has_bank_account: hasBankAccount,
        bank_name: bankName,
        has_card: hasCardMethod,
        card_type: cardTypeVal,
        expiration_month: cardExpMonth,
        expiration_year: cardExpYear,
      };

      if (hasBankAccount && (isReplacingBank || !bankLast4)) {
        payload.routing_number = bankRoutingNumber;
        payload.account_number = bankAccountNumber;
      }

      if (hasCardMethod && (isReplacingCard || !cardLast4Val)) {
        payload.card_number = cardNumberVal;
      }

      const res = await fetch(`/api/clients/${clientId}/payment-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save payment information');
      }

      const saved = await res.json();
      setPaymentAutoPay(Boolean(saved.auto_pay));
      setPaymentDayVal(saved.payment_day ? Number(saved.payment_day) : null);
      setPaymentAddress(saved.associated_address || '');
      setPaymentHolderName(saved.account_holder_name || '');

      setHasBankAccount(Boolean(saved.has_bank_account));
      setBankName(saved.bank_name || '');
      setBankLast4(saved.bank_last4 || '');
      setBankRoutingNumber('');
      setBankAccountNumber('');
      setIsReplacingBank(false);

      setHasCardMethod(Boolean(saved.has_card));
      setCardTypeVal(saved.card_type === 'Credit' ? 'Credit' : 'Debit');
      setCardLast4Val(saved.card_last4 || '');
      setCardExpMonth(saved.expiration_month || '');
      setCardExpYear(saved.expiration_year || '');
      setCardNumberVal('');
      setCardCvvVal(''); // STRICT CVV RULE: Immediately discard transient CVV
      setIsReplacingCard(false);

      setPaymentInfoSuccess('Payment information saved successfully');
    } catch (err: any) {
      setPaymentInfoError(err.message || 'Failed to save payment info');
    } finally {
      setPaymentInfoSaving(false);
    }
  };

  // Accordion Section States (Zoho-style layout for Personal Info)
  const [isPersonalInfoOpen, setIsPersonalInfoOpen] = useState(true);
  const [isResidenceOpen, setIsResidenceOpen] = useState(false);
  const [isIncomeOpen, setIsIncomeOpen] = useState(false);
  const [isPaymentInfoOpen, setIsPaymentInfoOpen] = useState(false);

  useEffect(() => {
    if (activeTab === 'documents') loadClientDocuments();
    if (activeTab === 'notes') loadClientNotes();
    if (activeTab === 'personal-info') loadPaymentInfo();
  }, [activeTab, loadClientDocuments, loadClientNotes, loadPaymentInfo]);

  // Personal Information States
  const [personalInfo, setPersonalInfo] = useState<ClientPersonalInformation | null>(null);
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  // Deletion Summary State
  const [deletionSummary, setDeletionSummary] = useState<ClientDeletionSummary | null>(null);
  const [loadingDeletionSummary, setLoadingDeletionSummary] = useState<boolean>(false);
  const [isDeleteClientModalOpen, setIsDeleteClientModalOpen] = useState(false);
  const [deleteClientError, setDeleteClientError] = useState<string | null>(null);

  const [personalForm, setPersonalForm] = useState<ClientPersonalInformation>({
    full_name: '',
    date_of_birth: '',
    ssn: '',
    email: '',
    phone: '',
    secondary_phone: '',
    secondary_email: '',
    has_co_applicant: false,
    gender: '',
    marital_status: '',
    born_in_usa: null,
    immigration_status: '',
    alien_number: '',
    card_number: '',
    uscis_number: '',
    immigration_category: '',
    immigration_expiration_date: '',
    immigration_other_description: '',
  });
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);

  // Co-Applicant States
  const [coApplicantInfo, setCoApplicantInfo] = useState<CoApplicantInformation | null>(null);
  const [coApplicantForm, setCoApplicantForm] = useState<CoApplicantInformation>({
    full_name: '',
    date_of_birth: '',
    ssn: '',
    primary_phone: '',
    secondary_phone: '',
    primary_email: '',
    secondary_email: '',
    gender: '',
    marital_status: '',
    immigration_status: '',
    alien_number: '',
    card_number: '',
    uscis_number: '',
    immigration_category: '',
    immigration_expiration_date: '',
    immigration_other_description: '',
  });
  const [loadingCoApplicant, setLoadingCoApplicant] = useState(false);

  // Residence States
  const [residenceInfo, setResidenceInfo] = useState<ClientResidenceInformation | null>(null);
  const [isEditingResidence, setIsEditingResidence] = useState(false);
  const [residenceForm, setResidenceForm] = useState<ClientResidenceInformation>({
    address: '',
    city: '',
    state: '',
    zip_code: '',
    county: '',
  });
  const [savingResidence, setSavingResidence] = useState(false);
  const [residenceError, setResidenceError] = useState<string | null>(null);

  const isCompanyClient = Boolean(
    (client?.client_type === 'company') ||
    (policies && policies.some((p: any) => p.policy_ownership_type === 'company')) ||
    (!personalInfo?.date_of_birth && !personalInfo?.ssn && !personalInfo?.gender && !personalInfo?.marital_status && personalInfo?.full_name && personalInfo?.full_name !== client?.full_name)
  );

  // Build unified consolidated policy summary cards for Overview tab
  const consolidatedOverviewCards = (() => {
    const cards: Array<{
      id: string;
      businessLine: 'property_casualty' | 'health' | 'life';
      businessLineLabel: string;
      policy_type: string;
      company_name: string;
      policy_number: string;
      status: string;
      effective_date: string | null;
      expiration_date: string | null;
      premium: number;
      effectiveAddress: string;
      targetTab: 'policies' | 'health' | 'life' | 'supplemental';
      updated_at: string;
      isLinkedCommercial?: boolean;
      companyName?: string;
    }> = [];

    // 1. P&C policies (only active status)
    (policies || []).forEach((p: any) => {
      if (p.status === 'Active') {
        const effectiveAddress = resolvePolicyAddress(
          { address: p.address, city: p.city, state: p.state, zip_code: p.zip_code },
          residenceInfo,
          client
        );
        cards.push({
          id: p.id,
          businessLine: 'property_casualty',
          businessLineLabel: 'Property & Casualty',
          policy_type: p.policy_type || 'P&C Policy',
          company_name: p.writing_company || p.company_name || 'Carrier Unspecified',
          policy_number: p.policy_number || 'N/A',
          status: 'Active',
          effective_date: p.effective_date || null,
          expiration_date: p.expiration_date || null,
          premium: Number(p.total_premium || p.premium || 0),
          effectiveAddress,
          targetTab: 'policies',
          updated_at: p.updated_at || p.created_at || new Date().toISOString(),
        });
      }
    });

    // 2. Health policies (only if direct client owner)
    if (!client || client.agent_id === currentUserId) {
      (healthPoliciesOverview || []).forEach((h: any) => {
        if (h.active === true) {
          const effectiveAddress = resolvePolicyAddress(
            null,
            residenceInfo,
            client
          );
          cards.push({
            id: h.id,
            businessLine: 'health',
            businessLineLabel: 'Health',
            policy_type: h.plan_name || 'Health Plan',
            company_name: h.company_2026 || 'Marketplace Carrier',
            policy_number: h.plan_id || h.application_number || 'N/A',
            status: 'Active',
            effective_date: h.effective_date || null,
            expiration_date: null,
            premium: Number(h.plan_cost || 0),
            effectiveAddress,
            targetTab: 'health',
            updated_at: h.updated_at || h.created_at || new Date().toISOString(),
          });
        }
      });
    }

    // 3. Life policies (only if direct client owner)
    if (!client || client.agent_id === currentUserId) {
      (lifePolicies || []).forEach((l: any) => {
        const prods = l.life_policy_products || [];
        const qualifyingProd = prods.find(
          (prod: any) => prod.company && typeof prod.company === 'string' && prod.company.trim().length > 0
        );

        if (qualifyingProd) {
          const effectiveAddress = resolvePolicyAddress(
            null,
            residenceInfo,
            client
          );
          cards.push({
            id: l.id,
            businessLine: 'life',
            businessLineLabel: 'Life Insurance',
            policy_type: qualifyingProd.product_type || 'Life Policy',
            company_name: qualifyingProd.company.trim(),
            policy_number: qualifyingProd.policy_number || 'N/A',
            status: 'Active',
            effective_date: qualifyingProd.policy_date || null,
            expiration_date: null,
            premium: Number(qualifyingProd.monthly_premium || 0),
            effectiveAddress,
            targetTab: 'life',
            updated_at: l.updated_at || l.created_at || new Date().toISOString(),
          });
        }
      });
    }

    // 4. Linked Company Commercial P&C policies (surfaced automatically on Personal Client Overview)
    if (!isCompanyClient && linkedCompanyPolicies && linkedCompanyPolicies.length > 0) {
      linkedCompanyPolicies.forEach((p: any) => {
        const effectiveAddress = resolvePolicyAddress(
          { address: p.address, city: p.city, state: p.state, zip_code: p.zip_code },
          residenceInfo,
          client
        );
        const compProfile = (linkedCompanyProfiles || []).find((c: any) => c.id === p.client_id);
        const resolvedCompanyName = compProfile?.agency_name || compProfile?.full_name || p.client?.agency_name || p.client?.full_name || 'Linked Company';
        cards.push({
          id: p.id,
          businessLine: 'property_casualty',
          businessLineLabel: 'Commercial P&C (Linked)',
          policy_type: p.policy_type || 'Commercial P&C',
          company_name: p.writing_company || p.company_name || 'Carrier Unspecified',
          policy_number: p.policy_number || 'N/A',
          status: p.status || 'Active',
          effective_date: p.effective_date || null,
          expiration_date: p.expiration_date || null,
          premium: Number(p.total_premium || p.premium || 0),
          effectiveAddress,
          targetTab: 'policies',
          updated_at: p.updated_at || p.created_at || new Date().toISOString(),
          isLinkedCommercial: true,
          companyName: resolvedCompanyName
        });
      });
    }
    // 4. Supplemental policies (only if direct client owner)
    if (!client || client.agent_id === currentUserId) {
      (supplementalPolicies || []).forEach((supp: any) => {
        if (supp.status === 'Active') {
          const effectiveAddress = resolvePolicyAddress(
            null,
            residenceInfo,
            client
          );
          cards.push({
            id: supp.id,
            businessLine: 'health', // compatible tag for policy badge styling
            businessLineLabel: `Supplemental (${supp.product_type || 'Policy'})`,
            policy_type: supp.product_type || 'Supplemental Policy',
            company_name: supp.company || 'Carrier Unspecified',
            policy_number: supp.member_id || 'N/A',
            status: 'Active',
            effective_date: supp.effective_date || null,
            expiration_date: null,
            premium: Number(supp.monthly_premium || 0),
            effectiveAddress,
            targetTab: 'supplemental' as any,
            updated_at: supp.updated_at || supp.created_at || new Date().toISOString(),
          });
        }
      });
    }

    return cards.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  })();

  // Google Autocomplete States
  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false);
  const [googleMapsWarning, setGoogleMapsWarning] = useState<string | null>(null);
  const autocompleteInputRef = useRef<HTMLInputElement | null>(null);

  // Income States
  const [incomeList, setIncomeList] = useState<ClientIncomeInformation[]>([]);
  const [isAddIncomeOpen, setIsAddIncomeOpen] = useState(false);
  const [isEditIncomeOpen, setIsEditIncomeOpen] = useState(false);
  const [selectedIncome, setSelectedIncome] = useState<ClientIncomeInformation | null>(null);
  const [incomeRelationship, setIncomeRelationship] = useState<ClientIncomeInformation['relationship_to_applicant']>('Applicant');
  const [incomeType, setIncomeType] = useState<ClientIncomeInformation['income_type']>('W2');
  const [incomeEmployerName, setIncomeEmployerName] = useState('');
  const [incomeEmployerPhone, setIncomeEmployerPhone] = useState('');
  const [incomeAmount, setIncomeAmount] = useState<number | ''>('');
  const [incomeSaving, setIncomeSaving] = useState(false);
  const [incomeError, setIncomeError] = useState<string | null>(null);

  // Policies Modals state
  const [isAddPolicyOpen, setIsAddPolicyOpen] = useState(false);
  const [isEditPolicyOpen, setIsEditPolicyOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);

  // Policy Form state
  const [formType, setFormType] = useState('Auto');
  const [formCustomType, setFormCustomType] = useState('');
  const [formSubtype, setFormSubtype] = useState('');
  const [formNumber, setFormNumber] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formPremium, setFormPremium] = useState<number | ''>('');
  const [formEffective, setFormEffective] = useState('');
  const [formExpiration, setFormExpiration] = useState('');
  const [formTransaction, setFormTransaction] = useState<'New' | 'Renewal' | 'Endorsement' | ''>('New');
  const [formBusiness, setFormBusiness] = useState<'Personal' | 'Commercial' | ''>('Personal');
  const [formStatus, setFormStatus] = useState<'Active' | 'Cancelled' | 'Expired' | 'Pending' | ''>('Active');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Unlinking state
  const [selectedUnlinkPolicy, setSelectedUnlinkPolicy] = useState<any | null>(null);
  const [isConfirmUnlinkOpen, setIsConfirmUnlinkOpen] = useState(false);
  const [unlinkingPolicy, setUnlinkingPolicy] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const [companyUnlinkSuccess, setCompanyUnlinkSuccess] = useState<string | null>(null);

  // Expanded Policy IDs
  const [expandedPolicies, setExpandedPolicies] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedPolicies(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Age calculation
  const calculateAge = (dobString: string) => {
    if (!dobString) return '-';
    const today = new Date();
    const birthDate = new Date(dobString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 0 ? age : '-';
  };

  // Google Maps Dynamic Script Injection
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setGoogleMapsWarning('Google Maps API key is missing. Address Autocomplete is disabled; please enter details manually.');
      return;
    }

    const scriptId = 'google-maps-places-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;
    
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => setGoogleMapsLoaded(true);
      script.onerror = () => setGoogleMapsWarning('Failed to load Google Maps script. Address Autocomplete is disabled.');
      document.head.appendChild(script);
    } else {
      if (window.google?.maps?.places) {
        setGoogleMapsLoaded(true);
      } else {
        script.addEventListener('load', () => setGoogleMapsLoaded(true));
      }
    }
  }, []);

  // Google Places Autocomplete Listener
  useEffect(() => {
    if (!googleMapsLoaded || !isEditingResidence || !autocompleteInputRef.current) return;

    const autocomplete = new window.google.maps.places.Autocomplete(autocompleteInputRef.current, {
      types: ['address'],
      fields: ['address_components', 'formatted_address'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.address_components) return;

      let streetNumber = '';
      let route = '';
      let city = '';
      let zip = '';
      let county = '';

      for (const component of place.address_components) {
        const types = component.types;
        if (types.includes('street_number')) {
          streetNumber = component.long_name;
        }
        if (types.includes('route')) {
          route = component.long_name;
        }
        if (types.includes('locality')) {
          city = component.long_name;
        }
        if (types.includes('postal_code')) {
          zip = component.long_name;
        }
        if (types.includes('administrative_area_level_2')) {
          county = component.long_name;
        }
      }

      const fullAddress = `${streetNumber} ${route}`.trim() || place.formatted_address || '';
      
      setResidenceForm(prev => ({
        ...prev,
        address: fullAddress,
        city: city,
        zip_code: zip,
        county: county,
      }));
    });
  }, [googleMapsLoaded, isEditingResidence]);

  // Fetch client details
  const fetchClientDetails = useCallback(async () => {
    try {
      setLoadingClient(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserEmail(session.user.email || 'Agent');
        setCurrentUserId(session.user.id);
      }

      if (!isValidUuid(clientId)) {
        setLoadingClient(false);
        router.push('/clients');
        return;
      }

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();

      if (clientError) throw clientError;
      setClient(clientData);

      if (clientData?.agent_id) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('name, email')
          .eq('id', clientData.agent_id)
          .maybeSingle();

        setAgentProfile(profileData || null);
      }
    } catch (err: any) {
      console.error('Error fetching client details:', err);
      router.push('/clients');
    } finally {
      setLoadingClient(false);
    }
  }, [clientId, router]);

  // Fetch policies
  const fetchPolicies = useCallback(async () => {
    try {
      setLoadingPolicies(true);
      if (!isValidUuid(clientId)) {
        setPolicies([]);
        setLoadingPolicies(false);
        return;
      }

      const { data, error } = await supabase
        .from('policies')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const loadedPolicies = data || [];

      // Lookup linked personal clients for directly owned company policies
      const companyPolicyIds = loadedPolicies
        .filter((p: any) => p.policy_ownership_type === 'company')
        .map((p: any) => p.id);

      if (companyPolicyIds.length > 0) {
        const { data: linksData, error: linksErr } = await supabase
          .from('personal_commercial_policy_links')
          .select('commercial_policy_id, personal_client_id, linked_person_role')
          .in('commercial_policy_id', companyPolicyIds);

        if (!linksErr && linksData && linksData.length > 0) {
          const personalClientIds = Array.from(new Set(linksData.map((l: any) => l.personal_client_id).filter(Boolean)));

          if (personalClientIds.length > 0) {
            const { data: personalClientsData } = await supabase
              .from('clients')
              .select('id, full_name, email, phone')
              .in('id', personalClientIds);

            const personalClientMap: Record<string, any> = {};
            (personalClientsData || []).forEach((c: any) => {
              personalClientMap[c.id] = c;
            });

            const linkByPolicyId: Record<string, any> = {};
            linksData.forEach((l: any) => {
              const personalClient = personalClientMap[l.personal_client_id];
              if (personalClient) {
                linkByPolicyId[l.commercial_policy_id] = {
                  id: personalClient.id,
                  full_name: personalClient.full_name,
                  email: personalClient.email,
                  phone: personalClient.phone,
                  role: l.linked_person_role,
                };
              }
            });

            loadedPolicies.forEach((p: any) => {
              if (linkByPolicyId[p.id]) {
                p.linkedPersonalClient = linkByPolicyId[p.id];
              }
            });
          }
        }
      }

      // Lookup linked company clients for personal policies
      const personalPolicyIds = loadedPolicies
        .filter((p: any) => p.policy_ownership_type === 'personal')
        .map((p: any) => p.id);

      if (personalPolicyIds.length > 0) {
        const { data: compLinksData } = await supabase
          .from('personal_policy_companies')
          .select('policy_id, company_client_id, clients!inner(id, agency_name, full_name, email, phone)')
          .in('policy_id', personalPolicyIds);

        if (compLinksData && compLinksData.length > 0) {
          const compMap: Record<string, any[]> = {};
          compLinksData.forEach((item: any) => {
            if (!compMap[item.policy_id]) compMap[item.policy_id] = [];
            compMap[item.policy_id].push({
              id: item.clients.id,
              agency_name: item.clients.agency_name,
              full_name: item.clients.full_name,
              email: item.clients.email,
              phone: item.clients.phone,
            });
          });

          loadedPolicies.forEach((p: any) => {
            if (compMap[p.id]) {
              p.linkedCompanyClients = compMap[p.id];
            }
          });
        }
      }

      setPolicies(loadedPolicies);
    } catch (err: any) {
      console.error("Error fetching policies", {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
        fullError: err
      });
    } finally {
      setLoadingPolicies(false);
    }
  }, [clientId]);

  // Fetch Health and Life policies for Overview tab
  const fetchOverviewPolicies = useCallback(async () => {
    if (!isValidUuid(clientId)) return;
    try {
      const [healthRes, lifeRes, suppRes] = await Promise.all([
        supabase
          .from('health_policies')
          .select('*')
          .eq('client_id', clientId)
          .eq('active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('life_policies')
          .select('*, life_policy_products(*)')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
        supabase
          .from('client_supplemental_policies')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
      ]);

      if (healthRes.data) {
        setHealthPoliciesOverview(healthRes.data);
      }
      if (lifeRes.data) {
        setLifePolicies(lifeRes.data);
      }
      if (suppRes.data) {
        setSupplementalPolicies(suppRes.data);
      }
    } catch (err) {
      console.error('Error fetching overview policies:', err);
    }
  }, [clientId]);

  // Fetch Personal Information
  
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

    if (['full_name', 'email', 'phone'].includes(fieldName) && value && String(value).trim().length > 0) {
      await supabase
        .from('clients')
        .update({ [fieldName]: String(value).trim(), updated_at: new Date().toISOString() })
        .eq('id', clientId);
      await fetchClientDetails();
    }

    setPersonalForm(prev => ({ ...prev, [fieldName]: value }));
    await fetchPersonalInformation();
  };

  


  const saveResidenceField = async (fieldOrObject: string | Record<string, any>, val?: any) => {
    if (!isValidUuid(clientId)) return;
    let patch: Record<string, any> = {};
    if (typeof fieldOrObject === 'string') {
      patch[fieldOrObject] = val;
    } else {
      patch = { ...fieldOrObject };
    }

    const { data: existing } = await supabase
      .from('client_residence_information')
      .select('id')
      .eq('client_id', clientId)
      .maybeSingle();

    if (existing) {
      const { data: updated, error } = await supabase
        .from('client_residence_information')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('client_id', clientId)
        .select('*')
        .maybeSingle();

      if (error || !updated) throw error || new Error('Zero rows returned from residence update.');
      setResidenceInfo(updated);
    } else {
      const { data: inserted, error } = await supabase
        .from('client_residence_information')
        .insert({ client_id: clientId, ...patch })
        .select('*')
        .maybeSingle();

      if (error || !inserted) throw error || new Error('Zero rows returned from residence insert.');
      setResidenceInfo(inserted);
    }

    setResidenceForm(prev => ({ ...prev, ...patch }));
  };

  const saveIncomeField = async (incomeId: string, fieldName: string, value: any) => {
    const { data: updated, error } = await supabase
      .from('client_income_information')
      .update({ [fieldName]: value, updated_at: new Date().toISOString() })
      .eq('id', incomeId)
      .select('*')
      .maybeSingle();

    if (error || !updated) throw error || new Error('Zero rows returned from income update.');
    setIncomeList(prev => prev.map(inc => inc.id === incomeId ? updated : inc));
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

  const fetchPersonalInformation = useCallback(async () => {
    try {
      setLoadingPersonal(true);
      if (!isValidUuid(clientId)) {
        setPersonalInfo(null);
        return;
      }

      const [personalRes, clientRes] = await Promise.all([
        supabase
          .from('client_personal_information')
          .select('*')
          .eq('client_id', clientId)
          .maybeSingle(),
        supabase
          .from('clients')
          .select('full_name, email, phone')
          .eq('id', clientId)
          .maybeSingle()
      ]);

      if (personalRes.error) throw personalRes.error;
      const data = personalRes.data;
      const masterClient = clientRes.data;

      setPersonalInfo(data);

      const resolvedName = (data?.full_name && data.full_name.trim().length > 0)
        ? data.full_name
        : (masterClient?.full_name || '');

      if (data) {
        setPersonalForm({
          full_name: resolvedName,
          date_of_birth: data.date_of_birth || '',
          ssn: data.ssn || '',
          email: data.email || masterClient?.email || '',
          phone: data.phone || masterClient?.phone || '',
          secondary_phone: data.secondary_phone || '',
          secondary_email: data.secondary_email || '',
          has_co_applicant: data.has_co_applicant || false,
          gender: data.gender || '',
          marital_status: data.marital_status || '',
          born_in_usa: data.born_in_usa ?? null,
          immigration_status: data.immigration_status || '',
          alien_number: data.alien_number || '',
          card_number: data.card_number || '',
          uscis_number: data.uscis_number || '',
          immigration_category: data.immigration_category || '',
          immigration_expiration_date: data.immigration_expiration_date || '',
          immigration_other_description: data.immigration_other_description || '',
        });
      } else {
        setPersonalForm({
          full_name: masterClient?.full_name || '',
          date_of_birth: '',
          ssn: '',
          email: masterClient?.email || '',
          phone: masterClient?.phone || '',
          secondary_phone: '',
          secondary_email: '',
          has_co_applicant: false,
          gender: '',
          marital_status: '',
          born_in_usa: null,
          immigration_status: '',
          alien_number: '',
          card_number: '',
          uscis_number: '',
          immigration_category: '',
          immigration_expiration_date: '',
          immigration_other_description: '',
        });
      }
    } catch (err: any) {
      console.error('Error fetching personal info:', err);
    } finally {
      setLoadingPersonal(false);
    }
  }, [clientId]);

  // Fetch Co-Applicant Information
  const fetchCoApplicantInformation = useCallback(async () => {
    try {
      setLoadingCoApplicant(true);
      if (!isValidUuid(clientId)) {
        setCoApplicantInfo(null);
        setLoadingCoApplicant(false);
        return;
      }
      const { data, error } = await supabase
        .from('client_co_applicant_information')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      if (error) {
        console.error('Co-Applicant fetch error:', error.message, error.code, error.details, error.hint);
      }
      
      setCoApplicantInfo(data);
      if (data) {
        setCoApplicantForm({
          full_name: data.full_name || '',
          date_of_birth: data.date_of_birth || '',
          ssn: data.ssn || '',
          primary_phone: data.primary_phone || '',
          secondary_phone: data.secondary_phone || '',
          primary_email: data.primary_email || '',
          secondary_email: data.secondary_email || '',
          gender: data.gender || '',
          marital_status: data.marital_status || '',
          immigration_status: data.immigration_status || '',
          alien_number: data.alien_number || '',
          card_number: data.card_number || '',
          uscis_number: data.uscis_number || '',
          immigration_category: data.immigration_category || '',
          immigration_expiration_date: data.immigration_expiration_date || '',
          immigration_other_description: data.immigration_other_description || '',
        });
      } else {
        setCoApplicantForm({
          full_name: '',
          date_of_birth: '',
          ssn: '',
          primary_phone: '',
          secondary_phone: '',
          primary_email: '',
          secondary_email: '',
          gender: '',
          marital_status: '',
          immigration_status: '',
          alien_number: '',
          card_number: '',
          uscis_number: '',
          immigration_category: '',
          immigration_expiration_date: '',
          immigration_other_description: '',
        });
      }
    } catch (err: any) {
      console.error('Error fetching co-applicant info:', err);
    } finally {
      setLoadingCoApplicant(false);
    }
  }, [clientId]);

  const fetchResidenceInformation = useCallback(async () => {
    try {
      setLoadingResidence(true);
      if (!isValidUuid(clientId)) {
        setResidenceInfo(null);
        return;
      }

      const [residenceRes, clientRes] = await Promise.all([
        supabase
          .from('client_residence_information')
          .select('*')
          .eq('client_id', clientId)
          .maybeSingle(),
        supabase
          .from('clients')
          .select('address')
          .eq('id', clientId)
          .maybeSingle()
      ]);

      if (residenceRes.error) throw residenceRes.error;
      const data = residenceRes.data;
      const masterClient = clientRes.data;

      setResidenceInfo(data);
      if (data) {
        setResidenceForm({
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          zip_code: data.zip_code || '',
          county: data.county || '',
        });
      } else {
        setResidenceForm({
          address: masterClient?.address || '',
          city: '',
          state: '',
          zip_code: '',
          county: '',
        });
      }
    } catch (err: any) {
      console.error('Error fetching residence info:', err);
    } finally {
      setLoadingResidence(false);
    }
  }, [clientId]);

  // Fetch Linked Company Profiles and their Commercial Policies
  const fetchLinkedCompanyPolicies = useCallback(async () => {
    try {
      setLoadingLinkedPolicies(true);
      if (!isValidUuid(clientId)) {
        setLinkedCompanyPolicies([]);
        setLinkedCompanyProfiles([]);
        setLinkedPersonalContact(null);
        setLoadingLinkedPolicies(false);
        return;
      }

      // 1. Fetch relationships from client_company_relationships
      const { data: relData } = await supabase
        .from('client_company_relationships')
        .select('id, company_client_id, personal_client_id, relationship_type');

      const companyRels = (relData || []).filter((r: any) => r.personal_client_id === clientId || r.company_client_id === clientId);

      let targetCompanyIds: string[] = [];
      let targetPersonalClientId: string | null = null;

      companyRels.forEach((r: any) => {
        if (r.personal_client_id === clientId) {
          targetCompanyIds.push(r.company_client_id);
        }
        if (r.company_client_id === clientId) {
          targetPersonalClientId = r.personal_client_id;
        }
      });

      // Also check legacy personal_commercial_policy_links
      const { data: legacyLinks } = await supabase
        .from('personal_commercial_policy_links')
        .select('commercial_policy_id, personal_client_id')
        .eq('personal_client_id', clientId);

      let legacyPolicyIds: string[] = (legacyLinks || []).map((l: any) => l.commercial_policy_id).filter(Boolean);

      // If Personal Client: load linked company profiles & commercial policies
      if (targetCompanyIds.length > 0 || legacyPolicyIds.length > 0) {
        let companyProfiles: any[] = [];
        if (targetCompanyIds.length > 0) {
          const { data: compsData } = await supabase
            .from('clients')
            .select('id, full_name, agency_name, email, phone')
            .in('id', targetCompanyIds);

          if (compsData) {
            companyProfiles = compsData;
          }
        }

        let loadedPolicies: any[] = [];
        let orConditions: string[] = [];
        if (targetCompanyIds.length > 0) {
          orConditions.push(`client_id.in.(${targetCompanyIds.join(',')})`);
        }
        if (legacyPolicyIds.length > 0) {
          orConditions.push(`id.in.(${legacyPolicyIds.join(',')})`);
        }

        if (orConditions.length > 0) {
          const { data: companyPoliciesData } = await supabase
            .from('policies')
            .select('*')
            .or(orConditions.join(','));

          loadedPolicies = companyPoliciesData || [];
        }

        setLinkedCompanyPolicies(loadedPolicies);

        const profileCards = companyProfiles.map(comp => {
          const count = loadedPolicies.filter(p => p.client_id === comp.id).length;
          return {
            ...comp,
            policyCount: count
          };
        });
        setLinkedCompanyProfiles(profileCards);
      } else {
        setLinkedCompanyPolicies([]);
        setLinkedCompanyProfiles([]);
      }

      // If Company Client: load linked personal contact
      if (targetPersonalClientId) {
        const { data: persData } = await supabase
          .from('clients')
          .select('id, full_name, email, phone')
          .eq('id', targetPersonalClientId)
          .maybeSingle();

        setLinkedPersonalContact(persData || null);
      } else {
        setLinkedPersonalContact(null);
      }

    } catch (err: any) {
      console.error('Error fetching linked company/personal info:', err);
      setLinkedCompanyPolicies([]);
      setLinkedCompanyProfiles([]);
      setLinkedPersonalContact(null);
    } finally {
      setLoadingLinkedPolicies(false);
    }
  }, [clientId]);

  // Fetch Income Information
  const fetchIncomeInformation = useCallback(async () => {
    try {
      setLoadingIncome(true);
      if (!isValidUuid(clientId)) {
        setIncomeList([]);
        setLoadingIncome(false);
        return;
      }

      const { data, error } = await supabase
        .from('client_income_information')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setIncomeList(data || []);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('income-updated', { detail: { clientId } }));
      }
    } catch (err: any) {
      console.error('Error fetching income info:', err);
    } finally {
      setLoadingIncome(false);
    }
  }, [clientId]);

  // Unlink Company Policy
  const handleConfirmUnlinkPolicy = async () => {
    if (!selectedUnlinkPolicy || !clientId) return;
    try {
      setUnlinkingPolicy(true);
      setUnlinkError(null);

      const { error } = await supabase
        .from('personal_commercial_policy_links')
        .delete()
        .eq('commercial_policy_id', selectedUnlinkPolicy.id)
        .eq('personal_client_id', clientId);

      if (error) throw error;

      setIsConfirmUnlinkOpen(false);
      setSelectedUnlinkPolicy(null);
      setCompanyUnlinkSuccess('Company policy unlinked successfully.');
      await fetchLinkedCompanyPolicies();
    } catch (err: any) {
      console.error('Error unlinking company policy:', err);
      setUnlinkError(err?.message || 'Failed to unlink company policy.');
    } finally {
      setUnlinkingPolicy(false);
    }
  };

  // Fetch note counts separately (non-blocking)
  const fetchNoteCounts = async (policyIds: string[]) => {
    if (policyIds.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('policy_notes')
        .select('policy_id')
        .in('policy_id', policyIds);

      if (error) throw error;

      const counts: { [policyId: string]: number } = {};
      data.forEach((note: any) => {
        counts[note.policy_id] = (counts[note.policy_id] || 0) + 1;
      });
      setNoteCounts(counts);
    } catch (err) {
      console.error('Error fetching note counts:', err);
    }
  };

  // Fetch document counts separately (non-blocking)
  const fetchDocCounts = async (policyIds: string[]) => {
    if (policyIds.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('policy_documents')
        .select('policy_id')
        .in('policy_id', policyIds);

      if (error) throw error;

      const counts: { [policyId: string]: number } = {};
      data.forEach((doc: any) => {
        counts[doc.policy_id] = (counts[doc.policy_id] || 0) + 1;
      });
      setDocCounts(counts);
    } catch (err) {
      console.error('Error fetching document counts:', err);
    }
  };

  useEffect(() => {
    if (policies.length > 0) {
      const policyIds = policies.map(p => p.id);
      fetchNoteCounts(policyIds);
      fetchDocCounts(policyIds);
    }
  }, [policies]);

  // Fetch timeline events across all implemented modules
  const fetchTimelineEvents = useCallback(async () => {
    try {
      setEventsLoading(true);
      setEventsError(null);

      // Concurrent queries across all module event tables
      const [
        actRes,
        cNotesRes,
        cDocsRes,
        healthRes,
        lifeRes,
        consentRes,
      ] = await Promise.all([
        supabase.from('activity_events').select('*').eq('client_id', clientId),
        supabase.from('client_notes').select('*').eq('client_id', clientId),
        supabase.from('client_documents').select('*').eq('client_id', clientId),
        supabase.from('health_policies').select('*').eq('client_id', clientId),
        supabase.from('life_policies').select('*, life_policy_products(*), life_policy_beneficiaries(*), life_policy_documents(*), life_policy_notes(*), life_policy_timeline_events(*)').eq('client_id', clientId),
        supabase.from('signature_requests').select('*, consent_templates(internal_name, public_title)').eq('client_id', clientId),
      ]);

      const normalizedList: NormalizedTimelineEvent[] = [];

      // 1. P&C & General Activity Events
      (actRes.data || []).forEach((evt: any) => {
        let category: 'policies' | 'notes' | 'documents' | 'consents' = 'policies';
        if (evt.event_type.startsWith('note_')) category = 'notes';
        else if (evt.event_type.startsWith('document_')) category = 'documents';
        else if (evt.event_type.startsWith('consent_') || evt.event_type.startsWith('signed_document_')) category = 'consents';

        let targetTab: any = 'policies';
        if (!evt.policy_id) {
          if (category === 'notes') targetTab = 'notes';
          else if (category === 'documents') targetTab = 'documents';
          else if (category === 'consents') targetTab = 'consents';
          else targetTab = 'personal-info';
        }

        const relatedLabel = evt.policy_id
          ? `P&C | ${evt.metadata?.line_of_business || 'Policy'} | ${evt.metadata?.policy_number || 'N/A'}`
          : 'Client | Profile';

        normalizedList.push({
          id: evt.id,
          client_id: clientId,
          policy_id: evt.policy_id || null,
          module: evt.policy_id ? 'property_casualty' : 'client',
          category,
          event_type: evt.event_type,
          title: evt.title,
          description: evt.description || null,
          actor_name: 'Agent',
          created_at: evt.created_at,
          related_label: relatedLabel,
          target_tab: targetTab,
          target_policy_id: evt.policy_id || null,
          dedup_key: `act_${evt.id}_${evt.event_type}_${(evt.created_at || '').slice(0, 19)}`,
        });
      });

      // 2. Health Policies
      (healthRes.data || []).forEach((h: any) => {
        normalizedList.push({
          id: `health_pol_${h.id}`,
          client_id: clientId,
          policy_id: h.id,
          module: 'health',
          category: 'policies',
          event_type: 'health_policy_created',
          title: `Health Policy Registered`,
          description: `Plan: ${h.plan_name || 'Health Plan'} | Insurer: ${h.company_2026 || 'Marketplace'}`,
          actor_name: 'Agent',
          created_at: h.created_at || new Date().toISOString(),
          related_label: `Health | ${h.company_2026 || 'Marketplace'} | ${h.plan_id || h.application_number || 'N/A'}`,
          target_tab: 'health',
          target_policy_id: h.id,
          dedup_key: `health_${h.id}_created_${(h.created_at || '').slice(0, 19)}`,
        });
      });

      // 3. Life Policies & Sub-tables
      (lifeRes.data || []).forEach((l: any) => {
        const prods = l.life_policy_products || [];
        const mainProd = prods[0];
        const lifeLabel = mainProd
          ? `Life | ${mainProd.product_type || 'Policy'} | ${mainProd.company || 'Carrier'}`
          : 'Life | Insurance';

        // Products
        prods.forEach((p: any) => {
          normalizedList.push({
            id: `life_prod_${p.id}`,
            client_id: clientId,
            policy_id: l.id,
            module: 'life',
            category: 'policies',
            event_type: 'life_product_added',
            title: `Life Product: ${p.product_type || 'Product'} (${p.company || 'Carrier'})`,
            description: `Policy #: ${p.policy_number || 'N/A'} | Premium: $${p.monthly_premium || 0}/mo`,
            actor_name: 'Agent',
            created_at: p.created_at || l.created_at || new Date().toISOString(),
            related_label: `Life | ${p.product_type || 'Product'} | ${p.company || 'Carrier'}`,
            target_tab: 'life',
            target_policy_id: l.id,
            dedup_key: `life_prod_${p.id}_${(p.created_at || '').slice(0, 19)}`,
          });
        });

        // Beneficiaries
        (l.life_policy_beneficiaries || []).forEach((b: any) => {
          normalizedList.push({
            id: `life_ben_${b.id}`,
            client_id: clientId,
            policy_id: l.id,
            module: 'life',
            category: 'policies',
            event_type: 'life_beneficiary_updated',
            title: `Life Beneficiary: ${b.name}`,
            description: `Relationship: ${b.relationship || 'N/A'} | Allocation: ${b.benefit_percentage}%`,
            actor_name: 'Agent',
            created_at: b.created_at || l.created_at || new Date().toISOString(),
            related_label: lifeLabel,
            target_tab: 'life',
            target_policy_id: l.id,
            dedup_key: `life_ben_${b.id}_${(b.created_at || '').slice(0, 19)}`,
          });
        });

        // Documents
        (l.life_policy_documents || []).forEach((d: any) => {
          normalizedList.push({
            id: `life_doc_${d.id}`,
            client_id: clientId,
            policy_id: l.id,
            module: 'life',
            category: 'documents',
            event_type: 'life_document_uploaded',
            title: `Life Document Uploaded: ${d.file_name}`,
            description: `File Size: ${d.file_size ? `${(d.file_size / 1024).toFixed(1)} KB` : 'File'}`,
            actor_name: 'Agent',
            created_at: d.created_at || l.created_at || new Date().toISOString(),
            related_label: lifeLabel,
            target_tab: 'life',
            target_policy_id: l.id,
            dedup_key: `life_doc_${d.id}_${(d.created_at || '').slice(0, 19)}`,
          });
        });

        // Notes
        (l.life_policy_notes || []).forEach((n: any) => {
          normalizedList.push({
            id: `life_note_${n.id}`,
            client_id: clientId,
            policy_id: l.id,
            module: 'life',
            category: 'notes',
            event_type: 'life_note_added',
            title: `Life Internal Note Added`,
            description: n.body,
            actor_name: 'Agent',
            created_at: n.created_at || l.created_at || new Date().toISOString(),
            related_label: lifeLabel,
            target_tab: 'life',
            target_policy_id: l.id,
            dedup_key: `life_note_${n.id}_${(n.created_at || '').slice(0, 19)}`,
          });
        });

        // Custom Timeline Events
        (l.life_policy_timeline_events || []).forEach((t: any) => {
          normalizedList.push({
            id: `life_evt_${t.id}`,
            client_id: clientId,
            policy_id: l.id,
            module: 'life',
            category: 'policies',
            event_type: t.event_type || 'life_timeline_event',
            title: t.title,
            description: t.description || null,
            actor_name: 'Agent',
            created_at: t.created_at || new Date().toISOString(),
            related_label: lifeLabel,
            target_tab: 'life',
            target_policy_id: l.id,
            dedup_key: `life_evt_${t.id}_${(t.created_at || '').slice(0, 19)}`,
          });
        });
      });

      // 4. Consents (signature_requests)
      (consentRes.data || []).forEach((c: any) => {
        const templateName = c.consent_templates?.internal_name || c.consent_templates?.public_title || 'Consent Template';
        normalizedList.push({
          id: `consent_${c.id}`,
          client_id: clientId,
          module: 'consent',
          category: 'consents',
          event_type: `consent_${c.status || 'created'}`,
          title: `Consent Request: ${templateName}`,
          description: `Status: ${c.status || 'Sent'}`,
          actor_name: 'Agent',
          created_at: c.created_at || new Date().toISOString(),
          related_label: `Consent | ${templateName}`,
          target_tab: 'consents',
          dedup_key: `consent_${c.id}_${c.status}_${(c.created_at || '').slice(0, 19)}`,
        });
      });

      // 5. Client Notes
      (cNotesRes.data || []).forEach((n: any) => {
        normalizedList.push({
          id: `cnote_${n.id}`,
          client_id: clientId,
          module: 'client',
          category: 'notes',
          event_type: 'client_note_added',
          title: `Client Note Added`,
          description: n.body,
          actor_name: 'Agent',
          created_at: n.created_at || new Date().toISOString(),
          related_label: `Client | Note`,
          target_tab: 'notes',
          dedup_key: `cnote_${n.id}_${(n.created_at || '').slice(0, 19)}`,
        });
      });

      // 6. Client Documents
      (cDocsRes.data || []).forEach((d: any) => {
        normalizedList.push({
          id: `cdoc_${d.id}`,
          client_id: clientId,
          module: 'client',
          category: 'documents',
          event_type: 'client_document_uploaded',
          title: `Client Document: ${d.display_name || d.file_name}`,
          description: `Category: ${d.document_type || 'General Document'}`,
          actor_name: 'Agent',
          created_at: d.created_at || new Date().toISOString(),
          related_label: `Client | Document`,
          target_tab: 'documents',
          dedup_key: `cdoc_${d.id}_${(d.created_at || '').slice(0, 19)}`,
        });
      });

      // Deduplicate by dedup_key
      const seen = new Set<string>();
      const deduplicatedEvents: NormalizedTimelineEvent[] = [];

      normalizedList.forEach((evt) => {
        if (!seen.has(evt.dedup_key!)) {
          seen.add(evt.dedup_key!);
          deduplicatedEvents.push(evt);
        }
      });

      // Sort created_at descending
      deduplicatedEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setEvents(deduplicatedEvents);
    } catch (err: any) {
      console.error('Error fetching timeline events:', err);
      setEventsError(err?.message || 'Failed to fetch timeline.');
    } finally {
      setEventsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (!isValidUuid(clientId)) return;
    fetchClientDetails();
    fetchPolicies();
    fetchLinkedCompanyPolicies();
    fetchOverviewPolicies();
    fetchPersonalInformation();
    fetchCoApplicantInformation();
    fetchResidenceInformation();
  }, [clientId, fetchClientDetails, fetchPolicies, fetchLinkedCompanyPolicies, fetchOverviewPolicies, fetchPersonalInformation, fetchCoApplicantInformation, fetchResidenceInformation]);

  useEffect(() => {
    if (!isValidUuid(clientId)) return;
    if (activeTab === 'timeline') {
      fetchTimelineEvents();
    } else if (activeTab === 'personal-info') {
      fetchIncomeInformation();
    }
  }, [activeTab, clientId, fetchTimelineEvents, fetchIncomeInformation]);

  const cleanCoApplicantPayload = (form: CoApplicantInformation) => {
    const cleaned = { ...form } as any;
    const dobIso = cleaned.date_of_birth
      ? (cleaned.date_of_birth.includes('/') ? usDateToIso(cleaned.date_of_birth) : cleaned.date_of_birth)
      : null;
    cleaned.date_of_birth = dobIso || '';

    const expIso = cleaned.immigration_expiration_date
      ? (cleaned.immigration_expiration_date.includes('/') ? usDateToIso(cleaned.immigration_expiration_date) : cleaned.immigration_expiration_date)
      : null;
    cleaned.immigration_expiration_date = expIso || null;

    if (cleaned.immigration_status === 'Resident') {
      cleaned.uscis_number = '';
      cleaned.immigration_category = '';
      cleaned.immigration_other_description = '';
    } else if (cleaned.immigration_status === 'Work Permit') {
      cleaned.alien_number = '';
      cleaned.immigration_other_description = '';
    } else if (cleaned.immigration_status === 'Citizen') {
      cleaned.alien_number = '';
      cleaned.card_number = '';
      cleaned.uscis_number = '';
      cleaned.immigration_category = '';
      cleaned.immigration_expiration_date = null;
      cleaned.immigration_other_description = '';
    } else if (cleaned.immigration_status === 'Other') {
      cleaned.alien_number = '';
      cleaned.card_number = '';
      cleaned.uscis_number = '';
      cleaned.immigration_category = '';
      cleaned.immigration_expiration_date = null;
    } else {
      cleaned.alien_number = '';
      cleaned.card_number = '';
      cleaned.uscis_number = '';
      cleaned.immigration_category = '';
      cleaned.immigration_expiration_date = null;
      cleaned.immigration_other_description = '';
    }
    return cleaned;
  };

  // Clean irrelevant conditional values from form payload before database storage
  const cleanPersonalPayload = (form: ClientPersonalInformation) => {
    const cleaned = { ...form } as any;
    const dobIso = cleaned.date_of_birth
      ? (cleaned.date_of_birth.includes('/') ? usDateToIso(cleaned.date_of_birth) : cleaned.date_of_birth)
      : null;
    cleaned.date_of_birth = dobIso || '';

    const expIso = cleaned.immigration_expiration_date
      ? (cleaned.immigration_expiration_date.includes('/') ? usDateToIso(cleaned.immigration_expiration_date) : cleaned.immigration_expiration_date)
      : null;
    cleaned.immigration_expiration_date = expIso || null;

    if (cleaned.immigration_status === 'Resident') {
      cleaned.uscis_number = '';
      cleaned.immigration_category = '';
      cleaned.immigration_other_description = '';
    } else if (cleaned.immigration_status === 'Work Permit') {
      cleaned.alien_number = '';
      cleaned.immigration_other_description = '';
    } else if (cleaned.immigration_status === 'Citizen') {
      cleaned.alien_number = '';
      cleaned.card_number = '';
      cleaned.uscis_number = '';
      cleaned.immigration_category = '';
      cleaned.immigration_expiration_date = null;
      cleaned.immigration_other_description = '';
    } else if (cleaned.immigration_status === 'Other') {
      cleaned.alien_number = '';
      cleaned.card_number = '';
      cleaned.uscis_number = '';
      cleaned.immigration_category = '';
      cleaned.immigration_expiration_date = null;
    } else {
      cleaned.alien_number = '';
      cleaned.card_number = '';
      cleaned.uscis_number = '';
      cleaned.immigration_category = '';
      cleaned.immigration_expiration_date = null;
      cleaned.immigration_other_description = '';
    }
    return cleaned;
  };

  // Save Personal Info
  const handleDeleteClient = async () => {
    if (!client) return;
    setIsDeletingClient(true);
    setDeleteClientError(null);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        setDeleteClientError('Not authenticated. Please sign in again.');
        setIsDeletingClient(false);
        return;
      }

      const { deleteClientSecure } = await import('@/app/actions/deleteClientAction');
      const res = await deleteClientSecure(client.id, session.access_token);
      
      if (!res.success) {
        setDeleteClientError(res.error || 'Failed to delete client.');
        setIsDeletingClient(false);
      } else {
        router.push('/clients');
      }
    } catch (err: any) {
      console.error('Error deleting client:', err);
      setDeleteClientError('An unexpected error occurred while deleting the client.');
      setIsDeletingClient(false);
    }
  };

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPersonal(true);
    setPersonalError(null);

    if (!personalForm.date_of_birth || !personalForm.date_of_birth.trim()) {
      setPersonalError('Applicant Date of Birth is required.');
      setSavingPersonal(false);
      return;
    }

    const payload = cleanPersonalPayload(personalForm);

    if (!payload.date_of_birth) {
      setPersonalError('Applicant Date of Birth is required.');
      setSavingPersonal(false);
      return;
    }

    try {
      // 1. Upsert sub-table
      const { error: subError } = await supabase
        .from('client_personal_information')
        .upsert({
          client_id: clientId,
          ...payload,
          updated_at: new Date().toISOString()
        }, { onConflict: 'client_id' });

      if (subError) throw subError;

      // 2. Co-Applicant
      if (payload.has_co_applicant) {
        const coAppPayload = cleanCoApplicantPayload(coApplicantForm);
        if (!coApplicantForm.full_name?.trim() || !coAppPayload.date_of_birth) {
           throw new Error('Co-Applicant Name and DOB are required when Co-Applicant is enabled.');
        }
        const { error: coAppError } = await supabase
          .from('client_co_applicant_information')
          .upsert({
            client_id: clientId,
            ...coAppPayload,
            updated_at: new Date().toISOString()
          }, { onConflict: 'client_id' });
        
        if (coAppError) throw coAppError;
      }

      // 3. Sync master clients values
      const { error: masterError } = await supabase
        .from('clients')
        .update({
          full_name: payload.full_name,
          email: payload.email,
          phone: payload.phone,
          updated_at: new Date().toISOString()
        })
        .eq('id', clientId);

      if (masterError) throw masterError;

      setIsEditingPersonal(false);
      await fetchClientDetails();
      await fetchPersonalInformation();
      await fetchCoApplicantInformation();
    } catch (err: any) {
      setPersonalError(err?.message || 'Failed to save personal information.');
    } finally {
      setSavingPersonal(false);
    }
  };

  // Save Residence Info
  const handleSaveResidence = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingResidence(true);
    setResidenceError(null);

    try {
      // 1. Upsert sub-table
      const { error: subError } = await supabase
        .from('client_residence_information')
        .upsert({
          client_id: clientId,
          ...residenceForm,
          updated_at: new Date().toISOString()
        }, { onConflict: 'client_id' });

      if (subError) throw subError;

      // 2. Sync master clients values
      const { error: masterError } = await supabase
        .from('clients')
        .update({
          address: residenceForm.address,
          updated_at: new Date().toISOString()
        })
        .eq('id', clientId);

      if (masterError) throw masterError;

      setIsEditingResidence(false);
      await fetchClientDetails();
      await fetchResidenceInformation();
    } catch (err: any) {
      setResidenceError(err?.message || 'Failed to save residence information.');
    } finally {
      setSavingResidence(false);
    }
  };

  // Open Add Income Modal
  const handleOpenAddIncome = () => {
    setIncomeError(null);
    setIncomeRelationship('Applicant');
    setIncomeType('W2');
    setIncomeEmployerName('');
    setIncomeEmployerPhone('');
    setIncomeAmount('');
    setIsAddIncomeOpen(true);
  };

  // Open Edit Income Modal
  const handleOpenEditIncome = (income: ClientIncomeInformation) => {
    setIncomeError(null);
    setSelectedIncome(income);
    setIncomeRelationship(income.relationship_to_applicant);
    setIncomeType(income.income_type);
    setIncomeEmployerName(income.employer_name || '');
    setIncomeEmployerPhone(income.employer_phone || '');
    setIncomeAmount(income.income);
    setIsEditIncomeOpen(true);
  };

  // Add Income Submit
  const handleAddIncomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (incomeAmount === '') {
      setIncomeError('Income value is required.');
      return;
    }
    setIncomeSaving(true);
    setIncomeError(null);

    try {
      const { error } = await supabase
        .from('client_income_information')
        .insert({
          client_id: clientId,
          relationship_to_applicant: incomeRelationship,
          income_type: incomeType,
          employer_name: incomeEmployerName.trim() || null,
          employer_phone: incomeEmployerPhone.trim() || null,
          income: Number(incomeAmount),
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      setIsAddIncomeOpen(false);
      fetchIncomeInformation();
    } catch (err: any) {
      setIncomeError(err?.message || 'Failed to add income record.');
    } finally {
      setIncomeSaving(false);
    }
  };

  // Edit Income Submit
  const handleEditIncomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncome) return;
    if (incomeAmount === '') {
      setIncomeError('Income value is required.');
      return;
    }
    setIncomeSaving(true);
    setIncomeError(null);

    try {
      const { error } = await supabase
        .from('client_income_information')
        .update({
          relationship_to_applicant: incomeRelationship,
          income_type: incomeType,
          employer_name: incomeEmployerName.trim() || null,
          employer_phone: incomeEmployerPhone.trim() || null,
          income: Number(incomeAmount),
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedIncome.id);

      if (error) throw error;
      setIsEditIncomeOpen(false);
      fetchIncomeInformation();
    } catch (err: any) {
      setIncomeError(err?.message || 'Failed to save income record.');
    } finally {
      setIncomeSaving(false);
    }
  };

  // Delete Income
  const handleDeleteIncome = async (id: string) => {
    if (!confirm('Are you sure you want to delete this income record?')) return;
    try {
      const { error } = await supabase
        .from('client_income_information')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchIncomeInformation();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete income record.');
    }
  };

  // Policy Modal actions
  const handleOpenAddPolicy = () => {
    setFormError(null);
    setFormType('Auto');
    setFormCustomType('');
    setFormSubtype('');
    setFormNumber('');
    setFormCompany('');
    setFormPremium('');
    setFormEffective('');
    setFormExpiration('');
    setFormTransaction('New');
    setFormBusiness('Personal');
    setFormStatus('Active');
    setIsAddPolicyOpen(true);
  };

  const handleOpenEditPolicy = (policy: Policy, e: React.MouseEvent) => {
    e.stopPropagation();
    setFormError(null);
    setSelectedPolicy(policy);
    
    const standardTypes = ['Auto', 'Health', 'Life', 'Homeowner', 'Commercial', 'Flood', 'Supplemental'];
    if (standardTypes.includes(policy.policy_type)) {
      setFormType(policy.policy_type);
      setFormCustomType('');
    } else {
      setFormType('Other');
      setFormCustomType(policy.policy_type);
    }

    setFormSubtype(policy.policy_subtype || '');
    setFormNumber(policy.policy_number || '');
    setFormCompany(policy.company_name || '');
    setFormPremium(policy.premium);
    setFormEffective(policy.effective_date || '');
    setFormExpiration(policy.expiration_date || '');
    setFormTransaction(policy.transaction_type);
    setFormBusiness(policy.business_type);
    setFormStatus(policy.status);
    setIsEditPolicyOpen(true);
  };

  const handleAddPolicySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formPremium === '') {
      setFormError('Premium is required.');
      return;
    }
    const finalType = formType === 'Other' ? formCustomType.trim() : formType;
    if (!finalType.trim()) {
      setFormError('Policy type is required.');
      return;
    }
    setFormSaving(true);
    setFormError(null);
    try {
      const { error } = await supabase
        .from('policies')
        .insert({
          client_id: clientId,
          policy_type: finalType,
          policy_subtype: formSubtype.trim() || null,
          policy_number: formNumber.trim() || null,
          company_name: formCompany.trim() || null,
          premium: Number(formPremium),
          effective_date: formEffective || null,
          expiration_date: formExpiration || null,
          transaction_type: formTransaction || null,
          business_type: formBusiness || null,
          status: formStatus || null,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      setIsAddPolicyOpen(false);
      fetchPolicies();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to add policy.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleEditPolicySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPolicy) return;
    if (formPremium === '') {
      setFormError('Premium is required.');
      return;
    }
    const finalType = formType === 'Other' ? formCustomType.trim() : formType;
    if (!finalType.trim()) {
      setFormError('Policy type is required.');
      return;
    }
    setFormSaving(true);
    setFormError(null);
    try {
      const { error } = await supabase
        .from('policies')
        .update({
          policy_type: finalType,
          policy_subtype: formSubtype.trim() || null,
          policy_number: formNumber.trim() || null,
          company_name: formCompany.trim() || null,
          premium: Number(formPremium),
          effective_date: formEffective || null,
          expiration_date: formExpiration || null,
          transaction_type: formTransaction || null,
          business_type: formBusiness || null,
          status: formStatus || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedPolicy.id);

      if (error) throw error;
      setIsEditPolicyOpen(false);
      fetchPolicies();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save policy.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeletePolicy = async (policyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this policy? This action cannot be undone.')) return;
    try {
      const { error } = await supabase
        .from('policies')
        .delete()
        .eq('id', policyId);
      if (error) throw error;
      fetchPolicies();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete policy.');
    }
  };

  const getAgentDisplayName = () => {
    const rawName = agentProfile?.name || currentUserEmail || 'Agent';
    const isEligiblePcClient = Boolean(policies && policies.length > 0);
    return getAssignedAgentDisplay({
      clientAgentId: client?.agent_id,
      currentUserId,
      isEligiblePcClient,
      fallbackName: rawName
    });
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  // computed stats for overview dashboard
  const activeCount = consolidatedOverviewCards.length;
  const pendingCount = 0;

  const expiringSoonCount = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sixtyDaysFromNow = new Date();
    sixtyDaysFromNow.setDate(today.getDate() + 60);
    sixtyDaysFromNow.setHours(23, 59, 59, 999);

    return consolidatedOverviewCards.filter((card) => {
      if (card.businessLine !== 'property_casualty' || !card.expiration_date) return false;
      const expDate = new Date(card.expiration_date + 'T00:00:00');
      return expDate >= today && expDate <= sixtyDaysFromNow;
    }).length;
  })();

  const recentPolicies = [...policies]
    .sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
      const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
      return dateB - dateA;
    })
    .slice(0, 4);

  const uniqueLobs = Array.from(new Set(policies.map(p => p.policy_type).filter(Boolean))).sort() as string[];

  const uniqueCompanies = Array.from(new Set(policies.map(p => p.writing_company || p.company_name).filter(Boolean))).sort() as string[];

  const filteredPolicies = policies.filter(p => {
    const matchesSearch = !policiesSearch.trim() ||
      (p.policy_number && p.policy_number.toLowerCase().includes(policiesSearch.toLowerCase())) ||
      (p.company_name && p.company_name.toLowerCase().includes(policiesSearch.toLowerCase())) ||
      (p.writing_company && p.writing_company.toLowerCase().includes(policiesSearch.toLowerCase())) ||
      (p.policy_type && p.policy_type.toLowerCase().includes(policiesSearch.toLowerCase()));

    const matchesStatus = !statusFilter || p.status === statusFilter;
    const matchesLob = !lobFilter || p.policy_type === lobFilter;
    const matchesCompany = !companyFilter || (p.writing_company === companyFilter || p.company_name === companyFilter);

    return matchesSearch && matchesStatus && matchesLob && matchesCompany;
  });

  return (
    <DashboardLayout>
      {['overview', 'personal-info', 'documents', 'notes', 'timeline', 'policies'].includes(activeTab) && client && (
        <HealthClientHeader
          clientId={clientId}
          clientName={personalForm.full_name || client.full_name || 'Client Profile'}
          photoUrl={(client as any).photo_url || null}
          lastUpdated={null}
          onSendEmail={() => {
            const email = personalForm.email || client.email;
            if (email) window.location.href = `mailto:${email}`;
            else alert('No email address registered for this client.');
          }}
          onConsent={() => handleTabChange('consents')}
          onDeleteProfile={() => {
            setDeleteClientError(null);
            setIsDeleteClientModalOpen(true);
          }}
          isCompanyClient={isCompanyClient}
          activeSection={
            activeTab === 'personal-info' ? 'personal-information' : (activeTab as any)
          }
        />
      )}
      <CrmPageContainer className={isModernClientWorkspace ? "px-4 py-6 md:px-8 md:py-8" : ""}>
        {/* Navigation Breadcrumb */}
        {!isModernClientWorkspace && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link href="/clients" className="hover:text-blue-600 transition-colors">Clients</Link>
            <span>/</span>
            <span className="text-slate-800 font-semibold">{loadingClient ? 'Loading...' : client?.full_name}</span>
          </div>
        )}

        {loadingClient ? (
          <div className="flex justify-center items-center py-20 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            
            {/* Left Sidebar Summary */}
            {!isOperationalWorkspace && (
              <CollapsibleSidebar title="Client Profile">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {isCompanyClient ? 'Company Profile' : 'Client Profile'}
                    </span>
                    <h2 className="text-2xl font-extrabold text-slate-900 mt-1 truncate">
                      {loadingClient ? 'Loading...' : (client?.full_name || personalInfo?.full_name || '-')}
                    </h2>
                  </div>
                </div>

              <div className="border-t border-slate-100 pt-5 space-y-4">
                {isCompanyClient && (
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact Person</span>
                    <span className="text-sm font-semibold text-slate-800 block mt-1">{personalInfo?.full_name || '-'}</span>
                  </div>
                )}
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Agent</span>
                  <span className="text-sm font-semibold text-slate-800 block mt-1">{getAgentDisplayName()}</span>
                </div>

                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Email Address</span>
                  {(() => {
                    if (loadingClient || loadingPersonal) {
                      return <span className="text-sm font-semibold text-slate-400 block mt-1">Loading...</span>;
                    }
                    const resolvedEmail = (personalInfo?.email && personalInfo.email.trim().length > 0)
                      ? personalInfo.email.trim()
                      : ((client?.email && client.email.trim().length > 0) ? client.email.trim() : '-');

                    return (
                      <a
                        href={resolvedEmail !== '-' ? `mailto:${resolvedEmail}` : '#'}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline block mt-1 truncate"
                      >
                        {resolvedEmail}
                      </a>
                    );
                  })()}
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone Number</span>
                  {(() => {
                    if (loadingClient || loadingPersonal) {
                      return <span className="text-sm font-semibold text-slate-400 block mt-1">Loading...</span>;
                    }
                    const resolvedPhone = (personalInfo?.phone && personalInfo.phone.trim().length > 0)
                      ? personalInfo.phone.trim()
                      : ((client?.phone && client.phone.trim().length > 0) ? client.phone.trim() : '-');

                    return (
                      <a
                        href={resolvedPhone !== '-' ? `tel:${resolvedPhone}` : '#'}
                        className="text-sm font-semibold text-slate-800 hover:text-blue-600 block mt-1"
                      >
                        {resolvedPhone}
                      </a>
                    );
                  })()}
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Address</span>
                  {(() => {
                    if (loadingClient || loadingResidence) {
                      return <span className="text-sm font-medium text-slate-400 block mt-1">Loading...</span>;
                    }
                    const resParts = [residenceInfo?.address, residenceInfo?.city, residenceInfo?.state || residenceInfo?.county, residenceInfo?.zip_code]
                      .filter(Boolean).map(s => String(s).trim()).filter(Boolean);
                    const clientAddress = client?.address?.trim();

                    const resolvedAddress = resParts.length > 0
                      ? resParts.join(', ')
                      : (clientAddress || '-');

                    return (
                      <span className="text-sm font-medium text-slate-700 block mt-1 leading-relaxed">
                        {resolvedAddress}
                      </span>
                    );
                  })()}
                </div>

                {personalInfo?.has_co_applicant === true && (
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Co-Applicant</span>
                    {loadingCoApplicant && !coApplicantInfo ? (
                      <div className="animate-pulse space-y-2">
                        <div className="h-3 bg-slate-100 rounded w-24"></div>
                        <div className="h-3 bg-slate-100 rounded w-32"></div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Name</span>
                          <span className="text-sm font-semibold text-slate-800 block mt-0.5">{coApplicantInfo?.full_name || '-'}</span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Email</span>
                          <a href={coApplicantInfo?.primary_email ? `mailto:${coApplicantInfo.primary_email}` : '#'} className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline block mt-0.5 truncate">
                            {coApplicantInfo?.primary_email || '-'}
                          </a>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone</span>
                          <a href={coApplicantInfo?.primary_phone ? `tel:${coApplicantInfo.primary_phone}` : '#'} className="text-sm font-semibold text-slate-800 hover:text-blue-600 block mt-0.5">
                            {coApplicantInfo?.primary_phone || '-'}
                          </a>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Company Search & Linking Block for Personal Profiles (Excluded from Documents and Notes views) */}
                {!isCompanyClient && activeTab !== 'documents' && activeTab !== 'notes' && (
                  <div className="border-t border-slate-100 pt-4 space-y-3 font-sans">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Link Company</span>
                    <div className="relative">
                      <input
                        type="text"
                        value={companySearchQuery}
                        onChange={(e) => handleCompanySearchChange(e.target.value)}
                        placeholder="Search companies..."
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none transition-all"
                      />
                      {searchingCompanies && (
                        <div className="absolute right-2.5 top-2.5">
                          <svg className="animate-spin h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {linkSuccessMsg && (
                      <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-[11px] font-semibold">
                        {linkSuccessMsg}
                      </div>
                    )}

                    {companySearchError && (
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 text-[11px]">
                        {companySearchError}
                      </div>
                    )}

                    {companySearchQuery.trim() !== '' && (
                      <div className="bg-white border border-slate-200 rounded-xl shadow-md p-2 space-y-2 max-h-56 overflow-y-auto">
                        {companySearchResults.length === 0 && !searchingCompanies ? (
                          <div className="text-xs text-slate-400 py-2 text-center">No companies found</div>
                        ) : (
                          companySearchResults.map((comp) => (
                            <div key={comp.id} className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between gap-2 border border-slate-100">
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold text-slate-800 truncate">{comp.agency_name || comp.full_name}</div>
                                {(comp.email || comp.phone || comp.ein) && (
                                  <div className="text-[10px] text-slate-500 truncate">
                                    {comp.email || comp.phone || (comp.ein ? `EIN: ${comp.ein}` : '')}
                                  </div>
                                )}
                              </div>

                              {comp.linkStatus === 'current' ? (
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-md">
                                  Linked
                                </span>
                              ) : comp.linkStatus === 'other' ? (
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md" title="Linked to another client">
                                  Unavailable
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={linkingCompanyId === comp.id}
                                  onClick={() => handleLinkCompany(comp)}
                                  className="text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] px-2 py-1 rounded-lg transition-all shadow-2xs disabled:opacity-50 flex-shrink-0"
                                >
                                  {linkingCompanyId === comp.id ? 'Linking...' : 'Link Company'}
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Persistent LINKED COMPANY Cards in Sidebar (Excluded from Documents and Notes views) */}
                {!isCompanyClient && activeTab !== 'documents' && activeTab !== 'notes' && (
                  <div className="border-t border-slate-100 pt-4 space-y-3 font-sans">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {linkedCompanyProfiles && linkedCompanyProfiles.length > 1 ? 'Linked Companies' : 'Linked Company'}
                    </span>
                    {linkedCompanyProfiles && linkedCompanyProfiles.length > 0 ? (
                      linkedCompanyProfiles.map((comp) => (
                        <div key={comp.id} className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
                          <div className="font-extrabold text-slate-900 text-sm truncate">{comp.agency_name || comp.full_name}</div>
                          <div className="text-xs font-semibold text-slate-600">
                            Commercial P&C Policies: <strong className="text-slate-900 font-extrabold">{comp.policyCount}</strong>
                          </div>
                          <Link
                            href={`/clients/${comp.id}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline pt-0.5"
                          >
                            View Company Profile
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-400 italic">
                        No companies linked.
                      </div>
                    )}
                  </div>
                )}

                {/* DOCUMENT SUMMARY Card (Rendered ONLY for activeTab === 'documents') */}
                {activeTab === 'documents' && (
                  <div className="border-t border-slate-100 pt-4 space-y-3 font-sans">
                    <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Document Summary
                    </span>
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Health</span>
                        <span className="font-extrabold text-slate-900">{clientDocsList.filter((d) => d.source === 'health').length}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Medicare</span>
                        <span className="font-extrabold text-slate-900">{clientDocsList.filter((d) => (d.source as string) === 'medicare').length}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Supplemental</span>
                        <span className="font-extrabold text-slate-900">{clientDocsList.filter((d) => (d.source as string) === 'supplemental').length}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Life</span>
                        <span className="font-extrabold text-slate-900">{clientDocsList.filter((d) => d.source === 'life').length}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Property & Casualty</span>
                        <span className="font-extrabold text-slate-900">{clientDocsList.filter((d) => d.source === 'property_casualty').length}</span>
                      </div>
                      {clientDocsList.filter((d) => !['health', 'medicare', 'supplemental', 'life', 'property_casualty'].includes(d.source || '')).length > 0 && (
                        <div className="flex items-center justify-between text-slate-600 font-semibold">
                          <span>General</span>
                          <span className="font-extrabold text-slate-900">{clientDocsList.filter((d) => !['health', 'medicare', 'supplemental', 'life', 'property_casualty'].includes(d.source || '')).length}</span>
                        </div>
                      )}
                      <div className="border-t border-slate-200/80 pt-2 flex items-center justify-between font-extrabold text-slate-900 text-xs">
                        <span>TOTAL</span>
                        <span className="text-blue-600">{clientDocsList.length}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* NOTES SUMMARY Card (Rendered ONLY for activeTab === 'notes') */}
                {activeTab === 'notes' && (
                  <div className="border-t border-slate-100 pt-4 space-y-3 font-sans">
                    <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Notes Summary
                    </span>
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Health</span>
                        <span className="font-extrabold text-slate-900">{notesSummaryList.filter((n) => n.category === 'health').length}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Medicare</span>
                        <span className="font-extrabold text-slate-900">{notesSummaryList.filter((n) => n.category === 'medicare').length}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Supplemental</span>
                        <span className="font-extrabold text-slate-900">{notesSummaryList.filter((n) => n.category === 'supplemental').length}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Life</span>
                        <span className="font-extrabold text-slate-900">{notesSummaryList.filter((n) => n.category === 'life').length}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 font-semibold">
                        <span>Property & Casualty</span>
                        <span className="font-extrabold text-slate-900">{notesSummaryList.filter((n) => n.category === 'property_casualty').length}</span>
                      </div>
                      {notesSummaryList.filter((n) => !['health', 'medicare', 'supplemental', 'life', 'property_casualty'].includes(n.category || '')).length > 0 && (
                        <div className="flex items-center justify-between text-slate-600 font-semibold">
                          <span>General</span>
                          <span className="font-extrabold text-slate-900">{notesSummaryList.filter((n) => !['health', 'medicare', 'supplemental', 'life', 'property_casualty'].includes(n.category || '')).length}</span>
                        </div>
                      )}
                      <div className="border-t border-slate-200/80 pt-2 flex items-center justify-between font-extrabold text-slate-900 text-xs">
                        <span>TOTAL</span>
                        <span className="text-blue-600">{notesSummaryList.length}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Persistent LINKED PERSONAL CONTACT Card in Sidebar (for Company Profiles) */}
                {isCompanyClient && (
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Linked Personal Contact</span>
                    {linkedPersonalContact ? (
                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
                        <div className="font-extrabold text-slate-900 text-sm truncate">{linkedPersonalContact.full_name}</div>
                        <div className="text-xs text-slate-600 space-y-1">
                          <div>
                            <span className="text-slate-400">Email: </span>
                            {linkedPersonalContact.email ? (
                              <a href={`mailto:${linkedPersonalContact.email}`} className="text-blue-600 font-semibold hover:underline">
                                {linkedPersonalContact.email}
                              </a>
                            ) : (
                              '—'
                            )}
                          </div>
                          <div>
                            <span className="text-slate-400">Phone: </span>
                            <span className="font-semibold text-slate-800">
                              {linkedPersonalContact.phone || '—'}
                            </span>
                          </div>
                        </div>
                        <Link
                          href={`/clients/${linkedPersonalContact.id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline pt-1"
                        >
                          View Client Profile →
                        </Link>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 font-medium bg-slate-50 border border-slate-150 rounded-xl p-3">
                        No personal client linked.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CollapsibleSidebar>
          )}

            {/* Main Area */}
            <div className="flex-1 w-full space-y-6">
                        {/* Tabs and Actions bar */}
              {!isModernClientWorkspace && (
                <div className="crm-card p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1 border-b sm:border-b-0 border-[#E8ECF2] pb-2 sm:pb-0">
                      <button
                        onClick={() => handleTabChange('overview')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          (activeTab as string) === 'overview'
                            ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold'
                            : 'text-[#556176] hover:bg-[#F8FAFC] hover:text-[#172033]'
                        }`}
                      >
                        Overview
                      </button>
                      <button
                        onClick={() => handleTabChange('personal-info')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          (activeTab as string) === 'personal-info'
                            ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold'
                            : 'text-[#556176] hover:bg-[#F8FAFC] hover:text-[#172033]'
                        }`}
                      >
                        {isCompanyClient ? 'Company Information' : 'Personal Info'}
                      </button>
                      {isLineEnabled('property_casualty') && (
                        <button
                          onClick={() => handleTabChange('policies')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            (activeTab as string) === 'policies'
                              ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold'
                              : 'text-[#556176] hover:bg-[#F8FAFC] hover:text-[#172033]'
                          }`}
                        >
                          Property & Casualty
                        </button>
                      )}
                      {!isCompanyClient && isLineEnabled('life') && (
                        <button
                          onClick={() => handleTabChange('life')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            (activeTab as string) === 'life'
                              ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold'
                              : 'text-[#556176] hover:bg-[#F8FAFC] hover:text-[#172033]'
                          }`}
                        >
                          Life
                        </button>
                      )}
                      {isLineEnabled('health') && (
                        <button
                          onClick={() => handleTabChange('health')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            (activeTab as string) === 'health'
                              ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold'
                              : 'text-[#556176] hover:bg-[#F8FAFC] hover:text-[#172033]'
                          }`}
                        >
                          Health
                        </button>
                      )}
                      {isLineEnabled('medicare') && (
                        <button
                          onClick={() => handleTabChange('medicare')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            (activeTab as string) === 'medicare'
                              ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold'
                              : 'text-[#556176] hover:bg-[#F8FAFC] hover:text-[#172033]'
                          }`}
                        >
                          Medicare
                        </button>
                      )}
                      {isLineEnabled('supplemental') && (
                        <button
                          onClick={() => handleTabChange('supplemental')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            (activeTab as string) === 'supplemental'
                              ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold'
                              : 'text-[#556176] hover:bg-[#F8FAFC] hover:text-[#172033]'
                          }`}
                        >
                          Supplemental
                        </button>
                      )}
                      <button
                        onClick={() => handleTabChange('documents')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          (activeTab as string) === 'documents'
                            ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold'
                            : 'text-[#556176] hover:bg-[#F8FAFC] hover:text-[#172033]'
                        }`}
                      >
                        Documents
                      </button>
                      <button
                        onClick={() => handleTabChange('notes')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          (activeTab as string) === 'notes'
                            ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold'
                            : 'text-[#556176] hover:bg-[#F8FAFC] hover:text-[#172033]'
                        }`}
                      >
                        Notes
                      </button>
                      <button
                        onClick={() => handleTabChange('timeline')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          (activeTab as string) === 'timeline'
                            ? 'bg-[#EEF4FF] text-[#2563EB] font-semibold'
                            : 'text-[#556176] hover:bg-[#F8FAFC] hover:text-[#172033]'
                        }`}
                      >
                        Timeline
                      </button>
                    </div>
                    
                    {(activeTab as string) === 'policies' && policies.length > 0 && (
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/clients/${clientId}/policies/new`}
                          className="crm-btn-primary text-xs px-3 py-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                          </svg>
                          Add Policy
                        </Link>
                      </div>
                    )}
                </div>
              )}

              {/* OVERVIEW TAB CONTENT (Concise Read-only Dashboard) */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {loadingPolicies ? (
                    <div className="flex justify-center items-center py-20 bg-white border border-slate-100 rounded-2xl shadow-sm">
                      <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  ) : (
                    <>
                      {/* Summary Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {/* Active Policies Card */}
                        <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-2xl p-6 shadow-sm flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Active Policies</span>
                            <span className="block text-3xl font-extrabold text-emerald-800 mt-2">{activeCount}</span>
                          </div>
                          <div className="p-3 bg-emerald-100/50 rounded-xl text-emerald-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          </div>
                        </div>

                        {/* Expiring Soon Card */}
                        <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-100 rounded-2xl p-6 shadow-sm flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Expiring Soon (60d)</span>
                            <span className="block text-3xl font-extrabold text-amber-800 mt-2">{expiringSoonCount}</span>
                          </div>
                          <div className="p-3 bg-amber-100/50 rounded-xl text-amber-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>

                        {/* Pending Policies Card */}
                        <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-2xl p-6 shadow-sm flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Pending Policies</span>
                            <span className="block text-3xl font-extrabold text-blue-800 mt-2">{pendingCount}</span>
                          </div>
                          <div className="p-3 bg-blue-100/50 rounded-xl text-blue-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Consolidated Overview Policies Section */}
                      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4 font-sans">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                          <div>
                            <h4 className="text-base font-extrabold text-slate-900">Active Client Policies</h4>
                            <p className="text-xs text-slate-400">Consolidated policies across Health, Property & Casualty, and Life Insurance</p>
                          </div>
                          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                            {consolidatedOverviewCards.length} Total Policy / Policies
                          </span>
                        </div>

                        {consolidatedOverviewCards.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-xl">
                            No policies recorded for this client yet.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {consolidatedOverviewCards.map((card) => (
                              <div
                                key={card.id}
                                className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-300 transition-all"
                              >
                                <div className="space-y-1.5 min-w-0 flex-1">
                                  {/* Badges */}
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
                                      {card.businessLineLabel}
                                    </span>
                                    <span
                                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                        card.status === 'Active'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                          : card.status === 'Cancelled'
                                          ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                          : 'bg-amber-50 text-amber-700 border border-amber-100'
                                      }`}
                                    >
                                      {card.status}
                                    </span>
                                    <span className="font-extrabold text-slate-900 text-sm">
                                      {card.policy_type} {card.policy_number !== 'N/A' ? '| #' + card.policy_number : ''}
                                    </span>
                                  </div>

                                  {/* Information Row: Company, Dates, Premium, Policy Address */}
                                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-slate-500 font-medium">
                                    <div>
                                      Carrier/Company: <strong className="text-slate-800 font-semibold">{card.company_name}</strong>
                                    </div>
                                    {card.effective_date && (
                                      <div>
                                        Term: <strong className="text-slate-800 font-semibold">{formatIsoToUsDate(card.effective_date)} {card.expiration_date ? 'to ' + formatIsoToUsDate(card.expiration_date) : ''}</strong>
                                      </div>
                                    )}
                                    {card.premium > 0 && (
                                      <div>
                                        Premium: <strong className="text-emerald-600 font-semibold">{formatCurrency(card.premium)}</strong>
                                      </div>
)}
                                    <div>
                                      Policy Address: <strong className="text-slate-800 font-semibold">{card.effectiveAddress}</strong>
                                    </div>
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-3 justify-end flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (card.targetTab === 'supplemental') {
                                        router.push(`/clients/${clientId}?section=supplemental&policy=${card.id}`);
                                      } else {
                                        handleTabChange(card.targetTab);
                                        setTimeout(() => {
                                          const targetEl = document.getElementById('life-policy-' + card.id) || document.getElementById('policy-' + card.id);
                                          if (targetEl) {
                                            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          }
                                        }, 150);
                                      }
                                    }}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white border border-slate-200 hover:border-indigo-200 px-4 py-2 rounded-xl shadow-xs transition-all flex items-center gap-1"
                                  >
                                    View Policy
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {linkedCompanyPolicies.length > 0 && (
                        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                            <div className="flex items-center gap-2">
                              <h4 className="text-base font-extrabold text-slate-900">Linked Company Policies</h4>
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                                {linkedCompanyPolicies.length}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {linkedCompanyPolicies.map((policy) => (
                              <div
                                key={policy.id}
                                className="bg-gradient-to-r from-red-600 to-rose-600 border border-rose-700 rounded-xl p-4 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                              >
                                <div className="space-y-2 min-w-0 flex-1">
                                  {/* Line 1: Badges & Title */}
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-white text-rose-700">
                                      Company Policy
                                    </span>
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                      {policy.status || 'Active'}
                                    </span>
                                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-rose-800/60 text-rose-100">
                                      Role: {policy.link_role === 'co_applicant' ? 'Co-Applicant' : 'Main Applicant'}
                                    </span>
                                  </div>

                                  <div className="font-extrabold text-white text-sm">
                                    {policy.client?.full_name ? `${policy.client.full_name} | ` : ''}
                                    {policy.policy_type}
                                    {policy.policy_subtype ? ` (${policy.policy_subtype})` : ''}
                                    {policy.policy_number ? ` | ${policy.policy_number}` : ''}
                                  </div>

                                  {/* Details */}
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-rose-100 border-t border-white/10 pt-2">
                                    <div>
                                      <span className="text-rose-200">Company: </span>
                                      <strong className="text-white">{policy.writing_company ?? policy.company_name ?? 'Company not specified'}</strong>
                                    </div>
                                    <div>
                                      <span className="text-rose-200">Term: </span>
                                      <strong className="text-white">
                                        {policy.effective_date && policy.expiration_date
                                          ? `${formatIsoToUsDate(policy.effective_date)} to ${formatIsoToUsDate(policy.expiration_date)}`
                                          : 'Not provided'}
                                      </strong>
                                    </div>
                                    <div>
                                      <span className="text-rose-200">Premium: </span>
                                      <strong className="text-white">{formatCurrency(policy.total_premium ?? policy.premium ?? 0)}</strong>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 sm:justify-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedUnlinkPolicy(policy);
                                      setUnlinkError(null);
                                      setIsConfirmUnlinkOpen(true);
                                    }}
                                    className="text-xs font-bold text-white bg-white/20 hover:bg-white/30 border border-white/30 px-3.5 py-2 rounded-lg transition-all shadow-xs"
                                  >
                                    Unlink
                                  </button>
                                  <Link
                                    href={`/clients/${policy.client_id}/policies/${policy.id}`}
                                    className="text-xs font-bold text-rose-700 bg-white hover:bg-rose-50 px-4 py-2 rounded-lg shadow-sm transition-all"
                                  >
                                    View Policy
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* POLICIES TAB CONTENT (Functional list, edit/delete actions, search/filters, details table) */}
              {activeTab === 'policies' && (
                !isLineEnabled('property_casualty') ? (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-8 text-center space-y-3 font-sans">
                    <h4 className="text-lg font-bold text-white">Module Access Restricted</h4>
                    <p className="text-sm text-slate-300">The <strong>Property & Casualty</strong> module is disabled for your agent profile.</p>
                  </div>
                ) : (
                <div className="space-y-6">

                  {/* Policies Search and Filter Section */}
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
                    {/* Search Input */}
                    <div className="w-full md:w-1/4 relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        value={policiesSearch}
                        onChange={e => setPoliciesSearch(e.target.value)}
                        placeholder="Search policy, company, LOB..."
                        className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-9 pr-4 py-2.5 text-slate-800 placeholder-slate-400 text-xs outline-none transition-all"
                      />
                    </div>

                    {/* Filter Selects */}
                    <div className="w-full md:w-auto flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                      {/* Status Filter */}
                      <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-slate-700 text-xs outline-none transition-all"
                      >
                        <option value="">All Statuses</option>
                        <option value="Active">Active</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="Expired">Expired</option>
                        <option value="Pending">Pending</option>
                      </select>

                      {/* LOB Filter */}
                      <select
                        value={lobFilter}
                        onChange={e => setLobFilter(e.target.value)}
                        className="bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-slate-705 text-xs outline-none transition-all max-w-[180px]"
                      >
                        <option value="">All Lines of Business</option>
                        {uniqueLobs.map(lob => (
                          <option key={lob} value={lob}>{lob}</option>
                        ))}
                      </select>

                      {/* Company Filter */}
                      <select
                        value={companyFilter}
                        onChange={e => setCompanyFilter(e.target.value)}
                        className="bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-slate-705 text-xs outline-none transition-all max-w-[180px]"
                      >
                        <option value="">All Companies</option>
                        {uniqueCompanies.map(company => (
                          <option key={company} value={company}>{company}</option>
                        ))}
                      </select>

                      {/* Clear Filters Button */}
                      {(policiesSearch || statusFilter || lobFilter || companyFilter) && (
                        <button
                          type="button"
                          onClick={() => {
                            setPoliciesSearch('');
                            setStatusFilter('');
                            setLobFilter('');
                            setCompanyFilter('');
                          }}
                          className="text-[10px] font-bold text-rose-600 hover:text-rose-800 transition-colors mr-2"
                        >
                          Clear Filters
                        </button>
                      )}

                      {/* Add Policy Button */}
                      <button
                        type="button"
                        onClick={handleOpenAddPolicy}
                        className="crm-btn-primary text-xs px-4 py-2 flex items-center gap-1.5 shadow-sm font-bold flex-shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                        </svg>
                        <span>+ Add Policy</span>
                      </button>
                    </div>
                  </div>

                  {loadingPolicies ? (
                    <div className="flex justify-center items-center py-20 bg-white border border-slate-100 rounded-2xl shadow-sm">
                      <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  ) : filteredPolicies.length === 0 ? (
                    <div className="text-center py-16 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-4">
                      <svg className="w-12 h-12 text-slate-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <h3 className="text-base font-semibold text-slate-800">
                        {policies.length === 0 ? 'No policies registered' : 'No matching policies found'}
                      </h3>
                      <p className="text-slate-400 text-sm max-w-sm mx-auto">
                        {policies.length === 0 
                          ? 'Configure active or expired insurance policies for this client.' 
                          : 'Try modifying your search or filter keywords.'}
                      </p>
                      {policies.length === 0 && (
                        <div>
                          <Link
                            href={`/clients/${clientId}/policies/new`}
                            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                            </svg>
                            Add Policy
                          </Link>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* COMPACT OPERATIONAL TABLE */
                    <div className="overflow-x-auto border border-slate-100 rounded-2xl bg-white shadow-sm">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                            <th className="p-4">Status</th>
                            <th className="p-4">Line of Business</th>
                            <th className="p-4">Policy Number</th>
                            <th className="p-4">Company</th>
                            <th className="p-4">Effective Date</th>
                            <th className="p-4">Expiration Date</th>
                            <th className="p-4 text-right">Premium</th>
                            <th className="p-4 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {filteredPolicies.map((policy) => {
                            const companyDisplay = policy.writing_company ?? policy.company_name ?? '-';
                            return (
                              <tr
                                key={policy.id}
                                onClick={() => router.push(`/clients/${clientId}/policies/${policy.id}`)}
                                className="hover:bg-slate-50/50 cursor-pointer transition-colors group"
                              >
                                <td className="p-4 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    policy.status === 'Active'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                      : policy.status === 'Cancelled'
                                      ? 'bg-rose-50 text-rose-700 border-rose-100'
                                      : policy.status === 'Expired'
                                      ? 'bg-slate-50 text-slate-650 border-slate-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-100'
                                  }`}>
                                    {policy.status || 'Active'}
                                  </span>
                                </td>
                                <td className="p-4 font-bold text-slate-800 whitespace-nowrap">
                                  <div>{policy.policy_type}{policy.policy_subtype ? ` (${policy.policy_subtype})` : ''}</div>
                                  <div className="mt-1 text-[11px] font-normal text-slate-500">
                                    <span className="font-semibold text-slate-400">Policy Address:</span>{' '}
                                    <span className="text-slate-700 font-medium">
                                      {resolvePolicyAddress(
                                        { address: policy.address, city: policy.city, state: policy.state, zip_code: policy.zip_code },
                                        residenceInfo,
                                        client
                                      )}
                                    </span>
                                  </div>
                                  {policy.linkedPersonalClient && (
                                    <div className="mt-1 flex items-center gap-2 text-[10px] font-normal text-slate-600 bg-slate-100/90 border border-slate-200/80 px-2 py-1 rounded-md max-w-md" onClick={(e) => e.stopPropagation()}>
                                      <span className="font-bold text-slate-700 truncate">Linked: {policy.linkedPersonalClient.full_name}</span>
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-white text-slate-700 border border-slate-200 flex-shrink-0">
                                        {policy.linkedPersonalClient.role === 'co_applicant' ? 'Co-App' : 'Main App'}
                                      </span>
                                      <Link
                                        href={`/clients/${policy.linkedPersonalClient.id}`}
                                        className="ml-auto font-bold text-blue-600 hover:text-blue-800 hover:underline flex-shrink-0"
                                      >
                                        View Client Profile
                                      </Link>
                                    </div>
                                  )}
                                </td>
                                <td className="p-4 font-medium text-slate-600 whitespace-nowrap">
                                  {policy.policy_number || '-'}
                                </td>
                                <td className="p-4 text-slate-600 whitespace-nowrap">
                                  {companyDisplay}
                                </td>
                                <td className="p-4 text-slate-500 whitespace-nowrap">
                                  {policy.effective_date ? formatIsoToUsDate(policy.effective_date) : '-'}
                                </td>
                                <td className="p-4 text-slate-500 whitespace-nowrap">
                                  {policy.expiration_date ? formatIsoToUsDate(policy.expiration_date) : '-'}
                                </td>
                                <td className="p-4 text-right font-bold text-slate-800 whitespace-nowrap">
                                  {formatCurrency(policy.total_premium ?? policy.premium)}
                                </td>
                                <td className="p-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-center gap-3">
                                    <Link
                                      href={`/clients/${clientId}/policies/${policy.id}`}
                                      className="text-blue-600 hover:text-blue-800 font-bold"
                                    >
                                      View
                                    </Link>
                                    <Link
                                      href={`/clients/${clientId}/policies/${policy.id}`}
                                      className="text-slate-500 hover:text-slate-800 font-bold"
                                    >
                                      Edit
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={(e) => handleDeletePolicy(policy.id, e)}
                                      className="text-rose-500 hover:text-rose-700 font-bold"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                )
              )}

              {/* PERSONAL INFO TAB CONTENT (ZOHO-STYLE CASCADING ACCORDION) */}
              {activeTab === 'personal-info' && (
                <div className="space-y-4 font-sans">
                  
                  {/* SECTION 1: Personal or Company Information Card */}
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 relative">
                    <div
                      onClick={() => setIsPersonalInfoOpen(!isPersonalInfoOpen)}
                      className="flex items-center justify-between border-b border-slate-100 pb-4 cursor-pointer select-none group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 group-hover:text-slate-700 transition-colors">
                          {isPersonalInfoOpen ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"/></svg>
                          )}
                        </span>
                        <div>
                          <h3 className="text-lg font-extrabold text-slate-900">
                            {isCompanyClient ? 'Company Information' : 'Personal Information'}
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {isCompanyClient ? 'Commercial P&C Entity Profile. Click any field to edit directly.' : 'Click any field to edit directly.'}
                          </p>
                        </div>
                      </div>
                      {isCompanyClient && (
                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-100">
                          Commercial Company
                        </span>
                      )}
                    </div>

                    {isPersonalInfoOpen && (
                      <div className="pt-6">
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
                        ) : isCompanyClient ? (
                          <div className="space-y-6">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-6">
                              {/* Left Column */}
                              <div className="space-y-4">
                                <InlineEditableText
                                  label="Company Name"
                                  value={client?.full_name || ''}
                                  onSave={async (val) => {
                                    if (!val.trim()) return;
                                    const { error } = await supabase.from('clients').update({ full_name: val.trim() }).eq('id', clientId);
                                    if (!error) setClient((prev: any) => prev ? { ...prev, full_name: val.trim() } : prev);
                                  }}
                                />

                                <InlineEditableText
                                  label="EIN (XX-XXXXXXX)"
                                  value={client?.ein ? formatEIN(client.ein) : ''}
                                  onSave={async (val) => {
                                    const formatted = formatEIN(val);
                                    const { error } = await supabase.from('clients').update({ ein: formatted.trim() || null }).eq('id', clientId);
                                    if (!error) setClient((prev: any) => prev ? { ...prev, ein: formatted.trim() || null } : prev);
                                  }}
                                />

                                <InlineEditableText
                                  label="Contact Person Name"
                                  value={personalForm.full_name || ''}
                                  onSave={val => savePersonalField('full_name', val)}
                                />

                                <InlineEditableText
                                  label="Primary Email"
                                  type="email"
                                  value={personalForm.email || client?.email || ''}
                                  onSave={async (val) => {
                                    await savePersonalField('email', val);
                                    await supabase.from('clients').update({ email: val || null }).eq('id', clientId);
                                  }}
                                />

                                <InlineEditablePhone
                                  label="Primary Phone"
                                  value={personalForm.phone || client?.phone || ''}
                                  onSave={async (val) => {
                                    await savePersonalField('phone', val);
                                    await supabase.from('clients').update({ phone: val || null }).eq('id', clientId);
                                  }}
                                />
                              </div>

                              {/* Right Column */}
                              <div className="space-y-4">
                                <InlineEditableText
                                  label="Secondary Email"
                                  type="email"
                                  value={personalForm.secondary_email || ''}
                                  onSave={val => savePersonalField('secondary_email', val)}
                                />

                                <InlineEditablePhone
                                  label="Secondary Phone"
                                  value={personalForm.secondary_phone || ''}
                                  onSave={val => savePersonalField('secondary_phone', val)}
                                />

                                <div>
                                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Business Address</span>
                                  <span className="font-semibold text-slate-700 block bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 min-h-[42px] flex items-center text-xs">
                                    {[residenceInfo?.address, residenceInfo?.city, residenceInfo?.state, residenceInfo?.zip_code].filter(Boolean).join(', ') || client?.address || 'No business address registered'}
                                  </span>
                                </div>
                              </div>
                            </div>
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
                                    { label: 'Select Marital Status', value: '' },
                                    { label: 'Single', value: 'Single' },
                                    { label: 'Married', value: 'Married' },
                                    { label: 'Divorced', value: 'Divorced' },
                                    { label: 'Widowed', value: 'Widowed' },
                                    { label: 'Separated', value: 'Separated' },
                                  ]}
                                  onSave={val => savePersonalField('marital_status', val)}
                                />

                                <InlineEditableSelect
                                  label="Preferred Language"
                                  value={personalForm.language_preference}
                                  options={[
                                    { label: 'Spanish', value: 'Spanish' },
                                    { label: 'English', value: 'English' },
                                    { label: 'Other', value: 'Other' },
                                  ]}
                                  onSave={val => savePersonalField('language_preference', val)}
                                />

                                <InlineEditableText
                                  label="Occupation"
                                  value={personalForm.occupation}
                                  onSave={val => savePersonalField('occupation', val)}
                                />

                                <InlineEditableSelect
                                  label="Immigration Status"
                                  value={personalForm.immigration_status}
                                  options={[
                                    { label: 'Select Status', value: '' },
                                    { label: 'US Citizen', value: 'US Citizen' },
                                    { label: 'Permanent Resident (Green Card)', value: 'Permanent Resident' },
                                    { label: 'Work Permit (EAD)', value: 'Work Permit' },
                                    { label: 'Other', value: 'Other' },
                                  ]}
                                  onSave={val => savePersonalField('immigration_status', val)}
                                />

                                {personalForm.immigration_status === 'Permanent Resident' && (
                                  <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 space-y-4 animate-fade-in">
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
                                      label="Other Description"
                                      value={personalForm.immigration_other_description}
                                      onSave={val => savePersonalField('immigration_other_description', val)}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Co-Applicant Section Toggle */}
                            <div className="border-t border-slate-100 pt-6">
                              <label className="flex items-center gap-3 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={personalForm.has_co_applicant}
                                  onChange={async (e) => {
                                    const checked = e.target.checked;
                                    setPersonalForm(prev => ({ ...prev, has_co_applicant: checked }));
                                    setPersonalInfo(prev => prev ? { ...prev, has_co_applicant: checked } : prev);
                                    await savePersonalField('has_co_applicant', checked);
                                    if (!checked) {
                                      await supabase.from('client_co_applicant_information').delete().eq('client_id', clientId);
                                      setCoApplicantInfo(null);
                                    } else {
                                      await fetchCoApplicantInformation();
                                    }
                                  }}
                                  className="w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500"
                                />
                                <span className="text-sm font-bold text-slate-800">Add Spouse / Co-Applicant</span>
                              </label>
                            </div>

                            {personalForm.has_co_applicant && (
                              <div className="border border-blue-100 rounded-2xl bg-blue-50/30 p-6 space-y-6 animate-fade-in">
                                <h4 className="text-base font-extrabold text-slate-900 border-b border-blue-100 pb-3">
                                  Spouse / Co-Applicant Information
                                </h4>

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
                                        { label: 'Select Marital Status', value: '' },
                                        { label: 'Single', value: 'Single' },
                                        { label: 'Married', value: 'Married' },
                                        { label: 'Divorced', value: 'Divorced' },
                                        { label: 'Widowed', value: 'Widowed' },
                                        { label: 'Separated', value: 'Separated' },
                                      ]}
                                      onSave={val => saveCoApplicantField('marital_status', val)}
                                    />

                                    <InlineEditableSelect
                                      label="Preferred Language"
                                      value={coApplicantForm.language_preference}
                                      options={[
                                        { label: 'Spanish', value: 'Spanish' },
                                        { label: 'English', value: 'English' },
                                        { label: 'Other', value: 'Other' },
                                      ]}
                                      onSave={val => saveCoApplicantField('language_preference', val)}
                                    />

                                    <InlineEditableText
                                      label="Occupation"
                                      value={coApplicantForm.occupation}
                                      onSave={val => saveCoApplicantField('occupation', val)}
                                    />

                                    <InlineEditableSelect
                                      label="Immigration Status"
                                      value={coApplicantForm.immigration_status}
                                      options={[
                                        { label: 'Select Status', value: '' },
                                        { label: 'US Citizen', value: 'US Citizen' },
                                        { label: 'Permanent Resident (Green Card)', value: 'Permanent Resident' },
                                        { label: 'Work Permit (EAD)', value: 'Work Permit' },
                                        { label: 'Other', value: 'Other' },
                                      ]}
                                      onSave={val => saveCoApplicantField('immigration_status', val)}
                                    />

                                    {coApplicantForm.immigration_status === 'Permanent Resident' && (
                                      <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 space-y-4 animate-fade-in">
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
                    )}
                  </div>

                  {/* SECTION 2: Residence Information Card */}
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 relative">
                    <div
                      onClick={() => setIsResidenceOpen(!isResidenceOpen)}
                      className="flex items-center justify-between border-b border-slate-100 pb-4 cursor-pointer select-none group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 group-hover:text-slate-700 transition-colors">
                          {isResidenceOpen ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"/></svg>
                          )}
                        </span>
                        <div>
                          <h3 className="text-lg font-extrabold text-slate-900">Residence Information</h3>
                          <p className="text-xs text-slate-400 mt-0.5">Click any field to edit directly.</p>
                        </div>
                      </div>
                    </div>

                    {isResidenceOpen && (
                      <div className="pt-6">
                        {loadingResidence ? (
                          <div className="flex justify-center items-center py-10">
                            <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          </div>
                        ) : (
                          <InlineEditableAddress
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
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {/* SECTION 3: Income Information moved canonically to Health workspace */}

                  {/* SECTION 4: Payment Information Card */}
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 relative font-sans">
                    <div
                      onClick={() => setIsPaymentInfoOpen(!isPaymentInfoOpen)}
                      className="flex items-center justify-between border-b border-slate-100 pb-4 cursor-pointer select-none group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 group-hover:text-slate-700 transition-colors">
                          {isPaymentInfoOpen ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"/></svg>
                          )}
                        </span>
                        <div>
                          <h3 className="text-lg font-extrabold text-slate-900 font-sans">Payment Information</h3>
                          <p className="text-xs text-slate-400 mt-0.5 font-sans">Manage auto pay, payment day, bank account, and card details.</p>
                        </div>
                      </div>
                    </div>

                    {isPaymentInfoOpen && (
                      <div className="pt-6">
                        {paymentInfoLoading ? (
                          <div className="flex justify-center items-center py-10">
                            <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          </div>
                        ) : (
                          <form onSubmit={handleSavePaymentInfo} className="space-y-6">
                            {paymentInfoError && (
                              <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-xs font-semibold text-rose-600 font-sans">
                                {paymentInfoError}
                              </div>
                            )}

                            {paymentInfoSuccess && (
                              <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-semibold text-emerald-700 font-sans">
                                {paymentInfoSuccess}
                              </div>
                            )}

                            {/* STATIC / COMMON FIELDS */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Auto Pay</label>
                                <div className="flex items-center gap-3 pt-1">
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={paymentAutoPay}
                                      onChange={(e) => setPaymentAutoPay(e.target.checked)}
                                      className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    <span className="ml-2 text-xs font-bold text-slate-700">
                                      {paymentAutoPay ? 'Enabled' : 'Disabled'}
                                    </span>
                                  </label>
                                </div>
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Payment Day</label>
                                <select
                                  value={paymentDayVal || ''}
                                  onChange={(e) => setPaymentDayVal(e.target.value === '' ? null : Number(e.target.value))}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-sans"
                                >
                                  <option value="">Select Day (1–31)...</option>
                                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                    <option key={day} value={day}>
                                      Day {day}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Associated Address</label>
                                <input
                                  type="text"
                                  value={paymentAddress}
                                  onChange={(e) => setPaymentAddress(e.target.value)}
                                  placeholder="e.g. 123 Main St, Miami, FL"
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-sans"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">A Nombre De (Holder Name)</label>
                                <input
                                  type="text"
                                  value={paymentHolderName}
                                  onChange={(e) => setPaymentHolderName(e.target.value)}
                                  placeholder="e.g. Account Holder Name"
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-sans"
                                />
                              </div>
                            </div>

                            <div className="border-t border-slate-100 pt-5 space-y-4">
                              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 font-sans">Payment Methods</h4>

                              {/* BANK ACCOUNT SUBSECTION */}
                              <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-4">
                                <div className="flex items-center justify-between">
                                  <label className="flex items-center gap-2.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={hasBankAccount}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setHasBankAccount(checked);
                                        if (!checked) {
                                          setBankName('');
                                          setBankRoutingNumber('');
                                          setBankAccountNumber('');
                                          setBankLast4('');
                                          setIsReplacingBank(false);
                                        }
                                      }}
                                      className="w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500"
                                    />
                                    <span className="text-sm font-bold text-slate-800 font-sans">Bank Account</span>
                                  </label>

                                  {hasBankAccount && bankLast4 && !isReplacingBank && (
                                    <button
                                      type="button"
                                      onClick={() => setIsReplacingBank(true)}
                                      className="text-xs font-bold text-blue-600 hover:text-blue-800 font-sans"
                                    >
                                      Replace Bank Details
                                    </button>
                                  )}
                                </div>

                                {hasBankAccount && (
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-200/60 animate-fade-in">
                                    <div>
                                      <label className="block text-xs font-bold text-slate-500 mb-1">Bank Name</label>
                                      <input
                                        type="text"
                                        value={bankName}
                                        onChange={(e) => setBankName(e.target.value)}
                                        placeholder="e.g. Chase Bank"
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 transition-all font-sans"
                                        required={hasBankAccount && !bankLast4}
                                      />
                                    </div>

                                    {bankLast4 && !isReplacingBank ? (
                                      <>
                                        <div>
                                          <label className="block text-xs font-bold text-slate-500 mb-1">Routing Number</label>
                                          <input
                                            type="text"
                                            value="•••••••••"
                                            disabled
                                            className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-500 font-mono"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-bold text-slate-500 mb-1">Account Number</label>
                                          <input
                                            type="text"
                                            value={`••••${bankLast4}`}
                                            disabled
                                            className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono font-bold"
                                          />
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <div>
                                          <label className="block text-xs font-bold text-slate-500 mb-1">Routing Number</label>
                                          <input
                                            type="text"
                                            value={bankRoutingNumber}
                                            onChange={(e) => setBankRoutingNumber(e.target.value)}
                                            placeholder="9-digit Routing Number"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 transition-all font-mono"
                                            required={hasBankAccount && (isReplacingBank || !bankLast4)}
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-bold text-slate-500 mb-1">Account Number</label>
                                          <input
                                            type="text"
                                            value={bankAccountNumber}
                                            onChange={(e) => setBankAccountNumber(e.target.value)}
                                            placeholder="Account Number"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 transition-all font-mono"
                                            required={hasBankAccount && (isReplacingBank || !bankLast4)}
                                          />
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* CARD SUBSECTION */}
                              <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-4">
                                <div className="flex items-center justify-between">
                                  <label className="flex items-center gap-2.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={hasCardMethod}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setHasCardMethod(checked);
                                        if (!checked) {
                                          setCardTypeVal('Debit');
                                          setCardNumberVal('');
                                          setCardLast4Val('');
                                          setCardExpMonth('');
                                          setCardExpYear('');
                                          setCardCvvVal('');
                                          setIsReplacingCard(false);
                                        }
                                      }}
                                      className="w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500"
                                    />
                                    <span className="text-sm font-bold text-slate-800 font-sans">Card</span>
                                  </label>

                                  {hasCardMethod && cardLast4Val && !isReplacingCard && (
                                    <button
                                      type="button"
                                      onClick={() => setIsReplacingCard(true)}
                                      className="text-xs font-bold text-blue-600 hover:text-blue-800 font-sans"
                                    >
                                      Replace Card
                                    </button>
                                  )}
                                </div>

                                {hasCardMethod && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-200/60 animate-fade-in">
                                    <div>
                                      <label className="block text-xs font-bold text-slate-500 mb-1">Card Type</label>
                                      <select
                                        value={cardTypeVal}
                                        onChange={(e) => setCardTypeVal(e.target.value as 'Debit' | 'Credit')}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 transition-all font-sans"
                                      >
                                        <option value="Debit">Debit</option>
                                        <option value="Credit">Credit</option>
                                      </select>
                                    </div>

                                    {cardLast4Val && !isReplacingCard ? (
                                      <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Card Number</label>
                                        <input
                                          type="text"
                                          value={`•••• •••• •••• ${cardLast4Val}`}
                                          disabled
                                          className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono font-bold"
                                        />
                                      </div>
                                    ) : (
                                      <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Card Number</label>
                                        <input
                                          type="text"
                                          value={cardNumberVal}
                                          onChange={(e) => setCardNumberVal(e.target.value)}
                                          placeholder="16-digit Card Number"
                                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 transition-all font-mono"
                                          required={hasCardMethod && (isReplacingCard || !cardLast4Val)}
                                        />
                                      </div>
                                    )}

                                    <div>
                                      <label className="block text-xs font-bold text-slate-500 mb-1">Expiration Date (MM/YYYY)</label>
                                      <div className="grid grid-cols-2 gap-2">
                                        <input
                                          type="text"
                                          value={cardExpMonth}
                                          onChange={(e) => setCardExpMonth(e.target.value)}
                                          placeholder="MM"
                                          maxLength={2}
                                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 transition-all font-sans text-center"
                                          required={hasCardMethod}
                                        />
                                        <input
                                          type="text"
                                          value={cardExpYear}
                                          onChange={(e) => setCardExpYear(e.target.value)}
                                          placeholder="YYYY"
                                          maxLength={4}
                                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 transition-all font-sans text-center"
                                          required={hasCardMethod}
                                        />
                                      </div>
                                    </div>

                                    <div>
                                      <label className="block text-xs font-bold text-slate-500 mb-1">
                                        CVV <span className="text-[10px] text-slate-400 font-normal">(Transient entry - never saved)</span>
                                      </label>
                                      <input
                                        type="password"
                                        value={cardCvvVal}
                                        onChange={(e) => setCardCvvVal(e.target.value)}
                                        placeholder="CVV"
                                        maxLength={4}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 transition-all font-mono text-center"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
                              <button
                                type="submit"
                                disabled={paymentInfoSaving}
                                className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-blue-500/10 font-sans"
                              >
                                {paymentInfoSaving ? 'Saving...' : 'Save Payment Information'}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'documents' && (
                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6 font-sans">
                  <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-4 gap-3">
                    <div>
                      <h3 className="text-lg font-extrabold text-slate-900 font-sans">Unified Document Center</h3>
                      <p className="text-xs text-slate-500 mt-1 font-sans">View and manage all general, policy, life, and health documents for this client.</p>
                    </div>
                    <button
                      onClick={() => {
                        setClientDocDisplayName('');
                        setClientDocDescription('');
                        setClientDocType('Identification');
                        setClientDocFile(null);
                        setClientDocError(null);
                        setIsClientDocModalOpen(true);
                      }}
                      className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10 font-sans"
                    >
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      Upload General Document
                    </button>
                  </div>

                  {/* Category Filter Chips */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 font-sans">
                    <button
                      type="button"
                      onClick={() => setDocFilterCategory('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        docFilterCategory === 'all'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      All ({clientDocsList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocFilterCategory('general')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        docFilterCategory === 'general'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      General ({clientDocsList.filter((d) => d.source === 'general').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocFilterCategory('property_casualty')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        docFilterCategory === 'property_casualty'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Property & Casualty ({clientDocsList.filter((d) => d.source === 'property_casualty').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocFilterCategory('life')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        docFilterCategory === 'life'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Life ({clientDocsList.filter((d) => d.source === 'life').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocFilterCategory('health')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        docFilterCategory === 'health'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Health ({clientDocsList.filter((d) => d.source === 'health').length})
                    </button>
                  </div>

                  {/* Client Documents List */}
                  {clientDocsLoading ? (
                    <div className="text-center py-12 text-xs text-slate-400 font-sans">Loading unified documents...</div>
                  ) : clientDocsList.length === 0 ? (
                    <div className="text-center py-12 px-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-3">
                      <svg className="w-10 h-10 text-slate-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6m-3-3v6m-9 1V4a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      </svg>
                      <p className="text-xs font-bold text-slate-600 font-sans">No documents uploaded for this client yet.</p>
                      <button
                        onClick={() => {
                          setClientDocDisplayName('');
                          setClientDocDescription('');
                          setClientDocType('Identification');
                          setClientDocFile(null);
                          setClientDocError(null);
                          setIsClientDocModalOpen(true);
                        }}
                        className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm font-sans"
                      >
                        Upload General Document
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {clientDocsList
                        .filter((doc) => docFilterCategory === 'all' || doc.source === docFilterCategory)
                        .map((doc) => (
                          <div key={`${doc.source}-${doc.id}`} className="py-3.5 flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1 flex items-start gap-3">
                              <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 mt-0.5 flex-shrink-0">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h5 className="font-bold text-slate-900 text-sm font-sans truncate">{doc.displayName}</h5>
                                  <span
                                    className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full tracking-wide uppercase font-sans ${
                                      doc.source === 'general'
                                        ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                        : doc.source === 'property_casualty'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                        : doc.source === 'life'
                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    }`}
                                  >
                                    {doc.sourceLabel}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5 font-sans">
                                  {doc.originalFilename} • {isoDateToMMDDYYYY(doc.createdAt)}
                                  {doc.sizeBytes ? ` • ${(doc.sizeBytes / 1024).toFixed(1)} KB` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handlePreviewUnifiedDoc(doc)}
                                className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors font-sans"
                              >
                                Preview
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const { data } = await supabase.storage.from(doc.bucket).createSignedUrl(doc.storagePath, 3600);
                                    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                                  } catch (err: any) {
                                    alert(`Failed to download document: ${err.message || err}`);
                                  }
                                }}
                                className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors font-sans"
                              >
                                Download
                              </button>
                              {doc.canDelete && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!confirm(`Are you sure you want to delete "${doc.displayName}"?`)) return;
                                    try {
                                      const { error: storageErr } = await supabase.storage.from(doc.bucket).remove([doc.storagePath]);
                                      if (storageErr) console.warn('Storage deletion warning:', storageErr);

                                      if (doc.source === 'general') {
                                        await supabase.from('client_documents').delete().eq('id', doc.id);
                                      } else if (doc.source === 'property_casualty') {
                                        await supabase.from('policy_documents').delete().eq('id', doc.id);
                                      } else if (doc.source === 'life') {
                                        await supabase.from('life_policy_documents').delete().eq('id', doc.id);
                                      } else if (doc.source === 'health') {
                                        await supabase.from('health_policy_documents').delete().eq('id', doc.id);
                                      }

                                      loadClientDocuments();
                                    } catch (err: any) {
                                      alert(`Failed to delete document: ${err.message || err}`);
                                    }
                                  }}
                                  className="text-xs font-bold text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-colors font-sans"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Upload Modal Dialog */}
                  {isClientDocModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
                      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <h3 className="text-base font-extrabold text-slate-900 font-sans">Upload New Client Document</h3>
                          <button
                            type="button"
                            onClick={() => setIsClientDocModalOpen(false)}
                            disabled={clientDocUploading}
                            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {clientDocError && (
                          <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-600 font-medium font-sans">
                            {clientDocError}
                          </div>
                        )}

                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!clientDocFile) return;
                            try {
                              setClientDocUploading(true);
                              setClientDocError(null);
                              const { data: { user } } = await supabase.auth.getUser();
                              if (!user) throw new Error('Not authenticated');

                              const cleanName = clientDocFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                              const storagePath = `${user.id}/clients/${clientId}/${Date.now()}-${cleanName}`;

                              const { error: uploadErr } = await supabase.storage
                                .from('policy-documents')
                                .upload(storagePath, clientDocFile, { upsert: false });

                              if (uploadErr) throw uploadErr;

                              const docTitle = clientDocDisplayName.trim() || clientDocFile.name;
                              await supabase
                                .from('client_documents')
                                .insert({
                                  client_id: clientId,
                                  agent_id: user.id,
                                  display_name: docTitle,
                                  document_type: clientDocType,
                                  description: clientDocDescription.trim() || null,
                                  original_filename: clientDocFile.name,
                                  storage_path: storagePath,
                                  mime_type: clientDocFile.type || null,
                                  size_bytes: clientDocFile.size,
                                });

                              setClientDocDisplayName('');
                              setClientDocDescription('');
                              setClientDocFile(null);
                              setIsClientDocModalOpen(false);
                              loadClientDocuments();
                            } catch (err: any) {
                              console.error('Upload error:', err);
                              setClientDocError(err?.message || 'Failed to upload document.');
                            } finally {
                              setClientDocUploading(false);
                            }
                          }}
                          className="space-y-4"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                            <div>
                              <label className="block font-bold text-slate-700 mb-1">Display Name</label>
                              <input
                                type="text"
                                value={clientDocDisplayName}
                                onChange={(e) => setClientDocDisplayName(e.target.value)}
                                placeholder="e.g. Drivers License"
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 font-sans"
                              />
                            </div>
                            <div>
                              <label className="block font-bold text-slate-700 mb-1">Document Type</label>
                              <select
                                value={clientDocType}
                                onChange={(e) => setClientDocType(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 font-sans"
                              >
                                <option value="Identification">Identification</option>
                                <option value="Application">Application</option>
                                <option value="Proof of Income">Proof of Income</option>
                                <option value="Correspondence">Correspondence</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                          </div>

                          <div className="font-sans">
                            <label className="block text-xs font-bold text-slate-700 mb-1">Description (Optional)</label>
                            <textarea
                              rows={2}
                              value={clientDocDescription}
                              onChange={(e) => setClientDocDescription(e.target.value)}
                              placeholder="Add context or notes..."
                              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 outline-none focus:border-blue-500 font-sans"
                            />
                          </div>

                          <div>
                            <FileDropzone
                              label="Drag files here or click to select"
                              multiple={false}
                              maxSizeBytes={20 * 1024 * 1024}
                              disabled={clientDocUploading}
                              selectedFiles={clientDocFile ? [clientDocFile] : []}
                              onFilesSelected={(files) => {
                                if (files.length > 0) {
                                  setClientDocFile(files[0]);
                                  if (!clientDocDisplayName) {
                                    setClientDocDisplayName(files[0].name.replace(/\.[^/.]+$/, ''));
                                  }
                                }
                              }}
                              onRemoveFile={() => setClientDocFile(null)}
                            />
                          </div>

                          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 font-sans">
                            <button
                              type="button"
                              disabled={clientDocUploading}
                              onClick={() => {
                                setIsClientDocModalOpen(false);
                                setClientDocFile(null);
                              }}
                              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={clientDocUploading || !clientDocFile}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow transition-all disabled:opacity-50"
                            >
                              {clientDocUploading ? 'Uploading...' : 'Upload Document'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* UNIFIED CRM NOTES CENTER */}
              {activeTab === 'notes' && (
                <UnifiedNotesManager
                  clientId={clientId}
                  policiesList={policies}
                  currentUserId={currentUserId}
                />
              )}

              {/*
                All the tab's logic lives in the component, so this monolith only
                gains a mount point rather than another inline section.
              */}
              {activeTab === 'consents' && client && (
                <ClientConsentsTab clientId={clientId} clientName={client.full_name} />
              )}

              {activeTab === 'timeline' && (() => {
                const filteredEvents = events.filter((evt: NormalizedTimelineEvent) => {
                  if (timelineFilter === 'policies') return evt.category === 'policies';
                  if (timelineFilter === 'notes') return evt.category === 'notes';
                  if (timelineFilter === 'documents') return evt.category === 'documents';
                  if (timelineFilter === 'consents') return evt.category === 'consents';
                  return true;
                });

                const groupEventsByDate = (eventsList: NormalizedTimelineEvent[]) => {
                  const groups: { [key: string]: NormalizedTimelineEvent[] } = {};
                  eventsList.forEach(evt => {
                    const dateStr = isoDateToMMDDYYYY(evt.created_at);
                    if (!groups[dateStr]) {
                      groups[dateStr] = [];
                    }
                    groups[dateStr].push(evt);
                  });
                  return groups;
                };

                const groupedEvents = groupEventsByDate(filteredEvents);
                const uniqueDates = Array.from(new Set(filteredEvents.map(evt => isoDateToMMDDYYYY(evt.created_at))));

                return (
                  <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6 font-sans">
                    {/* Timeline Header & Filters */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-50 pb-4 gap-4">
                      <h3 className="text-lg font-extrabold text-slate-900 font-sans">Client Activity Timeline</h3>
                      <div className="flex bg-slate-50 border border-slate-200/60 p-1 rounded-xl gap-1">
                        <button
                          type="button"
                          onClick={() => setTimelineFilter('all')}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            timelineFilter === 'all'
                              ? 'bg-white text-blue-600 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          All Activity
                        </button>
                        <button
                          type="button"
                          onClick={() => setTimelineFilter('policies')}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            timelineFilter === 'policies'
                              ? 'bg-white text-blue-600 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Policies
                        </button>
                        <button
                          type="button"
                          onClick={() => setTimelineFilter('notes')}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            timelineFilter === 'notes'
                              ? 'bg-white text-blue-600 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Notes
                        </button>
                        <button
                          type="button"
                          onClick={() => setTimelineFilter('documents')}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            timelineFilter === 'documents'
                              ? 'bg-white text-blue-600 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Documents
                        </button>
                        <button
                          type="button"
                          onClick={() => setTimelineFilter('consents')}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            timelineFilter === 'consents'
                              ? 'bg-white text-blue-600 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Consents
                        </button>
                      </div>
                    </div>

                    {/* Timeline Body */}
                    {eventsLoading ? (
                      <div className="py-16 text-center text-xs text-slate-400 font-sans">
                        Loading activity timeline...
                      </div>
                    ) : eventsError ? (
                      <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold">
                        {eventsError}
                      </div>
                    ) : filteredEvents.length === 0 ? (
                      <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl text-xs text-slate-400 font-sans">
                        No timeline events found for this filter.
                      </div>
                    ) : (
                      <div className="relative border-l border-slate-200 ml-3 pl-4 space-y-6">
                        {uniqueDates.map(dateStr => {
                          const dayEvents = groupedEvents[dateStr] || [];
                          return (
                            <div key={dateStr} className="space-y-3">
                              {/* Date Header */}
                              <div className="relative -ml-[23px] flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-white" />
                                <span className="text-[10px] font-bold text-slate-400 font-sans tracking-wider uppercase bg-white px-1">
                                  {dateStr}
                                </span>
                              </div>

                              {/* Events List */}
                              <div className="space-y-3">
                                {dayEvents.map(evt => (
                                  <div key={evt.id} className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-1.5 shadow-2xs hover:shadow-xs transition-all font-sans">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-50 text-blue-700 border border-blue-100">
                                          {evt.related_label}
                                        </span>
                                        <h4 className="text-xs font-extrabold text-slate-800">
                                          {evt.title}
                                        </h4>
                                      </div>
                                      <span className="text-[10px] font-bold text-slate-400">
                                        By {evt.actor_name}
                                      </span>
                                    </div>

                                    {evt.description && (
                                      <p className="text-xs text-slate-600 font-normal leading-relaxed">
                                        {evt.description}
                                      </p>
                                    )}

                                    <div className="pt-1 flex justify-end">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleTabChange(evt.target_tab as any);
                                          if (evt.target_policy_id) {
                                            setTimeout(() => {
                                              const targetEl = document.getElementById('life-policy-' + evt.target_policy_id) || document.getElementById('policy-' + evt.target_policy_id);
                                              if (targetEl) {
                                                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                              }
                                            }, 150);
                                          }
                                        }}
                                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-white border border-slate-200 px-2.5 py-1 rounded-lg hover:border-blue-200 transition-all flex items-center gap-1 shadow-2xs"
                                      >
                                        View Record
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {activeTab === 'life' && client && (() => {
                const isLifeOwner =
                  Boolean(client.agent_id) &&
                  Boolean(currentUserId) &&
                  (client.agent_id === currentUserId || client.agent_id === (agentProfile as any)?.id);

                if (!isLifeOwner) {
                  return (
                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-8 text-center space-y-3 font-sans">
                      <h4 className="text-lg font-bold text-rose-800">Private Owner Module</h4>
                      <p className="text-sm text-rose-600 font-medium">The <strong>Life</strong> module is private to the primary client owner.</p>
                    </div>
                  );
                }

                if (!isLineEnabled('life')) {
                  return (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-8 text-center space-y-3 font-sans">
                      <h4 className="text-lg font-bold text-white">Module Access Restricted</h4>
                      <p className="text-sm text-slate-300">The <strong>Life</strong> module is disabled for your agent profile.</p>
                    </div>
                  );
                }

                return (
                  <LifePolicyTab
                    clientId={clientId}
                    clientName={personalForm.full_name || client.full_name || 'Client Profile'}
                    photoUrl={(client as any).photo_url || null}
                    onSendEmail={() => {
                      const email = personalForm.email || client.email;
                      if (email) window.location.href = `mailto:${email}`;
                      else alert('No email address registered for this client.');
                    }}
                    onConsent={() => handleTabChange('consents')}
                    onDeleteProfile={() => {
                      setDeleteClientError(null);
                      setIsDeleteClientModalOpen(true);
                    }}
                    isCompanyClient={isCompanyClient}
                    initialSubtab={(searchParams.get('subtab') as any) || 'summary'}
                    onPoliciesChanged={() => { fetchPersonalInformation(); fetchOverviewPolicies(); }}
                  />
                );
              })()}

              {activeTab === 'health' && client && (
                <HealthPolicyTab
                  clientId={clientId}
                  agentName={getAgentDisplayName()}
                  currentUserId={currentUserId}
                  formatIsoToUsDate={formatIsoToUsDate}
                  clientName={personalForm.full_name || client.full_name || 'Client Profile'}
                  photoUrl={(client as any).photo_url || null}
                  lastUpdated={client.updated_at || client.created_at}
                  onSendEmail={() => {
                    const email = personalForm.email || client.email;
                    if (email) {
                      window.location.href = `mailto:${email}`;
                    } else {
                      alert('No email address registered for this client.');
                    }
                  }}
                  onConsent={() => {
                    handleTabChange('consents');
                  }}
                  onDeleteProfile={() => {
                    setDeleteClientError(null);
                    setIsDeleteClientModalOpen(true);
                  }}
                  isCompanyClient={isCompanyClient}
                />
              )}

              {activeTab === 'medicare' && client && (
                <MedicareTab
                  clientId={clientId}
                  clientName={personalForm.full_name || client.full_name || 'Client Profile'}
                  photoUrl={(client as any).photo_url || null}
                  lastUpdated={client.updated_at || client.created_at}
                  onSendEmail={() => {
                    const email = personalForm.email || client.email;
                    if (email) {
                      window.location.href = `mailto:${email}`;
                    } else {
                      alert('No email address registered for this client.');
                    }
                  }}
                  onConsent={() => {
                    handleTabChange('consents');
                  }}
                  onDeleteProfile={() => {
                    setDeleteClientError(null);
                    setIsDeleteClientModalOpen(true);
                  }}
                  isCompanyClient={isCompanyClient}
                  initialSubtab={(searchParams.get('subtab') as any) || 'summary'}
                  currentUserId={currentUserId}
                  onPolicyDeleted={() => fetchOverviewPolicies()}
                />
              )}

              {activeTab === 'supplemental' && client && (
                <SupplementalTab
                  clientId={clientId}
                  clientName={personalForm.full_name || client.full_name || 'Client Profile'}
                  photoUrl={(client as any).photo_url || null}
                  onSendEmail={() => {
                    const email = personalForm.email || client.email;
                    if (email) {
                      window.location.href = `mailto:${email}`;
                    } else {
                      alert('No email address registered for this client.');
                    }
                  }}
                  onConsent={() => {
                    handleTabChange('consents');
                  }}
                  onDeleteProfile={() => {
                    setDeleteClientError(null);
                    setIsDeleteClientModalOpen(true);
                  }}
                  isCompanyClient={isCompanyClient}
                  initialPolicyId={searchParams.get('policy')}
                  initialSubtab={(searchParams.get('subtab') as any) || 'summary'}
                  currentUserId={currentUserId}
                  onPolicyDeleted={() => fetchOverviewPolicies()}
                />
              )}
            </div>
          </div>
        )}
      </CrmPageContainer>

      {/* POLICY MODALS REMOVED */}

      {/* INCOME MODALS */}

      {/* DANGER ZONE */}
      {!isModernClientWorkspace && (
        <div className="mt-12 bg-rose-50 border border-rose-100 rounded-2xl p-6">
          <h3 className="text-rose-800 font-extrabold text-lg mb-2">Danger Zone</h3>
          <p className="text-rose-600/80 text-sm mb-6">
            Deleting this client is a permanent action and cannot be reversed. All data associated with this client will be permanently removed.
          </p>
          <button
            onClick={() => {
              setDeleteClientError(null);
              setIsDeleteClientModalOpen(true);
            }}
            className="text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 px-4 py-2.5 rounded-xl transition-all shadow-md shadow-rose-500/20"
          >
            Delete Client Profile
          </button>
        </div>
      )}

      {/* Delete Client Modal */}
      {isDeleteClientModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 md:p-8 w-full max-w-lg shadow-2xl animate-scale-up border border-slate-100 space-y-5">
            <div>
              <h3 className="text-xl font-extrabold text-rose-600">Delete Client Profile</h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                This will permanently delete the client and all associated data across all modules.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Target Client</span>
              <span className="text-base font-extrabold text-slate-900">{personalForm.full_name || client?.full_name || 'Client Profile'}</span>
            </div>

            {/* Informational Warning Summary */}
            {loadingDeletionSummary ? (
              <div className="flex justify-center items-center py-6">
                <svg className="animate-spin h-6 w-6 text-rose-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : deletionSummary ? (
              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 space-y-2">
                <span className="block text-xs font-extrabold text-amber-800 uppercase tracking-wider">Permanent Deletion Warning</span>
                <ul className="text-xs text-amber-900 font-medium space-y-1.5 list-disc list-inside">
                  {deletionSummary.signed_consents_count > 0 && (
                    <li>This client has <strong>{deletionSummary.signed_consents_count}</strong> signed consent(s).</li>
                  )}
                  {deletionSummary.pending_signatures_count > 0 && (
                    <li>This client has <strong>{deletionSummary.pending_signatures_count}</strong> pending signature request(s).</li>
                  )}
                  {deletionSummary.uploaded_files_count > 0 && (
                    <li>This client has <strong>{deletionSummary.uploaded_files_count}</strong> uploaded document(s).</li>
                  )}
                  {(deletionSummary.health_policies_count + deletionSummary.pc_policies_count) > 0 && (
                    <li>This client has <strong>{deletionSummary.health_policies_count + deletionSummary.pc_policies_count}</strong> active policy / policies.</li>
                  )}
                  {deletionSummary.notes_count > 0 && (
                    <li>This client has <strong>{deletionSummary.notes_count}</strong> note(s).</li>
                  )}
                  <li>All related database records, policies, consents, and files will be permanently deleted.</li>
                </ul>
              </div>
            ) : null}

            {deleteClientError && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-semibold">
                {deleteClientError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsDeleteClientModalOpen(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                disabled={isDeletingClient}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteClient}
                disabled={isDeletingClient}
                className="px-5 py-2.5 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 shadow-md shadow-rose-500/20 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeletingClient ? 'Deleting Everything...' : 'Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Income Modal */}
      {isAddIncomeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white border border-slate-100 rounded-2xl shadow-2xl p-6 md:p-8 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <h3 className="text-xl font-bold text-slate-900">Add Income Record</h3>
              <button
                onClick={() => setIsAddIncomeOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {incomeError && (
              <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm">
                {incomeError}
              </div>
            )}

            <form onSubmit={handleAddIncomeSubmit} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Relationship *</label>
                  <select
                    value={incomeRelationship}
                    onChange={(e) => setIncomeRelationship(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                    required
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
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Income Type *</label>
                  <select
                    value={incomeType}
                    onChange={(e) => setIncomeType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                    required
                  >
                    <option value="W2">W2</option>
                    <option value="1099">1099</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Employer Name</label>
                <input
                  type="text"
                  value={incomeEmployerName}
                  onChange={(e) => setIncomeEmployerName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Employer Phone</label>
                  <input
                    type="text"
                    value={incomeEmployerPhone}
                    onChange={(e) => setIncomeEmployerPhone(e.target.value)}
                    placeholder="e.g. 555-0199"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Income Amount *</label>
                  <input
                    type="number"
                    value={incomeAmount}
                    onChange={(e) => setIncomeAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 45000"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddIncomeOpen(false)}
                  className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl px-5 py-2.5 text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={incomeSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-all shadow-md disabled:opacity-50"
                >
                  {incomeSaving ? 'Saving...' : 'Add Income'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Income Modal */}
      {isEditIncomeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white border border-slate-100 rounded-2xl shadow-2xl p-6 md:p-8 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <h3 className="text-xl font-bold text-slate-900">Edit Income Details</h3>
              <button
                onClick={() => setIsEditIncomeOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {incomeError && (
              <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm">
                {incomeError}
              </div>
            )}

            <form onSubmit={handleEditIncomeSubmit} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Relationship *</label>
                  <select
                    value={incomeRelationship}
                    onChange={(e) => setIncomeRelationship(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                    required
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
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Income Type *</label>
                  <select
                    value={incomeType}
                    onChange={(e) => setIncomeType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                    required
                  >
                    <option value="W2">W2</option>
                    <option value="1099">1099</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Employer Name</label>
                <input
                  type="text"
                  value={incomeEmployerName}
                  onChange={(e) => setIncomeEmployerName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Employer Phone</label>
                  <input
                    type="text"
                    value={incomeEmployerPhone}
                    onChange={(e) => setIncomeEmployerPhone(e.target.value)}
                    placeholder="e.g. 555-0199"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Income Amount *</label>
                  <input
                    type="number"
                    value={incomeAmount}
                    onChange={(e) => setIncomeAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 45000"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditIncomeOpen(false)}
                  className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl px-5 py-2.5 text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={incomeSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-all shadow-md disabled:opacity-50"
                >
                  {incomeSaving ? 'Saving...' : 'Save Income'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unlink Company Policy Confirmation Modal */}
      {isConfirmUnlinkOpen && selectedUnlinkPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Unlink Company Policy</h3>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmUnlinkOpen(false);
                  setSelectedUnlinkPolicy(null);
                  setUnlinkError(null);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to unlink this company policy from the current personal client?
            </p>

            <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-4 space-y-2 text-xs text-slate-700">
              <div><span className="font-bold text-slate-500">Company / Client:</span> <strong className="text-slate-900">{selectedUnlinkPolicy.client?.full_name || '-'}</strong></div>
              <div><span className="font-bold text-slate-500">Policy Number:</span> <strong className="text-slate-900">{selectedUnlinkPolicy.policy_number || '-'}</strong></div>
              <div><span className="font-bold text-slate-500">Linked Role:</span> <strong className="text-slate-900">{selectedUnlinkPolicy.link_role === 'co_applicant' ? 'Co-Applicant' : 'Main Applicant'}</strong></div>
            </div>

            <div className="p-3 text-[11px] bg-amber-50 border border-amber-200/60 text-amber-800 rounded-xl font-medium">
              ⚠️ The policy and both client profiles will remain intact. Only the relationship link will be removed.
            </div>

            {unlinkError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-100 text-rose-600 rounded-xl">
                {unlinkError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmUnlinkOpen(false);
                  setSelectedUnlinkPolicy(null);
                  setUnlinkError(null);
                }}
                disabled={unlinkingPolicy}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnlinkPolicy}
                disabled={unlinkingPolicy}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white rounded-xl transition-all shadow-md shadow-rose-500/10 flex items-center gap-1.5"
              >
                {unlinkingPolicy ? 'Unlinking...' : 'Confirm Unlink'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DocumentPreviewModal
        isOpen={unifiedPreviewState.isOpen}
        onClose={() => setUnifiedPreviewState((prev) => ({ ...prev, isOpen: false, signedUrl: null, officePreview: null }))}
        fileName={unifiedPreviewState.fileName}
        mimeType={unifiedPreviewState.mimeType}
        signedUrl={unifiedPreviewState.signedUrl}
        officePreview={unifiedPreviewState.officePreview}
        loading={unifiedPreviewState.loading}
        error={unifiedPreviewState.error}
        onDownload={handleDownloadFromPreview}
      />
    </DashboardLayout>
  );
}
