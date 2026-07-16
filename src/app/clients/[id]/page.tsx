'use client';

import React, { useState, useEffect, use, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import { formatIsoToUsDate } from '@/utils/dateUtils';

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
  agency_name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  agent?: AgentProfile | null;
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
}

interface ClientPersonalInformation {
  full_name: string;
  date_of_birth: string;
  ssn: string;
  email: string;
  phone: string;
  tax_members: number;
  gender: 'Female' | 'Male' | '';
  marital_status: 'Single' | 'Married' | '';
  born_in_usa: boolean | null;
  immigration_status: 'Resident' | 'Work Permit' | 'Citizen' | 'Other' | '';
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
  const router = useRouter();
  const { id: clientId } = use(params);

  const isValidUuid = (uuid: string) => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
  };

  // Tab State
  const [activeTab, setActiveTab] = useState<'overview' | 'personal-info' | 'policies' | 'timeline'>('overview');

  // Policies Search and Filters States
  const [policiesSearch, setPoliciesSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lobFilter, setLobFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

  // Master Client & Policies
  const [client, setClient] = useState<Client | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loadingClient, setLoadingClient] = useState(true);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('Agent');
  const [agentProfile, setAgentProfile] = useState<AgentProfile | null>(null);

  // Sub-modules Loading states
  const [loadingPersonal, setLoadingPersonal] = useState(true);
  const [loadingResidence, setLoadingResidence] = useState(true);
  const [loadingIncome, setLoadingIncome] = useState(true);

  // Activity Timeline Interface
  interface ActivityEvent {
    id: string;
    client_id: string;
    policy_id: string | null;
    actor_id: string;
    event_type: string;
    title: string;
    description: string | null;
    metadata: {
      policy_number?: string | null;
      line_of_business?: string | null;
    };
    created_at: string;
    profiles?: {
      name: string | null;
      email: string | null;
    } | null;
  }

  // Timeline & Counter States
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'policies' | 'notes' | 'documents'>('all');
  const [noteCounts, setNoteCounts] = useState<{ [policyId: string]: number }>({});
  const [docCounts, setDocCounts] = useState<{ [policyId: string]: number }>({});

  // Personal Information States
  const [personalInfo, setPersonalInfo] = useState<ClientPersonalInformation | null>(null);
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [personalForm, setPersonalForm] = useState<ClientPersonalInformation>({
    full_name: '',
    date_of_birth: '',
    ssn: '',
    email: '',
    phone: '',
    tax_members: 1,
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

  // Residence States
  const [residenceInfo, setResidenceInfo] = useState<ClientResidenceInformation | null>(null);
  const [isEditingResidence, setIsEditingResidence] = useState(false);
  const [residenceForm, setResidenceForm] = useState<ClientResidenceInformation>({
    address: '',
    city: '',
    zip_code: '',
    county: '',
  });
  const [savingResidence, setSavingResidence] = useState(false);
  const [residenceError, setResidenceError] = useState<string | null>(null);

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
  const fetchClientDetails = async () => {
    try {
      setLoadingClient(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserEmail(session.user.email || 'Agent');
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
  };

  // Fetch policies
  const fetchPolicies = async () => {
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
      setPolicies(data || []);
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
  };

  // Fetch Personal Information
  const fetchPersonalInformation = async () => {
    try {
      setLoadingPersonal(true);
      if (!isValidUuid(clientId)) {
        setPersonalInfo(null);
        setLoadingPersonal(false);
        return;
      }

      const { data, error } = await supabase
        .from('client_personal_information')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      if (error) throw error;
      setPersonalInfo(data);
      if (data) {
        setPersonalForm({
          full_name: data.full_name || '',
          date_of_birth: data.date_of_birth || '',
          ssn: data.ssn || '',
          email: data.email || '',
          phone: data.phone || '',
          tax_members: data.tax_members || 1,
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
        // Default values pre-filled from client master details
        setPersonalForm(prev => ({
          ...prev,
          full_name: client?.full_name || '',
          email: client?.email || '',
          phone: client?.phone || '',
        }));
      }
    } catch (err: any) {
      console.error('Error fetching personal info:', err);
    } finally {
      setLoadingPersonal(false);
    }
  };

  // Fetch Residence Information
  const fetchResidenceInformation = async () => {
    try {
      setLoadingResidence(true);
      if (!isValidUuid(clientId)) {
        setResidenceInfo(null);
        setLoadingResidence(false);
        return;
      }

      const { data, error } = await supabase
        .from('client_residence_information')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      if (error) throw error;
      setResidenceInfo(data);
      if (data) {
        setResidenceForm({
          address: data.address || '',
          city: data.city || '',
          zip_code: data.zip_code || '',
          county: data.county || '',
        });
      } else {
        // Pre-fill from master clients table if exists
        setResidenceForm(prev => ({
          ...prev,
          address: client?.address || '',
        }));
      }
    } catch (err: any) {
      console.error('Error fetching residence info:', err);
    } finally {
      setLoadingResidence(false);
    }
  };

  // Fetch Income Information
  const fetchIncomeInformation = async () => {
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
    } catch (err: any) {
      console.error('Error fetching income info:', err);
    } finally {
      setLoadingIncome(false);
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

  // Fetch timeline events
  const fetchTimelineEvents = async () => {
    try {
      setEventsLoading(true);
      setEventsError(null);

      // 1. Fetch activity_events without profiles relation
      const { data: eventsData, error: eventsErr } = await supabase
        .from('activity_events')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (eventsErr) throw eventsErr;

      const loadedEvents = (eventsData || []) as ActivityEvent[];

      // 2. Collect unique actor_id values
      const actorIds = Array.from(new Set(loadedEvents.map(e => e.actor_id).filter(Boolean)));

      // 3. Fetch profiles separately
      let profilesMap: { [id: string]: { name?: string | null; full_name?: string | null; email?: string | null } } = {};
      if (actorIds.length > 0) {
        const { data: profilesData, error: profilesErr } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', actorIds);

        if (profilesErr) {
          console.error('Error fetching profiles for timeline:', profilesErr);
        } else if (profilesData) {
          profilesData.forEach((p: any) => {
            profilesMap[p.id] = {
              name: p.name,
              full_name: p.full_name || null,
              email: p.email
            };
          });
        }
      }

      // Get current logged in user details for fallback
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;
      const currentUserEmailAddr = session?.user?.email || null;

      // 4. Merge profiles and author displays into events
      const mergedEvents = loadedEvents.map(evt => {
        const profile = profilesMap[evt.actor_id];
        let authorDisplay = 'Agent';

        if (profile) {
          authorDisplay = profile.full_name || profile.name || profile.email || 'Agent';
        } else if (currentUserId && evt.actor_id === currentUserId && currentUserEmailAddr) {
          authorDisplay = currentUserEmailAddr;
        }

        return {
          ...evt,
          profiles: profile ? {
            name: authorDisplay,
            email: profile.email || null
          } : {
            name: authorDisplay,
            email: null
          }
        };
      });

      setEvents(mergedEvents);
    } catch (err: any) {
      console.error('Error fetching timeline events:', err);
      setEventsError(err?.message || 'Failed to fetch timeline.');
    } finally {
      setEventsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'timeline') {
      fetchTimelineEvents();
    }
  }, [activeTab]);

  useEffect(() => {
    fetchClientDetails();
    fetchPolicies();
  }, [clientId]);

  // Lazy load modules only when tab is active
  useEffect(() => {
    if (activeTab === 'personal-info' && client) {
      fetchPersonalInformation();
      fetchResidenceInformation();
      fetchIncomeInformation();
    }
  }, [activeTab, client]);

  // Clean irrelevant conditional values from form payload before database storage
  const cleanPersonalPayload = (form: ClientPersonalInformation) => {
    const cleaned = { ...form };
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
      cleaned.immigration_expiration_date = '';
      cleaned.immigration_other_description = '';
    } else if (cleaned.immigration_status === 'Other') {
      cleaned.alien_number = '';
      cleaned.card_number = '';
      cleaned.uscis_number = '';
      cleaned.immigration_category = '';
      cleaned.immigration_expiration_date = '';
    } else {
      cleaned.alien_number = '';
      cleaned.card_number = '';
      cleaned.uscis_number = '';
      cleaned.immigration_category = '';
      cleaned.immigration_expiration_date = '';
      cleaned.immigration_other_description = '';
    }
    return cleaned;
  };

  // Save Personal Info
  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPersonal(true);
    setPersonalError(null);

    const payload = cleanPersonalPayload(personalForm);

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

      // 2. Sync master clients values
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
    if (agentProfile?.name) {
      return agentProfile.name;
    }
    return currentUserEmail || 'Agent';
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  // computed stats for overview dashboard
  const activeCount = policies.filter(p => p.status === 'Active').length;
  const pendingCount = policies.filter(p => p.status === 'Pending').length;

  const expiringSoonCount = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sixtyDaysFromNow = new Date();
    sixtyDaysFromNow.setDate(today.getDate() + 60);
    sixtyDaysFromNow.setHours(23, 59, 59, 999);

    return policies.filter(p => {
      if (!p.expiration_date || p.status === 'Cancelled') return false;
      const expDate = new Date(p.expiration_date + 'T00:00:00');
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
      <div className="w-full space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/clients" className="hover:text-blue-600 transition-colors">Clients</Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">{loadingClient ? 'Loading...' : client?.full_name}</span>
        </div>

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
            <aside className="w-full lg:w-[280px] bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6 flex-shrink-0 lg:sticky lg:top-6">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Client Profile</span>
                <h2 className="text-2xl font-extrabold text-slate-900 mt-1 truncate">{client?.full_name}</h2>
              </div>

              <div className="border-t border-slate-100 pt-5 space-y-4">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Agent</span>
                  <span className="text-sm font-semibold text-slate-800 block mt-1">{getAgentDisplayName()}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Agency</span>
                  <span className="text-sm font-semibold text-slate-800 block mt-1">{client?.agency_name || '-'}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Email Address</span>
                  <a href={`mailto:${client?.email}`} className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline block mt-1 truncate">
                    {client?.email || '-'}
                  </a>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone Number</span>
                  <a href={`tel:${client?.phone}`} className="text-sm font-semibold text-slate-800 hover:text-blue-600 block mt-1">
                    {client?.phone || '-'}
                  </a>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Address</span>
                  <span className="text-sm font-medium text-slate-700 block mt-1 leading-relaxed">
                    {client?.address || '-'}
                  </span>
                </div>
              </div>
            </aside>

            {/* Main Area */}
            <div className="flex-1 w-full space-y-6">
              
              {/* Tabs and Actions bar */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex border-b sm:border-b-0 border-slate-100 pb-2 sm:pb-0">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`pb-2 sm:pb-0 px-4 text-sm font-bold transition-all ${
                      activeTab === 'overview'
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-slate-550 hover:text-blue-600'
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => setActiveTab('personal-info')}
                    className={`pb-2 sm:pb-0 px-4 text-sm font-bold transition-all ${
                      activeTab === 'personal-info'
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-slate-550 hover:text-blue-600'
                    }`}
                  >
                    Personal Info
                  </button>
                  <button
                    onClick={() => setActiveTab('policies')}
                    className={`pb-2 sm:pb-0 px-4 text-sm font-bold transition-all ${
                      activeTab === 'policies'
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-slate-550 hover:text-blue-600'
                    }`}
                  >
                    Policies
                  </button>
                  <button
                    onClick={() => setActiveTab('timeline')}
                    className={`pb-2 sm:pb-0 px-4 text-sm font-bold transition-all ${
                      activeTab === 'timeline'
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-slate-550 hover:text-blue-600'
                    }`}
                  >
                    Timeline
                  </button>
                </div>
                
                {activeTab === 'policies' && policies.length > 0 && (
                  <div className="flex justify-end gap-3">
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

                      {/* Recent Policies Section */}
                      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                          <h4 className="text-base font-extrabold text-slate-900">Recent Policies</h4>
                          <button
                            onClick={() => setActiveTab('policies')}
                            className="text-xs font-bold text-blue-650 hover:text-blue-850 transition-colors flex items-center gap-1"
                          >
                            View All Policies
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>

                        {recentPolicies.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-6">No recent policies found.</p>
                        ) : (
                          <div className="space-y-3">
                            {recentPolicies.map((policy) => (
                              <div
                                key={policy.id}
                                className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                              >
                                <div className="space-y-1.5 min-w-0 flex-1">
                                  {/* Line 1: Status & LOB & Number */}
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border flex-shrink-0 ${
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

                                    <span className="font-extrabold text-slate-800 text-sm">
                                      {policy.policy_type}
                                      {policy.policy_subtype ? ` (${policy.policy_subtype})` : ''}
                                      {policy.policy_number ? ` | ${policy.policy_number}` : ''}
                                    </span>
                                  </div>

                                  {/* Line 2: Company */}
                                  <div className="text-xs text-slate-400 font-medium">
                                    {policy.writing_company ?? policy.company_name ?? 'Company not specified'}
                                  </div>

                                  {/* Line 3, 4, 5: Term, Premium, Transaction Type */}
                                  <div className="flex flex-col gap-1 text-xs text-slate-550">
                                    <div>
                                      <span className="text-slate-400">Term: </span>
                                      <span>
                                        {policy.effective_date && policy.expiration_date
                                          ? `${formatIsoToUsDate(policy.effective_date)} to ${formatIsoToUsDate(policy.expiration_date)}`
                                          : 'Not provided'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400">Premium: </span>
                                      <strong className="text-slate-800">{formatCurrency(policy.total_premium ?? policy.premium)}</strong>
                                    </div>
                                    <div>
                                      <span className="text-slate-400">Transaction Type: </span>
                                      <strong>{policy.transaction_type || 'New'}</strong>
                                    </div>
                                  </div>
                                </div>

                                {/* Actions / Placeholders */}
                                <div className="flex items-center gap-4 sm:justify-end text-xs text-slate-400 whitespace-nowrap">
                                  <span>Documents: {docCounts[policy.id] || 0}</span>
                                  <span>|</span>
                                  <span>Notes: {noteCounts[policy.id] || 0}</span>
                                  <Link
                                    href={`/clients/${clientId}/policies/${policy.id}`}
                                    className="text-blue-650 hover:text-blue-850 font-bold ml-2 bg-white border border-slate-100 px-3 py-1.5 rounded-lg shadow-sm hover:shadow transition-all"
                                  >
                                    View
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* POLICIES TAB CONTENT (Functional list, edit/delete actions, search/filters, details table) */}
              {activeTab === 'policies' && (
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
                          className="text-[10px] font-bold text-rose-600 hover:text-rose-800 transition-colors"
                        >
                          Clear Filters
                        </button>
                      )}
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
                                  {policy.policy_type}
                                  {policy.policy_subtype ? ` (${policy.policy_subtype})` : ''}
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
              )}

              {/* PERSONAL INFO TAB CONTENT */}
              {activeTab === 'personal-info' && (
                <div className="space-y-6">
                  
                  {/* SECTION 1: Personal Information Card */}
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 relative">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                      <h3 className="text-lg font-extrabold text-slate-900">Personal Information</h3>
                      {!isEditingPersonal ? (
                        <button
                          onClick={() => setIsEditingPersonal(true)}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg transition-all"
                        >
                          Edit Info
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setIsEditingPersonal(false);
                              setPersonalError(null);
                            }}
                            className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg transition-all"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSavePersonal}
                            disabled={savingPersonal}
                            className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-all shadow-md disabled:opacity-50"
                          >
                            {savingPersonal ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      )}
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
                      <form onSubmit={handleSavePersonal} className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                        
                        {/* Left Column */}
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Applicant Name</label>
                            {isEditingPersonal ? (
                              <input
                                type="text"
                                value={personalForm.full_name}
                                onChange={e => setPersonalForm(prev => ({ ...prev, full_name: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                                required
                              />
                            ) : (
                              <span className="font-semibold text-slate-800 block min-h-[20px]">{personalForm.full_name || '-'}</span>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">DOB</label>
                            {isEditingPersonal ? (
                              <input
                                type="date"
                                value={personalForm.date_of_birth}
                                onChange={e => setPersonalForm(prev => ({ ...prev, date_of_birth: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                              />
                            ) : (
                              <span className="font-semibold text-slate-800 block min-h-[20px]">
                                {personalForm.date_of_birth ? new Date(personalForm.date_of_birth + 'T00:00:00').toLocaleDateString() : '-'}
                              </span>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Age</label>
                            <span className="font-semibold text-slate-500 block bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 min-h-[42px] flex items-center">
                              {calculateAge(personalForm.date_of_birth)}
                            </span>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">SSN</label>
                            {isEditingPersonal ? (
                              <input
                                type="text"
                                value={personalForm.ssn}
                                onChange={e => setPersonalForm(prev => ({ ...prev, ssn: e.target.value }))}
                                placeholder="e.g. 000-00-0000"
                                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                              />
                            ) : (
                              <span className="font-semibold text-slate-800 block min-h-[20px]">{personalForm.ssn || '-'}</span>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Phone</label>
                            {isEditingPersonal ? (
                              <input
                                type="text"
                                value={personalForm.phone}
                                onChange={e => setPersonalForm(prev => ({ ...prev, phone: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                              />
                            ) : (
                              <span className="font-semibold text-slate-800 block min-h-[20px]">{personalForm.phone || '-'}</span>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email</label>
                            {isEditingPersonal ? (
                              <input
                                type="email"
                                value={personalForm.email}
                                onChange={e => setPersonalForm(prev => ({ ...prev, email: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                              />
                            ) : (
                              <span className="font-semibold text-slate-850 block min-h-[20px] truncate">{personalForm.email || '-'}</span>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Number of Tax Members</label>
                            {isEditingPersonal ? (
                              <input
                                type="number"
                                value={personalForm.tax_members}
                                onChange={e => setPersonalForm(prev => ({ ...prev, tax_members: Number(e.target.value) }))}
                                min={1}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                              />
                            ) : (
                              <span className="font-semibold text-slate-800 block min-h-[20px]">{personalForm.tax_members}</span>
                            )}
                          </div>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Gender</label>
                            {isEditingPersonal ? (
                              <select
                                value={personalForm.gender}
                                onChange={e => setPersonalForm(prev => ({ ...prev, gender: e.target.value as any }))}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                              >
                                <option value="">Select Gender</option>
                                <option value="Female">Female</option>
                                <option value="Male">Male</option>
                              </select>
                            ) : (
                              <span className="font-semibold text-slate-800 block min-h-[20px]">{personalForm.gender || '-'}</span>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Marital Status</label>
                            {isEditingPersonal ? (
                              <select
                                value={personalForm.marital_status}
                                onChange={e => setPersonalForm(prev => ({ ...prev, marital_status: e.target.value as any }))}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                              >
                                <option value="">Select Status</option>
                                <option value="Single">Single</option>
                                <option value="Married">Married</option>
                              </select>
                            ) : (
                              <span className="font-semibold text-slate-800 block min-h-[20px]">{personalForm.marital_status || '-'}</span>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Immigration Status</label>
                            {isEditingPersonal ? (
                              <select
                                value={personalForm.immigration_status}
                                onChange={e => setPersonalForm(prev => ({ ...prev, immigration_status: e.target.value as any }))}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                              >
                                <option value="">Select Status</option>
                                <option value="Resident">Resident</option>
                                <option value="Work Permit">Work Permit</option>
                                <option value="Citizen">Citizen</option>
                                <option value="Other">Other</option>
                              </select>
                            ) : (
                              <span className="font-semibold text-slate-800 block min-h-[20px]">{personalForm.immigration_status || '-'}</span>
                            )}
                          </div>

                          {/* CONDITIONAL IMMIGRATION FIELDS DIRECTLY BELOW IMMIGRATION STATUS */}

                          {/* Resident fields */}
                          {personalForm.immigration_status === 'Resident' && (
                            <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 space-y-4 animate-fade-in">
                              <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Alien Number</label>
                                {isEditingPersonal ? (
                                  <input
                                    type="text"
                                    value={personalForm.alien_number}
                                    onChange={e => setPersonalForm(prev => ({ ...prev, alien_number: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-slate-800 text-xs outline-none transition-all"
                                  />
                                ) : (
                                  <span className="font-semibold text-slate-800 block min-h-[16px]">{personalForm.alien_number || '-'}</span>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Card Number</label>
                                {isEditingPersonal ? (
                                  <input
                                    type="text"
                                    value={personalForm.card_number}
                                    onChange={e => setPersonalForm(prev => ({ ...prev, card_number: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-slate-800 text-xs outline-none transition-all"
                                  />
                                ) : (
                                  <span className="font-semibold text-slate-800 block min-h-[16px]">{personalForm.card_number || '-'}</span>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Expiration Date</label>
                                {isEditingPersonal ? (
                                  <input
                                    type="date"
                                    value={personalForm.immigration_expiration_date}
                                    onChange={e => setPersonalForm(prev => ({ ...prev, immigration_expiration_date: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-slate-800 text-xs outline-none transition-all"
                                  />
                                ) : (
                                  <span className="font-semibold text-slate-800 block min-h-[16px]">
                                    {personalForm.immigration_expiration_date ? new Date(personalForm.immigration_expiration_date + 'T00:00:00').toLocaleDateString() : '-'}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Work Permit fields */}
                          {personalForm.immigration_status === 'Work Permit' && (
                            <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 space-y-4 animate-fade-in">
                              <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Card Number</label>
                                {isEditingPersonal ? (
                                  <input
                                    type="text"
                                    value={personalForm.card_number}
                                    onChange={e => setPersonalForm(prev => ({ ...prev, card_number: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-slate-800 text-xs outline-none transition-all"
                                  />
                                ) : (
                                  <span className="font-semibold text-slate-800 block min-h-[16px]">{personalForm.card_number || '-'}</span>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">USCIS Number</label>
                                {isEditingPersonal ? (
                                  <input
                                    type="text"
                                    value={personalForm.uscis_number}
                                    onChange={e => setPersonalForm(prev => ({ ...prev, uscis_number: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-slate-800 text-xs outline-none transition-all"
                                  />
                                ) : (
                                  <span className="font-semibold text-slate-800 block min-h-[16px]">{personalForm.uscis_number || '-'}</span>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Category</label>
                                {isEditingPersonal ? (
                                  <input
                                    type="text"
                                    value={personalForm.immigration_category}
                                    onChange={e => setPersonalForm(prev => ({ ...prev, immigration_category: e.target.value }))}
                                    placeholder="e.g. C09"
                                    className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-slate-800 text-xs outline-none transition-all"
                                  />
                                ) : (
                                  <span className="font-semibold text-slate-800 block min-h-[16px]">{personalForm.immigration_category || '-'}</span>
                                )}
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Expiration Date</label>
                                {isEditingPersonal ? (
                                  <input
                                    type="date"
                                    value={personalForm.immigration_expiration_date}
                                    onChange={e => setPersonalForm(prev => ({ ...prev, immigration_expiration_date: e.target.value }))}
                                    className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-slate-800 text-xs outline-none transition-all"
                                  />
                                ) : (
                                  <span className="font-semibold text-slate-800 block min-h-[16px]">
                                    {personalForm.immigration_expiration_date ? new Date(personalForm.immigration_expiration_date + 'T00:00:00').toLocaleDateString() : '-'}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Other fields */}
                          {personalForm.immigration_status === 'Other' && (
                            <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 space-y-2 animate-fade-in">
                              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Other Immigration Status Description</label>
                              {isEditingPersonal ? (
                                <textarea
                                  value={personalForm.immigration_other_description}
                                  onChange={e => setPersonalForm(prev => ({ ...prev, immigration_other_description: e.target.value }))}
                                  className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-slate-800 text-xs outline-none transition-all h-20 resize-none"
                                  placeholder="e.g. Asylee, TPS"
                                />
                              ) : (
                                <p className="font-semibold text-slate-700 leading-relaxed text-xs block min-h-[16px] whitespace-pre-line">
                                  {personalForm.immigration_other_description || '-'}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </form>
                    )}
                  </div>

                  {/* SECTION 2: Residence Information Card */}
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 relative">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                      <h3 className="text-lg font-extrabold text-slate-900">Residence Information</h3>
                      {!isEditingResidence ? (
                        <button
                          onClick={() => setIsEditingResidence(true)}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg transition-all"
                        >
                          Edit Info
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setIsEditingResidence(false);
                              setResidenceError(null);
                            }}
                            className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg transition-all"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveResidence}
                            disabled={savingResidence}
                            className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-all shadow-md disabled:opacity-50"
                          >
                            {savingResidence ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      )}
                    </div>

                    {residenceError && (
                      <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm">
                        {residenceError}
                      </div>
                    )}

                    {googleMapsWarning && (
                      <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-xs leading-relaxed">
                        {googleMapsWarning}
                      </div>
                    )}

                    {loadingResidence ? (
                      <div className="flex justify-center items-center py-10">
                        <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                    ) : (
                      <form onSubmit={handleSaveResidence} className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Address</label>
                          {isEditingResidence ? (
                            <input
                              type="text"
                              ref={autocompleteInputRef}
                              value={residenceForm.address}
                              onChange={e => setResidenceForm(prev => ({ ...prev, address: e.target.value }))}
                              placeholder="Search address or enter manually"
                              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                              required
                            />
                          ) : (
                            <span className="font-semibold text-slate-800 block min-h-[20px]">{residenceForm.address || '-'}</span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 md:col-span-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">City</label>
                            {isEditingResidence ? (
                              <input
                                type="text"
                                value={residenceForm.city}
                                onChange={e => setResidenceForm(prev => ({ ...prev, city: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                                required
                              />
                            ) : (
                              <span className="font-semibold text-slate-800 block min-h-[20px]">{residenceForm.city || '-'}</span>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Zip Code</label>
                            {isEditingResidence ? (
                              <input
                                type="text"
                                value={residenceForm.zip_code}
                                onChange={e => setResidenceForm(prev => ({ ...prev, zip_code: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                                required
                              />
                            ) : (
                              <span className="font-semibold text-slate-800 block min-h-[20px]">{residenceForm.zip_code || '-'}</span>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">County</label>
                            {isEditingResidence ? (
                              <input
                                type="text"
                                value={residenceForm.county}
                                onChange={e => setResidenceForm(prev => ({ ...prev, county: e.target.value }))}
                                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                              />
                            ) : (
                              <span className="font-semibold text-slate-800 block min-h-[20px]">{residenceForm.county || '-'}</span>
                            )}
                          </div>
                        </div>
                      </form>
                    )}
                  </div>

                  {/* SECTION 3: Income Information Card */}
                  <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                      <h3 className="text-lg font-extrabold text-slate-900">Income Information</h3>
                      <button
                        onClick={handleOpenAddIncome}
                        className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-all shadow-md active:scale-95"
                      >
                        Add Income
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
                      <div className="text-center py-12">
                        <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h4 className="text-sm font-semibold text-slate-700">No income records</h4>
                        <p className="text-xs text-slate-400 mt-0.5">Register client employment or other income sources.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {incomeList.map((income) => (
                          <div
                            key={income.id}
                            className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                          >
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs flex-1">
                              <div>
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Relationship</span>
                                <span className="font-semibold text-slate-800">{income.relationship_to_applicant}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Employer / Source</span>
                                <span className="font-semibold text-slate-800 truncate block">{income.employer_name || '-'}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Income Type</span>
                                <span className="font-semibold text-slate-850">{income.income_type}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Amount</span>
                                <strong className="text-emerald-700 font-extrabold text-sm">{formatCurrency(income.income)}</strong>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 justify-end pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                              <button
                                onClick={() => handleOpenEditIncome(income)}
                                className="text-xs font-bold text-blue-600 hover:text-blue-800"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteIncome(income.id)}
                                className="text-xs font-bold text-rose-500 hover:text-rose-700"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'timeline' && (() => {
        const filteredEvents = events.filter(evt => {
          if (timelineFilter === 'policies') {
            return evt.event_type.startsWith('policy_');
          }
          if (timelineFilter === 'notes') {
            return evt.event_type.startsWith('note_');
          }
          if (timelineFilter === 'documents') {
            return evt.event_type.startsWith('document_');
          }
          return true;
        });

        // Group by calendar date (MM/DD/YYYY)
        const groupEventsByDate = (eventsList: ActivityEvent[]) => {
          const groups: { [key: string]: ActivityEvent[] } = {};
          eventsList.forEach(evt => {
            const dateStr = new Date(evt.created_at).toLocaleDateString('en-US', {
              month: '2-digit',
              day: '2-digit',
              year: 'numeric'
            });
            if (!groups[dateStr]) {
              groups[dateStr] = [];
            }
            groups[dateStr].push(evt);
          });
          return groups;
        };

        const groupedEvents = groupEventsByDate(filteredEvents);
        const uniqueDates = Array.from(new Set(filteredEvents.map(evt => 
          new Date(evt.created_at).toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
          })
        )));

        return (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
            {/* Timeline Header & Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-50 pb-4 gap-4">
              <h3 className="text-lg font-extrabold text-slate-900 font-sans">Client Activity Timeline</h3>
              <div className="flex bg-slate-50 border border-slate-200/60 p-1 rounded-xl gap-1">
                <button
                  onClick={() => setTimelineFilter('all')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    timelineFilter === 'all'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-550 hover:text-slate-800'
                  }`}
                >
                  All Activity
                </button>
                <button
                  onClick={() => setTimelineFilter('policies')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    timelineFilter === 'policies'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-550 hover:text-slate-800'
                  }`}
                >
                  Policies
                </button>
                <button
                  onClick={() => setTimelineFilter('notes')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    timelineFilter === 'notes'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-550 hover:text-slate-800'
                  }`}
                >
                  Notes
                </button>
                <button
                  onClick={() => setTimelineFilter('documents')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    timelineFilter === 'documents'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-550 hover:text-slate-800'
                  }`}
                >
                  Documents
                </button>
              </div>
            </div>

            {/* Timeline Body */}
            {eventsLoading ? (
              <div className="flex justify-center items-center py-20">
                <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : eventsError ? (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm">
                {eventsError}
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-slate-200 rounded-2xl">
                <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-slate-400 font-sans">No events found for this client.</p>
              </div>
            ) : (
              <div className="relative border-l border-slate-100 ml-4 pl-6 space-y-8">
                {uniqueDates.map(dateStr => {
                  const dayEvents = groupedEvents[dateStr] || [];
                  return (
                    <div key={dateStr} className="space-y-4">
                      {/* Date Header */}
                      <div className="relative -ml-[31px] flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-50" />
                        <span className="text-xs font-bold text-slate-400 font-sans tracking-wider uppercase bg-white px-2">
                          {dateStr}
                        </span>
                      </div>

                      {/* Events List for this date */}
                      <div className="space-y-4">
                        {dayEvents.map(evt => {
                          const actorDisplay = evt.profiles?.name || evt.profiles?.email || 'Agent';
                          const timeStr = new Date(evt.created_at).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          });

                          const policyLabel = evt.metadata?.line_of_business || evt.metadata?.policy_number;

                          return (
                            <div key={evt.id} className="bg-slate-50/50 border border-slate-100/85 rounded-xl p-4 space-y-1.5 shadow-sm hover:shadow-md transition-all">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                                <h4 className="text-sm font-extrabold text-slate-800 font-sans">
                                  {evt.title}
                                </h4>
                                <span className="text-[10px] font-bold text-slate-400 font-sans">
                                  {timeStr} • By {actorDisplay}
                                </span>
                              </div>
                              {evt.description && (
                                <p className="text-xs text-slate-655 font-sans">
                                  {evt.description}
                                </p>
                              )}

                              {evt.policy_id && (
                                <div className="pt-1 text-xs">
                                  <span className="text-slate-450 font-sans">Related Policy: </span>
                                  <Link
                                    href={`/clients/${clientId}/policies/${evt.policy_id}`}
                                    className="text-blue-650 hover:text-blue-800 font-bold font-sans inline-flex items-center gap-0.5 hover:underline"
                                  >
                                    {policyLabel ? `${evt.metadata?.line_of_business || ''}${evt.metadata?.policy_number ? ` | ${evt.metadata?.policy_number}` : ''}` : 'View Policy'}
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                                    </svg>
                                  </Link>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}
            </div>
          </div>
        )}
      </div>

      {/* POLICY MODALS REMOVED */}

      {/* INCOME MODALS */}

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

      
    </DashboardLayout>
  );
}
