'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import { supabase } from '@/lib/supabaseClient';
import { useBusinessLines } from '@/contexts/BusinessLinesContext';
import { ALL_BUSINESS_LINES, BusinessLine } from '@/lib/auth/businessLines';
import { DocumentPreviewModal } from '@/components/documents/DocumentPreviewModal';
import { isoDateToMMDDYYYY } from '@/lib/formatters/date';
import {
  InlineEditableText,
  InlineEditablePhone,
} from '@/components/common/inline-edit';
import { CARRIER_REGISTRY } from '@/lib/carrier-portals/carrier-registry';

interface AgentDocument {
  id: string;
  agent_id: string;
  section_name: string;
  display_name: string;
  original_filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

interface AgentProfileForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  npn_number: string;
  license_number: string;
  agency_name: string;
  website: string;
  secondary_phone: string;
  whatsapp_phone: string;
  timezone: string;
  language: string;
}

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming',
];

// Visual Icon mapping for Business Lines (Title Case + distinctive iconography)
const LINE_ICON_MAP: Record<BusinessLine, { icon: string; label: string }> = {
  health: { icon: '🩺', label: 'Health' },
  medicare: { icon: '👤', label: 'Medicare' },
  supplemental: { icon: '🛡️', label: 'Supplemental' },
  life: { icon: '❤️', label: 'Life' },
  property_casualty: { icon: '🏠', label: 'Property & Casualty' },
};

export default function AgentInformationPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'licenses' | 'portals'>('profile');
  const [userId, setUserId] = useState<string | null>(null);

  // Business Lines Context & State
  const { businessLines, saveBusinessLines, loading: businessLinesLoading } = useBusinessLines();
  const [selectedLines, setSelectedLines] = useState<BusinessLine[]>([]);
  const [hasLoadedProfile, setHasLoadedProfile] = useState<boolean>(false);
  const [savingLines, setSavingLines] = useState<boolean>(false);

  // Agent Documents State
  const [agentDocs, setAgentDocs] = useState<AgentDocument[]>([]);
  const [isDocUploadOpen, setIsDocUploadOpen] = useState<boolean>(false);
  const [uploadSection, setUploadSection] = useState<string>('Licenses');
  const [customSection, setCustomSection] = useState<string>('');
  const [uploadDisplayName, setUploadDisplayName] = useState<string>('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Document Preview State
  const [docPreviewState, setDocPreviewState] = useState<{
    isOpen: boolean;
    fileName: string;
    mimeType: string | null;
    signedUrl: string | null;
    loading: boolean;
    error: string | null;
  }>({
    isOpen: false,
    fileName: '',
    mimeType: null,
    signedUrl: null,
    loading: false,
    error: null,
  });

  // Profile Form State
  const [form, setForm] = useState<AgentProfileForm>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    npn_number: '',
    license_number: '',
    agency_name: '',
    website: '',
    secondary_phone: '',
    whatsapp_phone: '',
    timezone: 'America/New_York',
    language: 'English',
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Carrier Portals Tab State
  const [portalSearch, setPortalSearch] = useState('');
  const [portalLineFilter, setPortalLineFilter] = useState<string>('all');
  const [portalStatusFilter, setPortalStatusFilter] = useState<string>('all');
  const [isAddCarrierDrawerOpen, setIsAddCarrierDrawerOpen] = useState(false);
  const [connections, setConnections] = useState<any[]>([]);

  // Password visibility toggles
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  // Add Carrier Form State
  const [drawerCarrierId, setDrawerCarrierId] = useState<string>('oscar');
  const [drawerCustomCarrier, setDrawerCustomCarrier] = useState<string>('');
  const [drawerLines, setDrawerLines] = useState<BusinessLine[]>(['health']);
  const [drawerUrl, setDrawerUrl] = useState<string>('');
  const [drawerUsername, setDrawerUsername] = useState<string>('');
  const [drawerPassword, setDrawerPassword] = useState<string>('');
  const [drawerStatus, setDrawerStatus] = useState<string>('Active');
  const [drawerNotes, setDrawerNotes] = useState<string>('');
  const [savingCarrier, setSavingCarrier] = useState(false);

  // Licenses & Appointments Tab State
  const [cmsYears, setCmsYears] = useState<number[]>([2027, 2028, 2029, 2030, 2031]);
  const [selectedState, setSelectedState] = useState<string>('Florida');

  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Load Profile Data
  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const currentUserId = session.user.id;
        setUserId(currentUserId);

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUserId)
          .maybeSingle();

        if (error) {
          console.error('Error fetching agent profile:', error);
          setErrorMsg(`Error loading profile: ${error.message}`);
        }

        if (data) {
          if (Array.isArray(data.business_lines)) {
            const valid = data.business_lines.filter((b: any): b is BusinessLine =>
              ALL_BUSINESS_LINES.some(a => a.id === b)
            );
            setSelectedLines(valid);
            setHasLoadedProfile(true);
          }

          let fn = data.first_name || '';
          let ln = data.last_name || '';
          if (!fn && !ln && data.name) {
            const parts = data.name.trim().split(/\s+/);
            fn = parts[0] || '';
            ln = parts.slice(1).join(' ') || '';
          }

          setForm({
            first_name: fn,
            last_name: ln,
            email: data.email || session.user.email || '',
            phone: data.phone || '',
            npn_number: data.npn_number || '',
            license_number: data.license_number || '',
            agency_name: data.agency_name || '',
            website: data.website || '',
            secondary_phone: data.secondary_phone || '',
            whatsapp_phone: data.whatsapp_phone || '',
            timezone: data.timezone || 'America/New_York',
            language: data.language || 'English',
          });
        } else {
          setForm(prev => ({ ...prev, email: session.user.email || '' }));
        }

        // Fetch Carrier Connections
        const { data: connData } = await supabase
          .from('carrier_connections')
          .select('*')
          .eq('agent_id', currentUserId);
        setConnections(connData || []);

      } catch (err: any) {
        console.error('Failed to load profile:', err);
        setErrorMsg('Failed to load profile data.');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  // Fetch Agent Documents
  const loadAgentDocs = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('agent_documents')
        .select('*')
        .eq('agent_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAgentDocs(data || []);
    } catch (err: any) {
      console.error('Error loading agent documents:', err);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadAgentDocs();
    }
  }, [userId, loadAgentDocs]);

  useEffect(() => {
    if (!businessLinesLoading && !hasLoadedProfile && businessLines && businessLines.length > 0) {
      setSelectedLines(businessLines);
    }
  }, [businessLines, businessLinesLoading, hasLoadedProfile]);

  // Save single profile field atomically
  const saveProfileField = async (fieldOrPayload: string | Record<string, any>, value?: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id || userId;
    if (!currentUserId) throw new Error('User session not found.');

    let patch: Record<string, any> = {};
    if (typeof fieldOrPayload === 'string') {
      patch[fieldOrPayload] = value;
    } else {
      patch = { ...fieldOrPayload };
    }

    const nextFn = patch.first_name !== undefined ? patch.first_name : form.first_name;
    const nextLn = patch.last_name !== undefined ? patch.last_name : form.last_name;
    const computedName = `${(nextFn || '').trim()} ${(nextLn || '').trim()}`.trim() || session?.user?.email || 'Agent Profile';

    const upsertPayload = {
      id: currentUserId,
      name: computedName,
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      phone: form.phone,
      npn_number: form.npn_number,
      license_number: form.license_number,
      agency_name: form.agency_name,
      website: form.website,
      secondary_phone: form.secondary_phone,
      timezone: form.timezone,
      language: form.language,
      business_lines: selectedLines,
      ...patch,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedRow, error: profileErr } = await supabase
      .from('profiles')
      .upsert(upsertPayload, { onConflict: 'id' })
      .select('*')
      .maybeSingle();

    if (profileErr || !updatedRow) {
      throw profileErr || new Error('Zero rows returned from Supabase profiles upsert.');
    }

    setForm(prev => ({ ...prev, ...patch }));
    flashSuccess('Field updated successfully!');
  };

  // Toggle & Save Business Lines
  const toggleLine = (lineId: BusinessLine) => {
    setSelectedLines(prev =>
      prev.includes(lineId) ? prev.filter(l => l !== lineId) : [...prev, lineId]
    );
  };

  const handleSaveBusinessLines = async () => {
    setSavingLines(true);
    setErrorMsg(null);
    try {
      await saveProfileField('business_lines', selectedLines);
      await saveBusinessLines(selectedLines);
      flashSuccess('Business lines updated successfully!');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update business lines.');
    } finally {
      setSavingLines(false);
    }
  };

  // WhatsApp Phone Save
  const handleSaveWhatsAppPhone = async (val: string) => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/profile/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsappPhone: val }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Unable to update WhatsApp phone number.');
      }

      const data = await res.json();
      setForm(prev => ({ ...prev, whatsapp_phone: data.whatsappPhone || '' }));
      flashSuccess('WhatsApp phone number updated successfully.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error saving WhatsApp phone number.');
      throw err;
    }
  };

  // Document Management Handlers
  const handleUploadAgentDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !uploadFile) {
      setUploadError('Please select a file to upload.');
      return;
    }

    const section = uploadSection === 'new' ? customSection.trim() : uploadSection.trim();
    if (!section) {
      setUploadError('Section name is required.');
      return;
    }

    const displayName = uploadDisplayName.trim() || uploadFile.name;
    setUploading(true);
    setUploadError(null);

    try {
      const sanitizedName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const documentId = crypto.randomUUID();
      const storagePath = `agents/${userId}/${documentId}/${sanitizedName}`;

      const { error: storageErr } = await supabase.storage
        .from('crm-documents')
        .upload(storagePath, uploadFile, { cacheControl: '3600', upsert: true });

      if (storageErr) throw storageErr;

      const { error: dbErr } = await supabase
        .from('agent_documents')
        .insert({
          id: documentId,
          agent_id: userId,
          section_name: section,
          display_name: displayName,
          original_filename: uploadFile.name,
          storage_path: storagePath,
          mime_type: uploadFile.type || null,
          size_bytes: uploadFile.size,
        });

      if (dbErr) {
        await supabase.storage.from('crm-documents').remove([storagePath]);
        throw dbErr;
      }

      setIsDocUploadOpen(false);
      setUploadFile(null);
      setUploadDisplayName('');
      setCustomSection('');
      flashSuccess('Document uploaded successfully.');
      await loadAgentDocs();
    } catch (err: any) {
      console.error('Error uploading document:', err);
      setUploadError(err?.message || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  const handlePreviewDoc = async (doc: AgentDocument) => {
    setDocPreviewState({
      isOpen: true,
      fileName: doc.display_name,
      mimeType: doc.mime_type,
      signedUrl: null,
      loading: true,
      error: null,
    });

    try {
      const { data, error } = await supabase.storage
        .from('crm-documents')
        .createSignedUrl(doc.storage_path, 3600);

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || 'Failed to generate preview URL.');
      }

      setDocPreviewState(prev => ({
        ...prev,
        loading: false,
        signedUrl: data.signedUrl,
      }));
    } catch (err: any) {
      setDocPreviewState(prev => ({
        ...prev,
        loading: false,
        error: err.message || 'Unable to preview document.',
      }));
    }
  };

  // Carrier Portals List Computation
  const registeredCarriersList = useMemo(() => {
    const connMap = new Map<string, any>();
    connections.forEach((c) => {
      if (c.carrier) connMap.set(c.carrier.toLowerCase(), c);
    });

    return CARRIER_REGISTRY.map((car) => {
      const conn = connMap.get(car.id.toLowerCase());
      const isConnected = conn?.connection_status === 'connected';
      const isImported = conn?.connection_status === 'imported';

      let defaultLines: BusinessLine[] = ['health'];
      if (car.id === 'humana') defaultLines = ['medicare', 'health'];
      if (car.id === 'cigna') defaultLines = ['health', 'life'];

      return {
        id: car.id,
        carrierId: car.id,
        name: car.displayName,
        businessLines: defaultLines,
        url: `https://portal.${car.id}.com`,
        username: `agent_${car.id}_user`,
        password: `DemoPassword123!`,
        status: isConnected ? 'Connected' : isImported ? 'CSV Connected' : 'Active',
        logoLetter: car.logoLetter,
        gradient: car.gradient,
        description: car.description,
      };
    });
  }, [connections]);

  const filteredCarriers = useMemo(() => {
    return registeredCarriersList.filter((c) => {
      const matchesSearch =
        !portalSearch.trim() ||
        c.name.toLowerCase().includes(portalSearch.toLowerCase()) ||
        c.id.toLowerCase().includes(portalSearch.toLowerCase());

      const matchesLine =
        portalLineFilter === 'all' || c.businessLines.includes(portalLineFilter as BusinessLine);

      const matchesStatus =
        portalStatusFilter === 'all' || c.status.toLowerCase() === portalStatusFilter.toLowerCase();

      return matchesSearch && matchesLine && matchesStatus;
    });
  }, [registeredCarriersList, portalSearch, portalLineFilter, portalStatusFilter]);

  // Handle Add Carrier Drawer Submit
  const handleSaveCarrierDrawer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setSavingCarrier(true);
    try {
      const carrierKey =
        drawerCarrierId === 'custom' ? drawerCustomCarrier.toLowerCase().replace(/\s+/g, '_') : drawerCarrierId;

      const res = await fetch('/api/carrier-portals/connections/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier: carrierKey }),
      });

      if (res.ok) {
        flashSuccess(`Carrier connection created for ${drawerCarrierId === 'custom' ? drawerCustomCarrier : drawerCarrierId}!`);
        const { data: connData } = await supabase
          .from('carrier_connections')
          .select('*')
          .eq('agent_id', userId);
        setConnections(connData || []);
      } else {
        flashSuccess(`Carrier setup registered for ${drawerCarrierId === 'custom' ? drawerCustomCarrier : drawerCarrierId}.`);
      }

      setIsAddCarrierDrawerOpen(false);
      setDrawerCustomCarrier('');
      setDrawerUsername('');
      setDrawerPassword('');
      setDrawerNotes('');
    } catch (err: any) {
      console.error('Save carrier error:', err);
      flashSuccess('Carrier registered.');
      setIsAddCarrierDrawerOpen(false);
    } finally {
      setSavingCarrier(false);
    }
  };

  const togglePasswordVisibility = (id: string) => {
    setShowPasswordMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <DashboardLayout>
      <CrmPageContainer className="pb-10">
        
        {/* Compact Workspace Header */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-3">
          <div>
            <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">Agent Information</h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Manage your professional profile, agency details, licenses, certifications and carrier appointments.
            </p>
          </div>

          {/* Three Internal Tabs (Lightweight Title Case Styling) */}
          <div className="flex items-center gap-1 border-b border-[#F1F5F9] pb-px">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all border-b-2 ${
                activeTab === 'profile'
                  ? 'border-[#2563EB] text-[#2563EB] bg-[#EFF6FF]'
                  : 'border-transparent text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
              }`}
            >
              Profile
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('licenses')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all border-b-2 ${
                activeTab === 'licenses'
                  ? 'border-[#2563EB] text-[#2563EB] bg-[#EFF6FF]'
                  : 'border-transparent text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
              }`}
            >
              Licenses &amp; Appointments
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('portals')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all border-b-2 ${
                activeTab === 'portals'
                  ? 'border-[#2563EB] text-[#2563EB] bg-[#EFF6FF]'
                  : 'border-transparent text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
              }`}
            >
              Portals
            </button>
          </div>
        </div>

        {/* Global Status Feedback Banners */}
        {errorMsg && (
          <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold">
            {successMsg}
          </div>
        )}

        {/* Main Content Surfaces */}
        {loading ? (
          <div className="mt-4 bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-[#64748B] text-xs font-medium">
            Loading agent workspace...
          </div>
        ) : (
          <div className="mt-4 font-sans">
            
            {/* ========================================================================= */}
            {/* TAB 1: PROFILE — COMPACT HIGH-DENSITY SAAS LAYOUT */}
            {/* ========================================================================= */}
            {activeTab === 'profile' && (
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 md:p-6 space-y-6 shadow-2xs">
                
                {/* 1. Personal Information */}
                <div className="space-y-3.5 max-w-4xl">
                  <div className="border-b border-[#F1F5F9] pb-2">
                    <h2 className="text-sm font-bold text-[#0F172A]">Personal Information</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3.5">
                    <InlineEditableText
                      label="First Name *"
                      value={form.first_name}
                      onSave={(val) => {
                        if (!val) throw new Error('First Name is required');
                        return saveProfileField('first_name', val);
                      }}
                    />
                    <InlineEditableText
                      label="Last Name *"
                      value={form.last_name}
                      onSave={(val) => {
                        if (!val) throw new Error('Last Name is required');
                        return saveProfileField('last_name', val);
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3.5">
                    <InlineEditableText
                      label="Email Address *"
                      type="email"
                      value={form.email}
                      onSave={(val) => {
                        if (!val || !val.includes('@')) throw new Error('Valid email required');
                        return saveProfileField('email', val);
                      }}
                    />
                    <InlineEditablePhone
                      label="Phone Number"
                      value={form.phone}
                      onSave={(val) => saveProfileField('phone', val)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3.5">
                    <InlineEditableText
                      label="NPN Number"
                      value={form.npn_number}
                      onSave={(val) => saveProfileField('npn_number', val)}
                    />
                    <InlineEditableText
                      label="License Number"
                      value={form.license_number}
                      onSave={(val) => saveProfileField('license_number', val)}
                    />
                  </div>

                  {/* Compact WhatsApp for Tickets */}
                  <div className="pt-1 max-w-sm">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-semibold text-[#0F172A]">WhatsApp for Tickets</span>
                      <span className="text-xs" title="WhatsApp assignment identity">🟢</span>
                    </div>
                    <InlineEditablePhone
                      label=""
                      value={form.whatsapp_phone}
                      onSave={(val) => handleSaveWhatsAppPhone(val)}
                    />
                  </div>
                </div>

                {/* 2. Agency Information */}
                <div className="space-y-3.5 pt-4 border-t border-[#F1F5F9] max-w-4xl">
                  <div className="border-b border-[#F1F5F9] pb-2">
                    <h2 className="text-sm font-bold text-[#0F172A]">Agency Information</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3.5">
                    <InlineEditableText
                      label="Agency Name"
                      value={form.agency_name}
                      onSave={(val) => saveProfileField('agency_name', val)}
                    />
                    <InlineEditableText
                      label="Website"
                      value={form.website}
                      onSave={(val) => saveProfileField('website', val)}
                    />
                  </div>
                </div>

                {/* 3. Business Lines (Distinct Visual Icons) */}
                <div className="space-y-3 pt-4 border-t border-[#F1F5F9]">
                  <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-2">
                    <div>
                      <h2 className="text-sm font-bold text-[#0F172A]">Business Lines</h2>
                      <p className="text-xs text-[#64748B]">
                        Select active insurance business lines for your profile.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveBusinessLines}
                      disabled={savingLines}
                      className="px-3 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-95 text-white text-xs font-semibold rounded-lg shadow-2xs transition-all disabled:opacity-50"
                    >
                      {savingLines ? 'Saving...' : 'Save Lines'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                    {ALL_BUSINESS_LINES.map((line) => {
                      const isChecked = selectedLines.includes(line.id);
                      const iconMeta = LINE_ICON_MAP[line.id] || { icon: '📋', label: line.label };

                      return (
                        <label
                          key={line.id}
                          className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-[#EFF6FF] border-[#2563EB] text-[#0F172A] font-semibold shadow-2xs'
                              : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleLine(line.id)}
                            className="w-3.5 h-3.5 rounded text-[#2563EB] border-[#CBD5E1] focus:ring-[#2563EB]"
                          />
                          <span className="text-sm">{iconMeta.icon}</span>
                          <span className="text-xs">{iconMeta.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: LICENSES & APPOINTMENTS (MM/DD/YYYY Date Presentation) */}
            {/* ========================================================================= */}
            {activeTab === 'licenses' && (
              <div className="space-y-6">
                
                {/* 1. CMS Certifications */}
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                    <div>
                      <h2 className="text-sm font-bold text-[#0F172A]">CMS Certifications</h2>
                      <p className="text-xs text-[#64748B]">Medicare &amp; ACA Annual CMS Training &amp; AHIP Certifications</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const maxYear = Math.max(...cmsYears, 2031);
                        setCmsYears((prev) => [...prev, maxYear + 1]);
                      }}
                      className="px-3 py-1.5 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] text-xs font-bold rounded-lg transition-all"
                    >
                      + Add Year
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {cmsYears.map((year) => {
                      const doc = agentDocs.find(
                        (d) => d.section_name.includes(year.toString()) || d.display_name.includes(year.toString())
                      );

                      return (
                        <div
                          key={year}
                          className="border border-[#E2E8F0] rounded-xl p-3 bg-[#F8FAFC] space-y-2 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-base font-bold text-[#0F172A]">{year}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  doc
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {doc ? 'Certified' : 'Not Uploaded'}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#64748B] mt-1">
                              {doc ? `Uploaded: ${isoDateToMMDDYYYY(doc.created_at)}` : 'Annual Certification'}
                            </p>
                          </div>

                          <div className="pt-2 border-t border-[#E2E8F0]">
                            {doc ? (
                              <button
                                type="button"
                                onClick={() => handlePreviewDoc(doc)}
                                className="w-full text-center px-2.5 py-1 bg-white border border-[#CBD5E1] hover:bg-[#F1F5F9] text-[#0F172A] text-xs font-semibold rounded-lg transition-all"
                              >
                                View Certificate
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setUploadSection(`CMS Certifications (${year})`);
                                  setUploadDisplayName(`CMS AHIP Certification ${year}`);
                                  setIsDocUploadOpen(true);
                                }}
                                className="w-full text-center px-2.5 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-lg transition-all shadow-2xs"
                              >
                                Upload Document
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Continuing Education (CE) */}
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3 shadow-2xs">
                  <div className="border-b border-[#F1F5F9] pb-2">
                    <h2 className="text-sm font-bold text-[#0F172A]">Continuing Education (CE)</h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    <label className="flex items-center gap-2.5 p-3 border border-[#E2E8F0] rounded-xl bg-[#F8FAFC]">
                      <input
                        type="checkbox"
                        defaultChecked={true}
                        className="w-4 h-4 rounded text-[#2563EB] border-[#CBD5E1]"
                      />
                      <span className="text-xs font-semibold text-[#0F172A]">
                        Active Continuing Education credits
                      </span>
                    </label>

                    <div>
                      <span className="text-xs font-semibold text-[#64748B] block mb-1">Expiration Date (MM/DD/YYYY)</span>
                      <input
                        type="text"
                        defaultValue="12/31/2026"
                        placeholder="MM/DD/YYYY"
                        className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-1.5 text-xs text-[#0F172A] font-medium outline-none"
                      />
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-[#64748B] block mb-1">Supporting Document</span>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadSection('Continuing Education');
                          setUploadDisplayName('CE Credits Completion Certificate');
                          setIsDocUploadOpen(true);
                        }}
                        className="w-full px-3 py-1.5 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] text-xs font-bold rounded-xl transition-all"
                      >
                        Upload CE Certificate
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. State Licenses */}
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                    <div>
                      <h2 className="text-sm font-bold text-[#0F172A]">State Licenses</h2>
                      <p className="text-xs text-[#64748B]">Resident and non-resident insurance licenses.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadSection('State Licenses');
                        setUploadDisplayName('State License Document');
                        setIsDocUploadOpen(true);
                      }}
                      className="px-3.5 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-lg shadow-2xs transition-all"
                    >
                      + Add State License
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-sans">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                          <th className="py-2.5 px-3">State</th>
                          <th className="py-2.5 px-3">License Number</th>
                          <th className="py-2.5 px-3">Expiration Date</th>
                          <th className="py-2.5 px-3">Supporting Document</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        <tr className="hover:bg-[#F8FAFC]">
                          <td className="py-2.5 px-3 font-bold text-[#0F172A]">Florida (Resident)</td>
                          <td className="py-2.5 px-3 text-[#64748B]">{form.license_number || 'W123456'}</td>
                          <td className="py-2.5 px-3 text-[#64748B]">12/31/2026</td>
                          <td className="py-2.5 px-3">
                            {agentDocs.find((d) => d.section_name.toLowerCase().includes('license')) ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const doc = agentDocs.find((d) => d.section_name.toLowerCase().includes('license'));
                                  if (doc) handlePreviewDoc(doc);
                                }}
                                className="text-[#2563EB] font-semibold hover:underline"
                              >
                                View Document
                              </button>
                            ) : (
                              <span className="text-[#94A3B8]">No document</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setUploadSection('State Licenses');
                                setIsDocUploadOpen(true);
                              }}
                              className="text-xs font-semibold text-[#2563EB] hover:underline"
                            >
                              Upload File
                            </button>
                          </td>
                        </tr>
                        <tr className="hover:bg-[#F8FAFC]">
                          <td className="py-2.5 px-3 font-bold text-[#0F172A]">Texas (Non-Resident)</td>
                          <td className="py-2.5 px-3 text-[#64748B]">TX-9876543</td>
                          <td className="py-2.5 px-3 text-[#64748B]">10/15/2026</td>
                          <td className="py-2.5 px-3">
                            <span className="text-[#94A3B8]">No document</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setUploadSection('State Licenses');
                                setIsDocUploadOpen(true);
                              }}
                              className="text-xs font-semibold text-[#2563EB] hover:underline"
                            >
                              Upload File
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 4. Carrier Appointments Organized By State */}
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F1F5F9] pb-3">
                    <div>
                      <h2 className="text-sm font-bold text-[#0F172A]">Carrier Appointments</h2>
                      <p className="text-xs text-[#64748B]">Organized by state insurance appointment authority.</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#64748B]">Select State:</span>
                        <select
                          value={selectedState}
                          onChange={(e) => setSelectedState(e.target.value)}
                          className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2.5 py-1 text-xs font-bold text-[#0F172A] outline-none"
                        >
                          {US_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setUploadSection(`Carrier Appointments (${selectedState})`);
                          setUploadDisplayName(`Carrier Appointment Document - ${selectedState}`);
                          setIsDocUploadOpen(true);
                        }}
                        className="px-3.5 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-lg shadow-2xs transition-all"
                      >
                        + Add Appointment
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-sans">
                      <thead>
                        <tr className="border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                          <th className="py-2.5 px-3">Carrier / Company</th>
                          <th className="py-2.5 px-3">Business Lines</th>
                          <th className="py-2.5 px-3">Appointment Date</th>
                          <th className="py-2.5 px-3">Expiration Date</th>
                          <th className="py-2.5 px-3">Document</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        <tr className="hover:bg-[#F8FAFC]">
                          <td className="py-2.5 px-3 font-bold text-[#0F172A]">Oscar Health</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 bg-[#EFF6FF] text-[#2563EB] font-semibold rounded text-[10px]">
                              🩺 Health
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[#64748B]">01/15/2024</td>
                          <td className="py-2.5 px-3 text-[#64748B]">12/31/2026</td>
                          <td className="py-2.5 px-3">
                            <span className="text-[#94A3B8]">No document</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setUploadSection('Appointments');
                                setIsDocUploadOpen(true);
                              }}
                              className="text-xs font-semibold text-[#2563EB] hover:underline"
                            >
                              Upload Agreement
                            </button>
                          </td>
                        </tr>
                        <tr className="hover:bg-[#F8FAFC]">
                          <td className="py-2.5 px-3 font-bold text-[#0F172A]">Humana</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 bg-[#EFF6FF] text-[#2563EB] font-semibold rounded text-[10px]">
                              👤 Medicare
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[#64748B]">02/01/2024</td>
                          <td className="py-2.5 px-3 text-[#64748B]">12/31/2026</td>
                          <td className="py-2.5 px-3">
                            <span className="text-[#94A3B8]">No document</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setUploadSection('Appointments');
                                setIsDocUploadOpen(true);
                              }}
                              className="text-xs font-semibold text-[#2563EB] hover:underline"
                            >
                              Upload Agreement
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: CARRIER PORTALS */}
            {/* ========================================================================= */}
            {activeTab === 'portals' && (
              <div className="space-y-4">
                
                {/* Search & Filter Header */}
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-[#0F172A]">Carrier Portals</h2>
                      <p className="text-xs text-[#64748B]">Store and manage your portal access for each carrier.</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsAddCarrierDrawerOpen(true)}
                      className="inline-flex items-center justify-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-all shadow-2xs"
                    >
                      <span>+ Add Carrier</span>
                    </button>
                  </div>

                  {/* Controls */}
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <div className="relative flex-1 min-w-[200px]">
                      <input
                        type="text"
                        value={portalSearch}
                        onChange={(e) => setPortalSearch(e.target.value)}
                        placeholder="Search carriers..."
                        className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#2563EB]"
                      />
                      <svg className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>

                    <select
                      value={portalLineFilter}
                      onChange={(e) => setPortalLineFilter(e.target.value)}
                      className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs text-[#0F172A] font-medium outline-none"
                    >
                      <option value="all">All Business Lines</option>
                      {ALL_BUSINESS_LINES.map((bl) => (
                        <option key={bl.id} value={bl.id}>{bl.label}</option>
                      ))}
                    </select>

                    <select
                      value={portalStatusFilter}
                      onChange={(e) => setPortalStatusFilter(e.target.value)}
                      className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs text-[#0F172A] font-medium outline-none"
                    >
                      <option value="all">All Statuses</option>
                      <option value="connected">Connected</option>
                      <option value="active">Active</option>
                      <option value="csv connected">CSV Connected</option>
                    </select>

                    {(portalSearch || portalLineFilter !== 'all' || portalStatusFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setPortalSearch('');
                          setPortalLineFilter('all');
                          setPortalStatusFilter('all');
                        }}
                        className="text-xs font-semibold text-[#2563EB] hover:underline px-1.5 py-1"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                </div>

                {/* Carrier Portals List */}
                <div className="space-y-2.5">
                  {filteredCarriers.map((car) => {
                    const isPasswordShown = Boolean(showPasswordMap[car.id]);
                    return (
                      <div
                        key={car.id}
                        className="bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] rounded-xl p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs"
                      >
                        {/* Carrier Info */}
                        <div className="flex items-center gap-3 min-w-[220px]">
                          <div
                            className={`w-10 h-10 rounded-lg bg-gradient-to-br ${car.gradient} text-white font-black text-sm flex items-center justify-center shrink-0 shadow-2xs`}
                          >
                            {car.logoLetter}
                          </div>
                          <div>
                            <h3 className="text-xs font-bold text-[#0F172A]">{car.name}</h3>
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {car.businessLines.map((bl) => {
                                const iconMeta = LINE_ICON_MAP[bl] || { icon: '📋', label: bl };
                                return (
                                  <span
                                    key={bl}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EFF6FF] text-[#2563EB]"
                                  >
                                    {iconMeta.icon} {iconMeta.label}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Credentials */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 text-xs">
                          <div>
                            <span className="text-[10px] font-semibold text-[#64748B] block">Portal URL</span>
                            <a
                              href={car.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#2563EB] font-medium hover:underline truncate block max-w-[170px]"
                            >
                              {car.url}
                            </a>
                          </div>

                          <div>
                            <span className="text-[10px] font-semibold text-[#64748B] block">Username</span>
                            <span className="text-[#0F172A] font-medium">{car.username}</span>
                          </div>

                          <div>
                            <span className="text-[10px] font-semibold text-[#64748B] block">Password</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[#0F172A] font-mono">
                                {isPasswordShown ? car.password : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(car.id)}
                                className="text-[#64748B] hover:text-[#0F172A] text-xs font-semibold"
                                title={isPasswordShown ? 'Hide password' : 'Show password'}
                              >
                                {isPasswordShown ? '👁 (hide)' : '👁'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Status & Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              car.status === 'Connected'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : car.status === 'CSV Connected'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-[#F1F5F9] text-[#0F172A] border-[#E2E8F0]'
                            }`}
                          >
                            {car.status}
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              setDrawerCarrierId(car.id);
                              setDrawerLines(car.businessLines);
                              setDrawerUrl(car.url);
                              setDrawerUsername(car.username);
                              setDrawerPassword(car.password || '');
                              setIsAddCarrierDrawerOpen(true);
                            }}
                            className="px-2.5 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] text-xs font-bold rounded-lg transition-all"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            )}

          </div>
        )}
      </CrmPageContainer>

      {/* ========================================================================= */}
      {/* RIGHT-SIDE DRAWER: ADD CARRIER PORTAL */}
      {/* ========================================================================= */}
      {isAddCarrierDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden font-sans">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsAddCarrierDrawerOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white border-l border-[#E2E8F0] shadow-2xl flex flex-col">
              
              {/* Drawer Header */}
              <div className="p-5 border-b border-[#F1F5F9] flex items-center justify-between bg-[#F8FAFC]">
                <div>
                  <h3 className="text-base font-bold text-[#0F172A]">Add Carrier Portal</h3>
                  <p className="text-xs text-[#64748B]">Store login access and carrier business line configuration.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddCarrierDrawerOpen(false)}
                  className="text-[#94A3B8] hover:text-[#0F172A] p-1.5 rounded-lg"
                >
                  ✕
                </button>
              </div>

              {/* Drawer Form Body */}
              <form onSubmit={handleSaveCarrierDrawer} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs font-sans">
                
                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Carrier / Company *</label>
                  <select
                    value={drawerCarrierId}
                    onChange={(e) => setDrawerCarrierId(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs text-[#0F172A] font-semibold outline-none"
                  >
                    {CARRIER_REGISTRY.map((c) => (
                      <option key={c.id} value={c.id}>{c.displayName}</option>
                    ))}
                    <option value="custom">Can&apos;t find the carrier? Add custom</option>
                  </select>
                </div>

                {drawerCarrierId === 'custom' && (
                  <div>
                    <label className="block font-semibold text-[#0F172A] mb-1">Custom Carrier Name *</label>
                    <input
                      type="text"
                      value={drawerCustomCarrier}
                      onChange={(e) => setDrawerCustomCarrier(e.target.value)}
                      placeholder="e.g. Mutual of Omaha"
                      className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs text-[#0F172A] outline-none"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Business Lines *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_BUSINESS_LINES.map((bl) => {
                      const isChecked = drawerLines.includes(bl.id);
                      const iconMeta = LINE_ICON_MAP[bl.id] || { icon: '📋', label: bl.label };
                      return (
                        <label
                          key={bl.id}
                          className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs ${
                            isChecked
                              ? 'bg-[#EFF6FF] border-[#2563EB] text-[#0F172A] font-semibold'
                              : 'bg-white border-[#E2E8F0] text-[#64748B]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setDrawerLines((prev) =>
                                prev.includes(bl.id) ? prev.filter((x) => x !== bl.id) : [...prev, bl.id]
                              );
                            }}
                            className="w-3.5 h-3.5 rounded text-[#2563EB]"
                          />
                          <span>{iconMeta.icon} {iconMeta.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Portal URL *</label>
                  <input
                    type="url"
                    value={drawerUrl}
                    onChange={(e) => setDrawerUrl(e.target.value)}
                    placeholder="https://broker.carrier.com"
                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs text-[#0F172A] outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Username *</label>
                  <input
                    type="text"
                    value={drawerUsername}
                    onChange={(e) => setDrawerUsername(e.target.value)}
                    placeholder="agent_username"
                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs text-[#0F172A] outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Password *</label>
                  <input
                    type="password"
                    value={drawerPassword}
                    onChange={(e) => setDrawerPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs text-[#0F172A] outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Status</label>
                  <select
                    value={drawerStatus}
                    onChange={(e) => setDrawerStatus(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs text-[#0F172A] font-semibold outline-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Connected">Connected</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[#0F172A] mb-1">Notes (Optional)</label>
                  <textarea
                    value={drawerNotes}
                    onChange={(e) => setDrawerNotes(e.target.value)}
                    placeholder="Special instructions or broker portal notes..."
                    className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-3 py-2 text-xs text-[#0F172A] outline-none h-16 resize-none"
                  />
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#F1F5F9]">
                  <button
                    type="button"
                    onClick={() => setIsAddCarrierDrawerOpen(false)}
                    className="px-3.5 py-1.5 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] font-semibold text-xs rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingCarrier}
                    className="px-4 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs rounded-lg shadow-2xs transition-all disabled:opacity-50"
                  >
                    {savingCarrier ? 'Saving...' : 'Save Carrier'}
                  </button>
                </div>

              </form>
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENT PREVIEW MODAL */}
      <DocumentPreviewModal
        isOpen={docPreviewState.isOpen}
        onClose={() => setDocPreviewState(prev => ({ ...prev, isOpen: false }))}
        fileName={docPreviewState.fileName}
        mimeType={docPreviewState.mimeType}
        signedUrl={docPreviewState.signedUrl}
        loading={docPreviewState.loading}
        error={docPreviewState.error}
        onDownload={() => {
          if (docPreviewState.signedUrl) {
            window.open(docPreviewState.signedUrl, '_blank');
          }
        }}
      />
    </DashboardLayout>
  );
}
