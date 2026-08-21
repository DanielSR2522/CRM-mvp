'use client';

import React, { useState, useEffect, useRef, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import HealthClientHeader from '@/components/health/HealthClientHeader';
import CollapsibleSidebar from '@/components/common/CollapsibleSidebar';
import UnifiedNotesManager from '@/components/notes/UnifiedNotesManager';
import { NoteCategory } from '@/lib/notes/types';
import { supabase } from '@/lib/supabaseClient';
import { LINES_OF_BUSINESS } from '@/constants/linesOfBusiness';
import {
  formatIsoToUsDate,
  usDateToIso,
  calculateTermDuration,
  formatAsDateInput,
} from '@/utils/dateUtils';
import { formatDateMMDDYYYY, formatDateTimeMMDDYYYY } from '@/lib/formatters/date';
import FileDropzone from '@/components/ui/FileDropzone';
import DatePicker from '@/components/ui/DatePicker';
import { useBusinessLines } from '@/contexts/BusinessLinesContext';
import { DocumentPreviewModal } from '@/components/documents/DocumentPreviewModal';

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
}

interface AgentProfile {
  name: string | null;
  email: string | null;
}

interface Client {
  id: string;
  agent_id: string;
  full_name: string;
  client_type?: 'personal' | 'company' | null;
  agency_name: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  agent?: AgentProfile | null;
}

export default function PolicyProfilePage({ params }: { params: Promise<{ id: string; policyId: string }> }) {
  const router = useRouter();
  const { id, policyId } = use(params);

  // States
  const [clientName, setClientName] = useState('');
  const [policy, setPolicy] = useState<Policy | null>(null);

  // Client Sidebar States
  const [client, setClient] = useState<Client | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);
  const [clientError, setClientError] = useState<string | null>(null);
  const [agentProfile, setAgentProfile] = useState<AgentProfile | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('Agent');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Menu State
  const [activeMenuTab, setActiveMenuTab] = useState<'summary' | 'documents' | 'notes' | 'chronology'>('summary');

  // Note interface
  interface PolicyNote {
    id: string;
    policy_id: string;
    author_id: string;
    content: string;
    created_at: string;
    updated_at: string;
    profiles?: {
      name: string | null;
      email: string | null;
    } | null;
  }

  // Notes tab states
  const [notes, setNotes] = useState<PolicyNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [noteActionError, setNoteActionError] = useState<string | null>(null);
  const [noteActionSuccess, setNoteActionSuccess] = useState<string | null>(null);

  // Document Section Interface
  interface DocumentSection {
    id: string;
    policy_id: string;
    name: string;
    position: number;
    created_by: string;
    created_at: string;
    updated_at: string;
  }

  // Document Metadata Interface
  interface PolicyDocument {
    id: string;
    policy_id: string;
    section_id: string | null;
    uploaded_by: string;
    display_name: string;
    original_filename: string;
    storage_path: string;
    mime_type: string | null;
    size_bytes: number;
    created_at: string;
    updated_at: string;
    is_unified_document?: boolean;
  }

  // Note Attachment interface
  interface NoteAttachment {
    id: string;
    note_id: string;
    policy_id: string;
    uploaded_by: string;
    display_name: string;
    original_filename: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
    created_at: string;
  }

  // Pending clipboard/file image before save
  interface PendingAttachment {
    file: File;
    previewUrl: string;
    displayName: string;
  }

  // Documents tab states
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  // Section CRUD states
  const [savingSection, setSavingSection] = useState(false);
  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null);
  const [renamingSectionName, setRenamingSectionName] = useState('');

  // Document CRUD states
  const [uploadingFiles, setUploadingFiles] = useState<{ [sectionId: string]: boolean }>({});
  const [uploadProgress, setUploadProgress] = useState<{ [filename: string]: number }>({});
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renamingDocName, setRenamingDocName] = useState('');

  // Resolved profiles map
  const [uploaderProfiles, setUploaderProfiles] = useState<{ [userId: string]: string }>({});

  // Note attachment states
  const [noteAttachments, setNoteAttachments] = useState<{ [noteId: string]: NoteAttachment[] }>({});
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const noteImageInputRef = useRef<HTMLInputElement>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);

  // Activity Event interface
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

  // Chronology tab states
  const [chronoEvents, setChronoEvents] = useState<ActivityEvent[]>([]);
  const [chronoLoading, setChronoLoading] = useState(false);
  const [chronoError, setChronoError] = useState<string | null>(null);
  const [chronoFilter, setChronoFilter] = useState<'all' | 'policies' | 'notes' | 'documents'>('all');

  // Form Field States
  const [lob, setLob] = useState('');
  const [transactionType, setTransactionType] = useState<'New Business' | 'Renewal'>('New Business');
  const [policyNumber, setPolicyNumber] = useState('');
  const [paymentFrequency, setPaymentFrequency] = useState<'Annual' | 'Monthly'>('Annual');
  const [effectiveDate, setEffectiveDate] = useState(''); // MM/DD/YYYY
  const [expirationDate, setExpirationDate] = useState(''); // MM/DD/YYYY
  const [billingType, setBillingType] = useState<'Direct Bill' | 'Agency Bill'>('Direct Bill');
  const [brokerName, setBrokerName] = useState('');
  const [writingCompany, setWritingCompany] = useState('');
  const [cargo, setCargo] = useState('');
  const [policyOwnershipType, setPolicyOwnershipType] = useState<'personal' | 'company'>('personal');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [useAddressOnFile, setUseAddressOnFile] = useState(false);
  const [residenceError, setResidenceError] = useState<string | null>(null);
  const [totalPremium, setTotalPremium] = useState<number | ''>('');
  const [annualPremium, setAnnualPremium] = useState<number | ''>('');
  const [policyStatus, setPolicyStatus] = useState<'Active' | 'Cancelled' | 'Expired' | 'Pending'>('Active');

  // Linked Personal Client State
  interface LinkedPersonalClient {
    personal_client_id: string;
    linked_person_role: 'main_applicant' | 'co_applicant';
    client: {
      id: string;
      full_name: string;
      email: string | null;
      phone: string | null;
    } | null;
  }

  const [linkedPersonalClient, setLinkedPersonalClient] = useState<LinkedPersonalClient | null>(null);
  const [loadingLinkedClient, setLoadingLinkedClient] = useState(false);

  // Unlinking State
  const [isConfirmUnlinkOpen, setIsConfirmUnlinkOpen] = useState(false);
  const [unlinkingClient, setUnlinkingClient] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  // Policy Lifecycle State (Renew & Cancel)
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [renewEffectiveDate, setRenewEffectiveDate] = useState('');
  const [renewExpirationDate, setRenewExpirationDate] = useState('');
  const [renewPremium, setRenewPremium] = useState<number | ''>('');
  const [renewError, setRenewError] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [existingRenewalId, setExistingRenewalId] = useState<string | null>(null);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('Client Requested');
  const [cancellationNotes, setCancellationNotes] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);



  // Client Personal and Residence States
  const [personalInfo, setPersonalInfo] = useState<any>(null);
  const [residenceInfo, setResidenceInfo] = useState<any>(null);
  const [noAddressMessage, setNoAddressMessage] = useState<string | null>(null);

  // Fetch client details for sidebar
  const fetchClientDetails = async () => {
    try {
      setLoadingClient(true);
      setClientError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserEmail(session.user.email || 'Agent');
        setCurrentUserId(session.user.id);
      }

      const [clientRes, personalRes, residenceRes] = await Promise.all([
        supabase
          .from('clients')
          .select('*')
          .eq('id', id)
          .single(),
        supabase
          .from('client_personal_information')
          .select('*')
          .eq('client_id', id)
          .maybeSingle(),
        supabase
          .from('client_residence_information')
          .select('*')
          .eq('client_id', id)
          .maybeSingle(),
      ]);

      if (clientRes.error) throw clientRes.error;
      const clientData = clientRes.data;
      const personalData = personalRes.data || null;
      const residenceData = residenceRes.data || null;

      setClient(clientData);
      setPersonalInfo(personalData);
      setResidenceInfo(residenceData);
      setClientName(personalData?.full_name || clientData?.full_name || '');

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
      setClientError(err?.message || 'Failed to load client profile.');
    } finally {
      setLoadingClient(false);
    }
  };

  // Fetch policy details
  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      // Fetch Policy
      const { data: policyData, error: policyErr } = await supabase
        .from('policies')
        .select('*')
        .eq('id', policyId)
        .single();

      if (policyErr) throw policyErr;
      if (!policyData) throw new Error('Policy not found.');

      setPolicy(policyData);
      setLob(policyData.policy_type || '');
      setTransactionType(policyData.transaction_type === 'New' ? 'New Business' : 'Renewal');
      setPolicyNumber(policyData.policy_number || '');
      setPaymentFrequency(policyData.policy_payment_frequency === 'Monthly' ? 'Monthly' : 'Annual');
      setEffectiveDate(policyData.effective_date ? formatIsoToUsDate(policyData.effective_date) : '');
      setExpirationDate(policyData.expiration_date ? formatIsoToUsDate(policyData.expiration_date) : '');
      setBillingType(policyData.billing_type === 'Agency Bill' ? 'Agency Bill' : 'Direct Bill');
      setBrokerName(policyData.broker_name || '');
      setWritingCompany(policyData.writing_company || policyData.company_name || '');
      setCargo(policyData.cargo || '');
        setPolicyOwnershipType(policyData.policy_ownership_type || 'personal');
        setAddress(policyData.address || '');
        setCity(policyData.city || '');
        setState(policyData.state || '');
        setZipCode(policyData.zip_code || '');
      setTotalPremium(policyData.total_premium ?? policyData.premium ?? '');
      setAnnualPremium(policyData.annual_premium ?? '');
      setPolicyStatus(policyData.status || 'Active');

      // Check if a renewal policy already exists for this policy
      const { data: existingRenewal } = await supabase
        .from('policies')
        .select('id')
        .eq('renewed_from_policy_id', policyId)
        .limit(1)
        .maybeSingle();

      if (existingRenewal?.id) {
        setExistingRenewalId(existingRenewal.id);
      } else {
        setExistingRenewalId(null);
      }
    } catch (err: any) {
      console.error('Error fetching policy data:', err);
      setErrorMsg(err?.message || 'Failed to load policy details.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Linked Personal Client
  const fetchLinkedPersonalClient = async () => {
    try {
      setLoadingLinkedClient(true);
      if (!policyId) {
        setLinkedPersonalClient(null);
        return;
      }

      // 1. Fetch link row from personal_commercial_policy_links
      const { data: linkData, error: linkErr } = await supabase
        .from('personal_commercial_policy_links')
        .select('personal_client_id, linked_person_role')
        .eq('commercial_policy_id', policyId)
        .maybeSingle();

      if (linkErr || !linkData) {
        setLinkedPersonalClient(null);
        return;
      }

      // 2. Fetch linked personal client from clients table
      const { data: clientData, error: clientErr } = await supabase
        .from('clients')
        .select('id, full_name, email, phone')
        .eq('id', linkData.personal_client_id)
        .single();

      if (clientErr || !clientData) {
        setLinkedPersonalClient(null);
        return;
      }

      setLinkedPersonalClient({
        personal_client_id: linkData.personal_client_id,
        linked_person_role: linkData.linked_person_role,
        client: clientData,
      });
    } catch (err) {
      console.error('Error fetching linked personal client:', err);
      setLinkedPersonalClient(null);
    } finally {
      setLoadingLinkedClient(false);
    }
  };

  // Unlink Personal Client
  const handleConfirmUnlinkClient = async () => {
    if (!linkedPersonalClient || !policyId) return;
    try {
      setUnlinkingClient(true);
      setUnlinkError(null);

      const { error } = await supabase
        .from('personal_commercial_policy_links')
        .delete()
        .eq('commercial_policy_id', policyId)
        .eq('personal_client_id', linkedPersonalClient.personal_client_id);

      if (error) throw error;

      setIsConfirmUnlinkOpen(false);
      setLinkedPersonalClient(null);
      setSuccessMsg('Personal client unlinked successfully.');
    } catch (err: any) {
      console.error('Error unlinking personal client:', err);
      setUnlinkError(err?.message || 'Failed to unlink personal client.');
    } finally {
      setUnlinkingClient(false);
    }
  };

  useEffect(() => {
    fetchClientDetails();
    fetchData();
    fetchLinkedPersonalClient();
  }, [id, policyId]);

  // Fetch policy notes
    const fetchNotes = async () => {
    try {
      setNotesLoading(true);
      setNotesError(null);
      
      // Fetch notes without profiles join
      const { data: notesData, error: notesError } = await supabase
        .from('policy_notes')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false });

      if (notesError) throw notesError;
      
      if (!notesData || notesData.length === 0) {
        setNotes([]);
        return;
      }

      // Collect unique author_ids
      const authorIds = [...new Set(notesData.map(n => n.author_id).filter(Boolean))];
      
      let profilesMap = new Map();
      if (authorIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', authorIds);
          
        if (!profilesError && profilesData) {
          profilesMap = new Map(profilesData.map(p => [p.id, p]));
        }
      }

      // Merge
      const mergedNotes = notesData.map(n => ({
        ...n,
        profiles: profilesMap.get(n.author_id) || null
      }));

      setNotes(mergedNotes as any);
    } catch (err: any) {
      console.error('Error fetching policy notes:', {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint
      });
      setNotesError(err?.message || 'Failed to fetch notes.');
    } finally {
      setNotesLoading(false);
    }
  };

  useEffect(() => {
    if (activeMenuTab === 'notes') {
      fetchNotes();
      setNoteActionError(null);
      setNoteActionSuccess(null);
    }
  }, [activeMenuTab]);

  // Fetch attachments for visible notes
  const fetchNoteAttachments = useCallback(async (noteIds: string[]) => {
    if (noteIds.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('policy_note_attachments')
        .select('*')
        .in('note_id', noteIds)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching note attachments:', error);
        return;
      }

      const grouped: { [noteId: string]: NoteAttachment[] } = {};
      (data || []).forEach((att: NoteAttachment) => {
        if (!grouped[att.note_id]) grouped[att.note_id] = [];
        grouped[att.note_id].push(att);
      });
      setNoteAttachments(grouped);
    } catch (err) {
      console.error('Error fetching note attachments:', err);
    }
  }, [policyId]);

  // Re-fetch attachments when notes change
  useEffect(() => {
    if (notes.length > 0) {
      fetchNoteAttachments(notes.map(n => n.id));
    }
  }, [notes, fetchNoteAttachments]);

  // Handle paste event on note textarea
  const handleNotePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    const maxSize = 10 * 1024 * 1024; // 10 MB

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && allowedTypes.includes(item.type)) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        if (file.size > maxSize) {
          setNoteActionError(`Image "${file.name}" exceeds 10 MB limit.`);
          continue;
        }

        const previewUrl = URL.createObjectURL(file);
        const ext = file.type.split('/')[1] || 'png';
        const displayName = `screenshot_${Date.now()}.${ext}`;

        setPendingAttachments(prev => [...prev, { file, previewUrl, displayName }]);
      }
    }
  }, []);

  // Handle file input for Attach Image button
  const handleAttachImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    const maxSize = 10 * 1024 * 1024;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!allowedTypes.includes(file.type)) {
        setNoteActionError(`File "${file.name}" is not a supported image type (PNG, JPEG, WebP).`);
        continue;
      }
      if (file.size > maxSize) {
        setNoteActionError(`Image "${file.name}" exceeds 10 MB limit.`);
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      setPendingAttachments(prev => [...prev, { file, previewUrl, displayName: file.name }]);
    }

    // Reset the input so the same file can be re-selected
    e.target.value = '';
  }, []);

  // Remove a pending attachment preview
  const removePendingAttachment = useCallback((index: number) => {
    setPendingAttachments(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].previewUrl);
      updated.splice(index, 1);
      return updated;
    });
  }, []);

  // Upload note attachments to Storage and insert metadata
  const uploadNoteAttachments = async (
    noteId: string,
    policyIdArg: string,
    clientIdArg: string,
    userId: string,
    attachments: PendingAttachment[]
  ): Promise<{ succeeded: string[]; failed: string[] }> => {
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const att of attachments) {
      const attachmentId = crypto.randomUUID();
      const storagePath = `${userId}/${clientIdArg}/${policyIdArg}/notes/${noteId}/${attachmentId}/${att.file.name}`;

      try {
        // 1. Upload to Storage
        const { error: uploadErr } = await supabase
          .storage
          .from('policy-documents')
          .upload(storagePath, att.file, { contentType: att.file.type, upsert: false });

        if (uploadErr) throw uploadErr;

        // 2. Insert metadata
        const { error: metaErr } = await supabase
          .from('policy_note_attachments')
          .insert({
            id: attachmentId,
            note_id: noteId,
            policy_id: policyIdArg,
            uploaded_by: userId,
            display_name: att.displayName,
            original_filename: att.file.name,
            storage_path: storagePath,
            mime_type: att.file.type,
            size_bytes: att.file.size
          });

        if (metaErr) {
          // Rollback: remove uploaded file
          console.error('Metadata insert failed, rolling back storage:', metaErr);
          await supabase.storage.from('policy-documents').remove([storagePath]);
          throw metaErr;
        }

        succeeded.push(att.displayName);

        // Log activity event (non-blocking)
        try {
          await supabase.from('activity_events').insert({
            client_id: clientIdArg,
            policy_id: policyIdArg,
            actor_id: userId,
            event_type: 'note_attachment_uploaded',
            title: 'Note attachment uploaded',
            description: `Image "${att.displayName}" was attached to a note.`,
            metadata: {
              attachment_display_name: att.displayName,
              policy_number: policyNumber || null,
              line_of_business: lob || null
            }
          });
        } catch (evErr) {
          console.error('Failed to log note attachment upload event:', evErr);
        }
      } catch (err: any) {
        console.error(`Failed to upload attachment "${att.displayName}":`, err);
        failed.push(att.displayName);
      }
    }

    return { succeeded, failed };
  };

  // Delete a single note attachment: Storage first → metadata second
  const handleDeleteAttachment = async (attachment: NoteAttachment) => {
    if (!confirm(`Are you sure you want to delete the image "${attachment.display_name}"?`)) return;

    setDeletingAttachmentId(attachment.id);
    setNoteActionError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('You must be logged in.');

      // 1. Delete from Storage
      const { data: deleteData, error: storageErr } = await supabase
        .storage
        .from('policy-documents')
        .remove([attachment.storage_path]);

      if (storageErr) throw storageErr;
      if (!deleteData || deleteData.length === 0) {
        throw new Error('Failed to delete image from storage. Metadata preserved.');
      }

      // 2. Delete metadata
      const { error: metaErr } = await supabase
        .from('policy_note_attachments')
        .delete()
        .eq('id', attachment.id);

      if (metaErr) throw metaErr;

      // 3. Update UI
      setNoteAttachments(prev => {
        const updated = { ...prev };
        if (updated[attachment.note_id]) {
          updated[attachment.note_id] = updated[attachment.note_id].filter(a => a.id !== attachment.id);
        }
        return updated;
      });

      setNoteActionSuccess('Attachment deleted successfully.');

      // Log activity event (non-blocking)
      try {
        await supabase.from('activity_events').insert({
          client_id: id,
          policy_id: policyId,
          actor_id: session.user.id,
          event_type: 'note_attachment_deleted',
          title: 'Note attachment deleted',
          description: `Image "${attachment.display_name}" was removed from a note.`,
          metadata: {
            attachment_display_name: attachment.display_name,
            policy_number: policyNumber || null,
            line_of_business: lob || null
          }
        });
      } catch (evErr) {
        console.error('Failed to log attachment deletion event:', evErr);
      }
    } catch (err: any) {
      console.error('Error deleting attachment:', err);
      setNoteActionError(err?.message || 'Failed to delete attachment.');
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  // Open a signed URL for an attachment
  const openAttachmentSignedUrl = async (storagePath: string) => {
    try {
      const { data, error } = await supabase
        .storage
        .from('policy-documents')
        .createSignedUrl(storagePath, 300); // 5 minutes

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err: any) {
      console.error('Error creating signed URL:', err);
      setNoteActionError('Failed to open image. Please try again.');
    }
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Fetch policy chronology
  const fetchChronoEvents = async () => {
    try {
      setChronoLoading(true);
      setChronoError(null);

      // 1. Fetch activity_events without profiles relation
      const { data: eventsData, error: eventsErr } = await supabase
        .from('activity_events')
        .select('*')
        .eq('policy_id', policyId)
        .eq('client_id', id)
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
          console.error('Error fetching profiles for chronology:', profilesErr);
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

      setChronoEvents(mergedEvents);
    } catch (err: any) {
      console.error('Error fetching policy chronology:', err);
      setChronoError(err?.message || 'Failed to fetch chronology.');
    } finally {
      setChronoLoading(false);
    }
  };

  useEffect(() => {
    if (activeMenuTab === 'chronology') {
      fetchChronoEvents();
    }
  }, [activeMenuTab]);

  // Fetch sections and documents (aggregating direct policy_documents + unified client_documents)
  const fetchSectionsAndDocs = async () => {
    try {
      setDocsLoading(true);
      setDocsError(null);

      const { data: sectionsData, error: sectionsErr } = await supabase
        .from('policy_document_sections')
        .select('*')
        .eq('policy_id', policyId)
        .order('position', { ascending: true });

      if (sectionsErr) throw sectionsErr;
      setSections(sectionsData || []);

      // 1. Query direct policy_documents
      const { data: docsData, error: docsErr } = await supabase
        .from('policy_documents')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false });

      if (docsErr) throw docsErr;
      const loadedDocs = (docsData || []) as PolicyDocument[];

      // 2. Query unified client_documents canonically associated with this policy_id
      const { data: unifiedData, error: unifiedErr } = await supabase
        .from('client_documents')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false });

      if (unifiedErr) {
        console.warn('Could not query unified client_documents for policy:', unifiedErr);
      }

      const unifiedDocsMapped: PolicyDocument[] = (unifiedData || []).map((uDoc: any) => ({
        id: uDoc.id,
        policy_id: uDoc.policy_id || policyId,
        section_id: null,
        uploaded_by: uDoc.agent_id,
        display_name: uDoc.display_name,
        original_filename: uDoc.original_filename,
        storage_path: uDoc.storage_path,
        mime_type: uDoc.mime_type,
        size_bytes: Number(uDoc.size_bytes || 0),
        created_at: uDoc.created_at,
        updated_at: uDoc.updated_at,
        is_unified_document: true,
      }));

      // Deduplicate by storage_path or id
      const docMap = new Map<string, PolicyDocument>();
      for (const d of loadedDocs) {
        docMap.set(d.storage_path || d.id, d);
      }
      for (const u of unifiedDocsMapped) {
        if (!docMap.has(u.storage_path || u.id)) {
          docMap.set(u.storage_path || u.id, u);
        }
      }

      const allCombinedDocs = Array.from(docMap.values());
      setDocuments(allCombinedDocs);

      const uploaderIds = Array.from(new Set(allCombinedDocs.map(d => d.uploaded_by).filter(Boolean)));
      if (uploaderIds.length > 0) {
        const { data: profilesData, error: profilesErr } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', uploaderIds);

        if (!profilesErr && profilesData) {
          const map: { [userId: string]: string } = {};
          profilesData.forEach((p: any) => {
            map[p.id] = p.name || p.email || 'Agent';
          });
          setUploaderProfiles(prev => ({ ...prev, ...map }));
        }
      }
    } catch (err: any) {
      console.error('Error fetching sections and documents:', err);
      setDocsError(err?.message || 'Failed to load documents.');
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    if (activeMenuTab === 'documents') {
      fetchSectionsAndDocs();
      setNoteActionError(null);
      setNoteActionSuccess(null);
    }
  }, [activeMenuTab]);

  // Add a new document section (max 10 limit checked at database level + here)
  const handleAddSection = async () => {
    if (sections.length >= 10) {
      alert('A policy cannot have more than 10 document sections.');
      return;
    }

    setSavingSection(true);
    setNoteActionError(null);
    setNoteActionSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('You must be logged in.');

      const nextPosition = sections.length > 0 ? Math.max(...sections.map(s => s.position)) + 1 : 0;

      const { error } = await supabase
        .from('policy_document_sections')
        .insert({
          policy_id: policyId,
          name: 'New Section',
          position: nextPosition,
          created_by: session.user.id
        });

      if (error) throw error;
      fetchSectionsAndDocs();
      setNoteActionSuccess('Section created successfully.');
    } catch (err: any) {
      console.error('Error creating section:', err);
      setNoteActionError(err?.message || 'Failed to create section.');
    } finally {
      setSavingSection(false);
    }
  };

  // Handle direct file upload (auto-creating General section if zero sections exist)
  const handleDirectOrSectionUpload = async (targetSectionId: string | null, filesList: File[] | FileList | null) => {
    if (!filesList) return;
    const filesArray = Array.isArray(filesList) ? filesList : Array.from(filesList);
    if (filesArray.length === 0) return;

    let activeSectionId = targetSectionId;

    if (!activeSectionId) {
      // Check loaded sections
      const generalSec = sections.find(s => s.name === 'General') || sections[0];
      if (generalSec) {
        activeSectionId = generalSec.id;
      } else {
        // Auto-create a single General section for zero-section policies
        setSavingSection(true);
        setNoteActionError(null);
        setNoteActionSuccess(null);

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.user) throw new Error('You must be logged in.');

          const { data: newSec, error: secErr } = await supabase
            .from('policy_document_sections')
            .insert({
              policy_id: policyId,
              name: 'General',
              position: 0,
              created_by: session.user.id
            })
            .select()
            .single();

          if (secErr) throw secErr;

          activeSectionId = newSec.id;
          setSections([newSec]);
        } catch (err: any) {
          console.error('Error auto-creating General section:', err);
          setNoteActionError(err?.message || 'Failed to initialize document section.');
          setSavingSection(false);
          return;
        } finally {
          setSavingSection(false);
        }
      }
    }

    if (activeSectionId) {
      await handleFileUpload(activeSectionId, filesArray);
    }
  };

  // Rename document section
  const handleRenameSection = async (sectionId: string) => {
    if (!renamingSectionName.trim()) return;

    setSavingSection(true);
    setNoteActionError(null);
    setNoteActionSuccess(null);

    try {
      const { error } = await supabase
        .from('policy_document_sections')
        .update({ name: renamingSectionName.trim() })
        .eq('id', sectionId);

      if (error) throw error;
      setRenamingSectionId(null);
      setRenamingSectionName('');
      fetchSectionsAndDocs();
      setNoteActionSuccess('Section renamed successfully.');
    } catch (err: any) {
      console.error('Error renaming section:', err);
      setNoteActionError(err?.message || 'Failed to rename section.');
    } finally {
      setSavingSection(false);
    }
  };

  // Delete section with files (safely executing storage file deletions first, then metadata, then section)
  const handleDeleteSection = async (sectionId: string, sectionName: string) => {
    const sectionDocs = documents.filter(d => d.section_id === sectionId);
    const hasFiles = sectionDocs.length > 0;

    const confirmMsg = hasFiles
      ? `WARNING: This section "${sectionName}" contains ${sectionDocs.length} files. Deleting it will permanently delete all these files from storage. Are you sure you want to proceed?`
      : `Are you sure you want to delete the empty section "${sectionName}"?`;

    if (!confirm(confirmMsg)) return;

    setSavingSection(true);
    setNoteActionError(null);
    setNoteActionSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('You must be logged in.');

      if (hasFiles) {
        // 1. Fetch all storage_path values
        const paths = sectionDocs.map(d => d.storage_path);

        // 2. Delete the Storage objects
        const { data: deleteData, error: deleteErr } = await supabase
          .storage
          .from('policy-documents')
          .remove(paths);

        if (deleteErr) throw deleteErr;

        // 3. Verify Storage deletion succeeded
        if (!deleteData || deleteData.length === 0) {
          throw new Error('Failed to delete files from storage. Section deletion aborted.');
        }

        // 4. Delete document metadata
        const { error: metaErr } = await supabase
          .from('policy_documents')
          .delete()
          .eq('section_id', sectionId);

        if (metaErr) throw metaErr;
      }

      // 5. Delete the section
      const { error: sectionErr } = await supabase
        .from('policy_document_sections')
        .delete()
        .eq('id', sectionId);

      if (sectionErr) throw sectionErr;

      fetchSectionsAndDocs();
      setNoteActionSuccess(`Section "${sectionName}" deleted successfully.`);

      // Log activity event (non-blocking)
      if (hasFiles) {
        try {
          await supabase.from('activity_events').insert({
            client_id: id,
            policy_id: policyId,
            actor_id: session.user.id,
            event_type: 'document_deleted',
            title: 'Document deleted',
            description: `All documents in section "${sectionName}" were deleted because the section was removed.`,
            metadata: {
              section_name: sectionName,
              policy_number: policyNumber || null,
              line_of_business: lob || null
            }
          });
        } catch (evErr) {
          console.error('Failed to log section documents deletion event:', evErr);
        }
      }
    } catch (err: any) {
      console.error('Error deleting section:', err);
      setNoteActionError(err?.message || 'Failed to delete section.');
    } finally {
      setSavingSection(false);
    }
  };

  // Upload documents (validating format, max 20MB limit, starting path with auth.uid() folder root, rolling back storage if metadata insert fails)
  const handleFileUpload = async (sectionId: string, filesList: File[] | FileList | null) => {
    if (!filesList) return;
    const filesArray = Array.isArray(filesList) ? filesList : Array.from(filesList);
    if (filesArray.length === 0) return;

    const allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'jpg', 'jpeg', 'png', 'webp'];
    const maxSizeBytes = 20 * 1024 * 1024; // 20 MB

    setUploadingFiles(prev => ({ ...prev, [sectionId]: true }));
    setNoteActionError(null);
    setNoteActionSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('You must be logged in.');
      const uploaderId = session.user.id;

      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        const ext = file.name.split('.').pop()?.toLowerCase() || '';

        if (!allowedExtensions.includes(ext)) {
          throw new Error(`File "${file.name}" has an invalid extension. Allowed extensions are: PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, JPG, JPEG, PNG, WEBP.`);
        }

        if (file.size > maxSizeBytes) {
          throw new Error(`File "${file.name}" exceeds the maximum size limit of 20 MB.`);
        }

        const documentId = crypto.randomUUID();
        // Path matches: auth.uid()/client_id/policy_id/document_id/original_filename
        const storagePath = `${uploaderId}/${id}/${policyId}/${documentId}/${file.name}`;

        setUploadProgress(prev => ({ ...prev, [file.name]: 20 }));

        // 1. Upload Storage object
        const { error: uploadErr } = await supabase
          .storage
          .from('policy-documents')
          .upload(storagePath, file, { cacheControl: '3600', upsert: false });

        if (uploadErr) throw uploadErr;
        setUploadProgress(prev => ({ ...prev, [file.name]: 60 }));

        // 2. Insert metadata row
        const { error: metaErr } = await supabase
          .from('policy_documents')
          .insert({
            id: documentId,
            policy_id: policyId,
            section_id: sectionId,
            uploaded_by: uploaderId,
            display_name: file.name,
            original_filename: file.name,
            storage_path: storagePath,
            mime_type: file.type || null,
            size_bytes: file.size
          });

        if (metaErr) {
          // Storage removal rollback on metadata insert fail
          console.error('Metadata insert failed, removing uploaded storage file to prevent orphan files:', metaErr);
          await supabase.storage.from('policy-documents').remove([storagePath]);
          throw metaErr;
        }

        // Also mirror metadata in client_documents for unified client documents view
        try {
          await supabase.from('client_documents').insert({
            id: documentId,
            client_id: id,
            agent_id: uploaderId,
            display_name: file.name,
            document_type: 'Policy Document',
            original_filename: file.name,
            storage_path: storagePath,
            mime_type: file.type || null,
            size_bytes: file.size,
            module_type: 'property_casualty',
            policy_id: policyId,
          });
        } catch (cErr) {
          console.warn('Could not mirror direct policy upload to client_documents:', cErr);
        }

        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));

        // Log activity event (non-blocking)
        try {
          const section = sections.find(s => s.id === sectionId);
          await supabase.from('activity_events').insert({
            client_id: id,
            policy_id: policyId,
            actor_id: uploaderId,
            event_type: 'document_uploaded',
            title: 'Document uploaded',
            description: `Document "${file.name}" was uploaded to section "${section?.name || 'Section'}".`,
            metadata: {
              document_display_name: file.name,
              section_name: section?.name || null,
              policy_number: policyNumber || null,
              line_of_business: lob || null
            }
          });
        } catch (evErr) {
          console.error('Failed to log document upload event:', evErr);
        }
      }

      fetchSectionsAndDocs();
      setNoteActionSuccess('Files uploaded successfully.');
    } catch (err: any) {
      console.error('Error uploading file:', err);
      setNoteActionError(err?.message || 'Failed to upload files.');
    } finally {
      setUploadingFiles(prev => ({ ...prev, [sectionId]: false }));
      setUploadProgress({});
    }
  };

  // Helper to resolve signed URLs with fallback across buckets (policy-documents, crm-documents, etc.)
  const getPolicyDocSignedUrl = async (storagePath: string): Promise<string | null> => {
    const buckets = ['policy-documents', 'crm-documents', 'health-documents', 'health-policy-documents'];
    for (const b of buckets) {
      try {
        const { data, error } = await supabase.storage.from(b).createSignedUrl(storagePath, 3600);
        if (!error && data?.signedUrl) return data.signedUrl;
      } catch {}
    }
    return null;
  };

  // Download document generating private short-lived signed URL
  const handleDownloadDoc = async (doc: PolicyDocument) => {
    try {
      setNoteActionError(null);
      setNoteActionSuccess(null);

      const signedUrl = await getPolicyDocSignedUrl(doc.storage_path);
      if (!signedUrl) throw new Error('Failed to generate signed download link.');

      window.open(signedUrl, '_blank');
    } catch (err: any) {
      console.error('Error downloading document:', err);
      setNoteActionError(err?.message || 'Failed to download document.');
    }
  };

  // Preview Document State & Handler
  const [pcPreviewState, setPcPreviewState] = useState<{
    isOpen: boolean;
    fileName: string;
    mimeType?: string | null;
    signedUrl?: string | null;
    officePreview?: any | null;
    loading: boolean;
    error?: string | null;
    doc?: PolicyDocument | null;
  }>({
    isOpen: false,
    fileName: '',
    mimeType: null,
    signedUrl: null,
    officePreview: null,
    loading: false,
    error: null,
    doc: null,
  });

  const handlePreviewDoc = async (doc: PolicyDocument) => {
    const fileNameVal = doc.display_name || doc.original_filename;
    const ext = (fileNameVal.split('.').pop() || '').toLowerCase();
    const isOffice = ['docx', 'xlsx', 'xls', 'pptx'].includes(ext);

    setPcPreviewState({
      isOpen: true,
      fileName: fileNameVal,
      mimeType: doc.mime_type || null,
      signedUrl: null,
      officePreview: null,
      loading: true,
      error: null,
      doc,
    });

    if (isOffice) {
      try {
        const res = await fetch('/api/documents/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'property_casualty', docId: doc.id }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to generate document preview.');
        }

        const officeData = await res.json();
        setPcPreviewState((prev) => ({
          ...prev,
          loading: false,
          officePreview: officeData,
        }));
      } catch (err: any) {
        console.error('Error previewing document:', err);
        setPcPreviewState((prev) => ({
          ...prev,
          loading: false,
          error: err?.message || 'Unable to preview this document.',
        }));
      }
    } else {
      try {
        const signedUrl = await getPolicyDocSignedUrl(doc.storage_path);
        if (!signedUrl) throw new Error('Failed to generate signed preview URL.');

        setPcPreviewState((prev) => ({
          ...prev,
          loading: false,
          signedUrl,
        }));
      } catch (err: any) {
        console.error('Error previewing document:', err);
        setPcPreviewState((prev) => ({
          ...prev,
          loading: false,
          error: err?.message || 'Unable to preview this document.',
        }));
      }
    }
  };

  // Rename document metadata (display name only)
  const handleRenameDoc = async (docId: string, oldName: string) => {
    if (!renamingDocName.trim()) return;

    setSavingSection(true);
    setNoteActionError(null);
    setNoteActionSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('You must be logged in.');

      const doc = documents.find(d => d.id === docId);
      const targetTable = doc?.is_unified_document ? 'client_documents' : 'policy_documents';

      const { error } = await supabase
        .from(targetTable)
        .update({ display_name: renamingDocName.trim() })
        .eq('id', docId);

      if (error) throw error;

      const section = sections.find(s => s.id === doc?.section_id);

      setRenamingDocId(null);
      setRenamingDocName('');
      fetchSectionsAndDocs();
      setNoteActionSuccess('Document renamed successfully.');

      // Log activity event (non-blocking)
      try {
        await supabase.from('activity_events').insert({
          client_id: id,
          policy_id: policyId,
          actor_id: session.user.id,
          event_type: 'document_renamed',
          title: 'Document renamed',
          description: `Document "${oldName}" was renamed to "${renamingDocName.trim()}".`,
          metadata: {
            document_display_name: renamingDocName.trim(),
            section_name: section?.name || null,
            policy_number: policyNumber || null,
            line_of_business: lob || null
          }
        });
      } catch (evErr) {
        console.error('Failed to log document rename event:', evErr);
      }
    } catch (err: any) {
      console.error('Error renaming document:', err);
      setNoteActionError(err?.message || 'Failed to rename document.');
    } finally {
      setSavingSection(false);
    }
  };

  // Delete document (Storage first, then metadata)
  const handleDeleteDoc = async (doc: PolicyDocument) => {
    if (!confirm(`Are you sure you want to delete the document "${doc.display_name}"?`)) return;

    setSavingSection(true);
    setNoteActionError(null);
    setNoteActionSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('You must be logged in.');

      // 1. Try deleting from policy-documents or crm-documents bucket
      const bucket = doc.is_unified_document ? 'crm-documents' : 'policy-documents';
      await supabase.storage.from(bucket).remove([doc.storage_path]);
      await supabase.storage.from('policy-documents').remove([doc.storage_path]);

      // 2. Delete metadata row
      const targetTable = doc.is_unified_document ? 'client_documents' : 'policy_documents';
      const { error: metaErr } = await supabase
        .from(targetTable)
        .delete()
        .eq('id', doc.id);

      if (metaErr) throw metaErr;

      const section = sections.find(s => s.id === doc.section_id);

      fetchSectionsAndDocs();
      setNoteActionSuccess('Document deleted successfully.');

      // Log activity event (non-blocking)
      try {
        await supabase.from('activity_events').insert({
          client_id: id,
          policy_id: policyId,
          actor_id: session.user.id,
          event_type: 'document_deleted',
          title: 'Document deleted',
          description: `Document "${doc.display_name}" was deleted.`,
          metadata: {
            document_display_name: doc.display_name,
            section_name: section?.name || null,
            policy_number: policyNumber || null,
            line_of_business: lob || null
          }
        });
      } catch (evErr) {
        console.error('Failed to log document deletion event:', evErr);
      }
    } catch (err: any) {
      console.error('Error deleting document:', err);
      setNoteActionError(err?.message || 'Failed to delete document.');
    } finally {
      setSavingSection(false);
    }
  };

  // Add a new note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim()) return;

    setSavingNote(true);
    setNoteActionError(null);
    setNoteActionSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('You must be logged in to add notes.');
      }

      const { data: insertedNote, error: insertError } = await supabase
        .from('policy_notes')
        .insert({
          policy_id: policyId,
          author_id: session.user.id,
          content: newNoteContent.trim()
        })
        .select('id')
        .single();

      if (insertError) throw insertError;

      setNewNoteContent('');
      fetchNotes();
      setNoteActionSuccess('Note added successfully.');

      // Log activity event (non-blocking)
      try {
        await supabase.from('activity_events').insert({
          client_id: id,
          policy_id: policyId,
          actor_id: session.user.id,
          event_type: 'note_added',
          title: 'Note added',
          description: 'A policy note was added.',
          metadata: {
            policy_number: policyNumber || null,
            line_of_business: lob || null
          }
        });
      } catch (eventErr) {
        console.error('Failed to log note creation event:', eventErr);
      }
    } catch (err: any) {
      console.error('Error adding policy note:', err);
      setNoteActionError(err?.message || 'Failed to add note.');
    } finally {
      setSavingNote(false);
    }
  };

  // Edit note changes
  const handleEditNoteSubmit = async (noteId: string) => {
    if (!editingNoteContent.trim()) return;

    setSavingNote(true);
    setNoteActionError(null);
    setNoteActionSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('You must be logged in.');
      }

      const { error: updateError } = await supabase
        .from('policy_notes')
        .update({
          content: editingNoteContent.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', noteId);

      if (updateError) throw updateError;

      setEditingNoteId(null);
      setEditingNoteContent('');
      fetchNotes();
      setNoteActionSuccess('Note updated successfully.');

      // Log activity event (non-blocking)
      try {
        await supabase.from('activity_events').insert({
          client_id: id,
          policy_id: policyId,
          actor_id: session.user.id,
          event_type: 'note_edited',
          title: 'Note edited',
          description: 'A policy note was edited.',
          metadata: {
            policy_number: policyNumber || null,
            line_of_business: lob || null
          }
        });
      } catch (eventErr) {
        console.error('Failed to log note update event:', eventErr);
      }
    } catch (err: any) {
      console.error('Error editing policy note:', err);
      setNoteActionError(err?.message || 'Failed to edit note.');
    } finally {
      setSavingNote(false);
    }
  };

  // Delete note
  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note and all its attachments?')) return;

    setSavingNote(true);
    setNoteActionError(null);
    setNoteActionSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('You must be logged in.');
      }

      // 1. Fetch note attachments first to get storage paths
      const { data: attachments, error: fetchError } = await supabase
        .from('policy_note_attachments')
        .select('*')
        .eq('note_id', noteId);

      if (fetchError) throw new Error(`Failed to check note attachments: ${fetchError.message}`);

      // 2. If attachments exist, delete them from storage first
      if (attachments && attachments.length > 0) {
        const paths = attachments.map(att => att.storage_path);
        
        // Delete objects one by one or in a batch, but verify complete success
        // Let's do it via remove
        const { data: deletedObjects, error: storageDeleteError } = await supabase
          .storage
          .from('policy-documents')
          .remove(paths);

        if (storageDeleteError) {
          throw new Error(`Failed to delete attachments from storage: ${storageDeleteError.message}`);
        }

        // Verify every storage object was deleted.
        // Supabase .remove() returns the list of deleted files.
        const deletedPaths = (deletedObjects || []).map(obj => obj.name);
        const failedPaths = paths.filter(path => !deletedPaths.includes(path));

        if (failedPaths.length > 0) {
          // Find the corresponding display names
          const failedDisplays = attachments
            .filter(att => failedPaths.includes(att.storage_path))
            .map(att => att.display_name);

          throw new Error(`Failed to delete some attachments from storage: ${failedDisplays.join(', ')}. Note deletion aborted.`);
        }
      }

      // 3. Delete the note itself. Cascade will delete policy_note_attachments metadata rows.
      const { error: deleteError } = await supabase
        .from('policy_notes')
        .delete()
        .eq('id', noteId);

      if (deleteError) throw deleteError;

      fetchNotes();
      setNoteActionSuccess('Note deleted successfully.');

      // Log activity event (non-blocking)
      try {
        await supabase.from('activity_events').insert({
          client_id: id,
          policy_id: policyId,
          actor_id: session.user.id,
          event_type: 'note_deleted',
          title: 'Note deleted',
          description: 'A policy note was deleted.',
          metadata: {
            policy_number: policyNumber || null,
            line_of_business: lob || null
          }
        });
      } catch (eventErr) {
        console.error('Failed to log note deletion event:', eventErr);
      }
    } catch (err: any) {
      console.error('Error deleting policy note:', err);
      setNoteActionError(err?.message || 'Failed to delete note.');
    } finally {
      setSavingNote(false);
    }
  };

  // Cancel / Revert
  const handleCancel = () => {
    if (!policy) return;
    setLob(policy.policy_type || '');
    setTransactionType(policy.transaction_type === 'New' ? 'New Business' : 'Renewal');
    setPolicyNumber(policy.policy_number || '');
    setPaymentFrequency(policy.policy_payment_frequency === 'Monthly' ? 'Monthly' : 'Annual');
    setEffectiveDate(policy.effective_date ? formatIsoToUsDate(policy.effective_date) : '');
    setExpirationDate(policy.expiration_date ? formatIsoToUsDate(policy.expiration_date) : '');
    setBillingType(policy.billing_type === 'Agency Bill' ? 'Agency Bill' : 'Direct Bill');
    setBrokerName(policy.broker_name || '');
    setWritingCompany(policy.writing_company || policy.company_name || '');
    setTotalPremium(policy.total_premium ?? policy.premium ?? '');
    setAnnualPremium(policy.annual_premium ?? '');
    setPolicyStatus(policy.status || 'Active');
    setSuccessMsg(null);
    setErrorMsg(null);
  };

  // Renew Policy Submit
  const handleRenewPolicySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRenewError(null);

    if (!renewEffectiveDate || !renewExpirationDate || renewPremium === '') {
      setRenewError('Effective Date, Expiration Date, and Total Premium are required.');
      return;
    }

    const effIso = usDateToIso(renewEffectiveDate);
    const expIso = usDateToIso(renewExpirationDate);

    if (!effIso || !expIso) {
      setRenewError('Please enter valid dates in MM/DD/YYYY format.');
      return;
    }

    if (new Date(expIso) < new Date(effIso)) {
      setRenewError('Expiration Date cannot be earlier than Effective Date.');
      return;
    }

    setRenewing(true);
    try {
      const premiumNum = Number(renewPremium);

      const { data: newPolicy, error: createError } = await supabase
        .from('policies')
        .insert({
          client_id: id,
          policy_type: lob,
          policy_ownership_type: (client?.client_type === 'company' || policyOwnershipType === 'company') ? 'company' : 'personal',
          writing_company: writingCompany.trim() || null,
          cargo: cargo.trim() || null,
          company_name: writingCompany.trim() || null,
          policy_number: policyNumber.trim() || null,
          policy_payment_frequency: paymentFrequency,
          billing_type: billingType,
          broker_name: brokerName.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          zip_code: zipCode.trim() || null,
          effective_date: effIso,
          expiration_date: expIso,
          total_premium: premiumNum,
          premium: premiumNum,
          annual_premium: premiumNum,
          transaction_type: 'Renewal',
          status: 'Active',
          renewed_from_policy_id: policyId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) throw createError;

      // Update source policy status to Expired
      const { error: sourceUpdateError } = await supabase
        .from('policies')
        .update({
          status: 'Expired',
          updated_at: new Date().toISOString(),
        })
        .eq('id', policyId)
        .eq('client_id', id);

      if (sourceUpdateError) {
        console.error('Error updating source policy status to Expired:', sourceUpdateError);
      }

      // Log activity event (non-blocking)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id && newPolicy) {
          await supabase.from('activity_events').insert([
            {
              client_id: id,
              policy_id: policyId,
              actor_id: session.user.id,
              event_type: 'policy_renewed',
              title: 'Policy renewed',
              description: 'Renewal policy created.',
              metadata: { renewal_policy_id: newPolicy.id }
            },
            {
              client_id: id,
              policy_id: newPolicy.id,
              actor_id: session.user.id,
              event_type: 'policy_created',
              title: 'Policy created from renewal',
              description: 'Created from previous policy renewal.',
              metadata: { source_policy_id: policyId }
            }
          ]);
        }
      } catch (eventErr) {
        console.error('Failed to log renewal activity event:', eventErr);
      }

      setIsRenewModalOpen(false);
      router.push(`/clients/${id}/policies/${newPolicy.id}`);
    } catch (err: any) {
      console.error('Error renewing policy:', err);
      setRenewError(err?.message || 'Failed to create renewal policy.');
    } finally {
      setRenewing(false);
    }
  };

  // Cancel Policy Submit
  const handleCancelPolicySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCancelError(null);
    setCancelling(true);

    try {
      const nowIso = new Date().toISOString();
      const reasonFull = cancellationReason + (cancellationNotes.trim() ? `: ${cancellationNotes.trim()}` : '');

      const { error: updateError } = await supabase
        .from('policies')
        .update({
          status: 'Cancelled',
          cancelled_at: nowIso,
          cancellation_reason: reasonFull,
          updated_at: nowIso,
        })
        .eq('id', policyId);

      if (updateError) throw updateError;

      // Log activity event
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          await supabase.from('activity_events').insert({
            client_id: id,
            policy_id: policyId,
            actor_id: session.user.id,
            event_type: 'policy_cancelled',
            title: 'Policy cancelled',
            description: `Policy status changed to Cancelled (${cancellationReason}).`,
            metadata: { reason: cancellationReason, notes: cancellationNotes }
          });
        }
      } catch (eventErr) {
        console.error('Failed to log cancellation activity event:', eventErr);
      }

      setPolicyStatus('Cancelled');
      setIsCancelModalOpen(false);
      setSuccessMsg('Policy status updated to Cancelled.');
    } catch (err: any) {
      console.error('Error cancelling policy:', err);
      setCancelError(err?.message || 'Failed to cancel policy.');
    } finally {
      setCancelling(false);
    }
  };

  // Submit Form
  // Delete Policy
  const handleDeletePolicy = async () => {
    if (!confirm('Are you sure you want to permanently delete this policy? This action cannot be undone.')) return;
    
    setSaving(true);
    setErrorMsg(null);
    try {
      // 1. Cleanup Storage for Documents
      const { data: docs } = await supabase
        .from('policy_documents')
        .select('storage_path')
        .eq('policy_id', policyId);
        
      if (docs && docs.length > 0) {
        const paths = docs.map(d => d.storage_path).filter(Boolean);
        if (paths.length > 0) {
          await supabase.storage.from('policy-documents').remove(paths);
        }
      }

      // 2. Cleanup Storage for Note Attachments
      const { data: notes } = await supabase
        .from('policy_notes')
        .select('id')
        .eq('policy_id', policyId);
        
      if (notes && notes.length > 0) {
        const noteIds = notes.map(n => n.id);
        const { data: atts } = await supabase
          .from('policy_note_attachments')
          .select('storage_path')
          .in('note_id', noteIds);
          
        if (atts && atts.length > 0) {
          const attPaths = atts.map(a => a.storage_path).filter(Boolean);
          if (attPaths.length > 0) {
            await supabase.storage.from('policy-notes').remove(attPaths);
          }
        }
      }

      // 3. Delete the policy (Dependent DB records cascade or must be set up to cascade)
      const { error: deleteError } = await supabase
        .from('policies')
        .delete()
        .eq('id', policyId);

      if (deleteError) throw deleteError;

      // 4. Redirect to client policies section
      router.push(`/clients/${id}?section=policies`);
    } catch (err: any) {
      console.error('Error deleting policy:', {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint
      });
      setErrorMsg(err?.message || 'Failed to delete policy. It may have dependent records preventing deletion.');
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validate dates exist
    if (!effectiveDate || !expirationDate) {
      setErrorMsg('Both Effective Date and Expiration Date are required.');
      return;
    }

    // Convert dates safely
    const effIso = usDateToIso(effectiveDate);
    const expIso = usDateToIso(expirationDate);

    if (!effIso || !expIso) {
      setErrorMsg('Dates must be in MM/DD/YYYY format.');
      return;
    }

    // Validation: Expiration not earlier than Effective
    const d1 = new Date(effIso + 'T00:00:00');
    const d2 = new Date(expIso + 'T00:00:00');
    if (d2 < d1) {
      setErrorMsg('Expiration Date cannot be earlier than Effective Date.');
      return;
    }

    if (!lob) {
      setErrorMsg('Line of Business is required.');
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from('policies')
        .update({
          policy_type: lob,
          transaction_type: transactionType === 'New Business' ? 'New' : 'Renewal',
          policy_number: policyNumber.trim() || null,
          policy_payment_frequency: paymentFrequency,
          effective_date: effIso,
          expiration_date: expIso,
          billing_type: billingType,
          broker_name: brokerName.trim() || null,
          cargo: cargo.trim() || null,
          writing_company: writingCompany.trim() || null,
          policy_ownership_type: (client?.client_type === 'company' || policyOwnershipType === 'company') ? 'company' : 'personal',
          address: address.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      zip_code: zipCode.trim() || null,
          company_name: writingCompany.trim() || null, // Keep synced with legacy column
          total_premium: totalPremium === '' ? 0 : Number(totalPremium),
          premium: totalPremium === '' ? 0 : Number(totalPremium), // Keep synced with legacy column
          annual_premium: annualPremium === '' ? 0 : Number(annualPremium),
          status: policyStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', policyId);

      if (error) throw error;

      // Log activity event (non-blocking)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          await supabase.from('activity_events').insert({
            client_id: id,
            policy_id: policyId,
            actor_id: session.user.id,
            event_type: 'policy_updated',
            title: 'Policy updated',
            description: 'A policy was updated.',
            metadata: {
              policy_number: policyNumber || null,
              line_of_business: lob || null
            }
          });
        }
      } catch (errEvent) {
        console.error('Failed to log policy update event:', errEvent);
      }

      setSuccessMsg('Policy updated successfully.');
      fetchData();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save policy updates.');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number | string | undefined | null) => {
    if (val === undefined || val === null || val === '') return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(Number(val));
  };

  const getAgentDisplayName = () => {
    if (agentProfile?.name) {
      return agentProfile.name;
    }
    return currentUserEmail || 'Agent';
  };

  const { isLineEnabled } = useBusinessLines();

  if (!isLineEnabled('property_casualty')) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto py-12 font-sans">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white">Module Access Restricted</h3>
            <p className="text-sm text-slate-300 max-w-md mx-auto">
              The <strong>Property & Casualty</strong> business line is currently disabled for your agent profile. You can enable it in Agent Information settings.
            </p>
            <div className="pt-2">
              <Link
                href="/personal-information"
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm transition-all"
              >
                Go to Agent Information
              </Link>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const handleUseAddressOnFileToggle = (checked: boolean) => {
    setUseAddressOnFile(checked);
    if (checked) {
      let street = '';
      let c = '';
      let s = '';
      let z = '';

      if (residenceInfo?.address && residenceInfo.address.trim().length > 0) {
        street = residenceInfo.address.trim();
        c = residenceInfo.city?.trim() || '';
        s = residenceInfo.state?.trim() || residenceInfo.county?.trim() || '';
        z = residenceInfo.zip_code?.trim() || '';
      } else if (client?.address && client.address.trim().length > 0) {
        street = client.address.trim();
        c = (client as any).city?.trim() || '';
        s = (client as any).state?.trim() || '';
        z = (client as any).zip_code?.trim() || '';
      }

      const hasSavedAddress = Boolean(street || c || s || z);

      if (hasSavedAddress) {
        setAddress(street);
        setCity(c);
        setState(s);
        setZipCode(z);
        setNoAddressMessage(null);
      } else {
        setNoAddressMessage('No address is available in Personal Information.');
      }
    } else {
      setNoAddressMessage(null);
    }
  };

  const resolvedSidebarName = client?.client_type === 'company'
    ? (client.full_name || clientName || '-')
    : ((personalInfo?.full_name && personalInfo.full_name.trim().length > 0)
        ? personalInfo.full_name.trim()
        : (client?.full_name || clientName || '-'));

  const resolvedSidebarEmail = (personalInfo?.email && personalInfo.email.trim().length > 0)
    ? personalInfo.email.trim()
    : (client?.email || '-');

  const resolvedSidebarPhone = (personalInfo?.phone && personalInfo.phone.trim().length > 0)
    ? personalInfo.phone.trim()
    : (client?.phone || '-');

  const formatResidenceAddress = (res: any, cl: any): string => {
    if (res?.address && res.address.trim().length > 0) {
      const parts = [
        res.address.trim(),
        res.city?.trim(),
        res.state?.trim() || res.county?.trim(),
        res.zip_code?.trim(),
      ].filter(Boolean);
      return parts.join(', ');
    }
    if (cl?.address && cl.address.trim().length > 0) {
      const parts = [
        cl.address.trim(),
        cl.city?.trim(),
        cl.state?.trim(),
        cl.zip_code?.trim(),
      ].filter(Boolean);
      return parts.join(', ');
    }
    return '-';
  };

  const resolvedSidebarAddress = formatResidenceAddress(residenceInfo, client);

  return (
    <DashboardLayout>
      {/* 1. CANONICAL CLIENT HEADER (Flush with top global navigation, 0 top gap) */}
      <HealthClientHeader
        clientId={id}
        clientName={resolvedSidebarName || 'Client Profile'}
        photoUrl={(client as any)?.photo_url || null}
        lastUpdated={client?.updated_at ? formatDateMMDDYYYY(client.updated_at) : null}
        activeSection="policies"
        onSendEmail={() => {
          const email = resolvedSidebarEmail !== '-' ? resolvedSidebarEmail : client?.email;
          if (email) window.location.href = `mailto:${email}`;
          else alert('No email address registered for this client.');
        }}
        onConsent={() => router.push(`/clients/${id}?section=consents`)}
        onDeleteProfile={() => router.push(`/clients/${id}?section=overview`)}
      />

      {/* 2. MAIN WORKSPACE CONTAINER */}
      <CrmPageContainer className="p-4 md:p-6 lg:p-8 font-sans">
        {loading ? (
          <div className="flex justify-center items-center py-20 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row items-start gap-6">
            {/* LEFT RAIL: COLLAPSIBLE SIDEBAR */}
            <CollapsibleSidebar title="P&C Policy">
              {/* Client Profile Context Card */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-extrabold text-sm border border-blue-200 flex-shrink-0">
                    {(resolvedSidebarName || 'C')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Client Profile</span>
                    <h3 className="text-base font-extrabold text-slate-900 truncate">
                      {loadingClient ? 'Loading...' : resolvedSidebarName}
                    </h3>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 space-y-2.5 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Assigned Agent</span>
                    <span className="font-semibold text-slate-800">{getAgentDisplayName()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Email</span>
                    <a href={`mailto:${resolvedSidebarEmail}`} className="font-semibold text-blue-600 hover:underline truncate block">
                      {resolvedSidebarEmail}
                    </a>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Phone</span>
                    <a href={`tel:${resolvedSidebarPhone}`} className="font-semibold text-slate-800 hover:text-blue-600 block">
                      {resolvedSidebarPhone}
                    </a>
                  </div>
                </div>
              </div>

              {/* Policy Selector & Navigation Back */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Selected Policy</span>
                  <Link
                    href={`/clients/${id}?section=policies`}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                  >
                    <span>← All P&C Policies</span>
                  </Link>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-xs font-bold text-slate-900 block truncate">{lob || 'Property & Casualty'}</span>
                  <span className="text-[11px] font-medium text-slate-500 block truncate">#{policyNumber || 'Draft'}</span>
                </div>
              </div>

              {/* Subtab Navigation Rail */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-2 shadow-2xs space-y-1">
                <button
                  type="button"
                  onClick={() => setActiveMenuTab('summary')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                    activeMenuTab === 'summary'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span>Summary</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMenuTab('documents')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                    activeMenuTab === 'documents'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span>Documents</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMenuTab('notes')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                    activeMenuTab === 'notes'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span>Notes</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMenuTab('chronology')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                    activeMenuTab === 'chronology'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span>Timeline</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </CollapsibleSidebar>

            {/* RIGHT WORKSPACE */}
            <main className="flex-1 w-full min-w-0 space-y-6">
              {/* AREA 0: LINKED PERSONAL CLIENT (if linked) */}
              {linkedPersonalClient && linkedPersonalClient.client && (
                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 block">Linked Personal Client</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-extrabold text-slate-900">{linkedPersonalClient.client.full_name}</h4>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white text-rose-700 border border-rose-200 shadow-2xs">
                        {linkedPersonalClient.linked_person_role === 'co_applicant' ? 'Co-Applicant' : 'Main Applicant'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUnlinkError(null);
                        setIsConfirmUnlinkOpen(true);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-200 text-xs font-bold px-3.5 py-2 rounded-xl transition-all"
                    >
                      Unlink Client
                    </button>
                    <Link
                      href={`/clients/${linkedPersonalClient.personal_client_id}`}
                      className="inline-flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-md shadow-rose-500/10"
                    >
                      View Client Profile
                    </Link>
                  </div>
                </div>
              )}

              {/* AREA 1: COMPACT POLICY RECORD HEADER CARD */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">P&C Policy</span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                        {lob || 'Property & Casualty'}
                      </span>
                    </div>
                    <h1 className="text-xl font-bold text-slate-900">#{policyNumber || 'Not assigned'}</h1>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Renewal Warning / Link */}
                    {existingRenewalId ? (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl text-xs font-semibold text-amber-800">
                        <span>A renewal has been created</span>
                        <Link
                          href={`/clients/${id}/policies/${existingRenewalId}`}
                          className="bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shadow-2xs"
                        >
                          View Renewal
                        </Link>
                      </div>
                    ) : (
                      <>
                        {(policyStatus === 'Active' || policyStatus === 'Expired') && (
                          <button
                            type="button"
                            onClick={() => {
                              setRenewEffectiveDate('');
                              setRenewExpirationDate('');
                              setRenewPremium('');
                              setRenewError(null);
                              setIsRenewModalOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-all shadow-2xs flex items-center gap-1.5"
                          >
                            <span>↻</span>
                            <span>Renew Policy</span>
                          </button>
                        )}
                      </>
                    )}

                    {(policyStatus === 'Active' || policyStatus === 'Pending') && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancellationReason('Client Requested');
                          setCancellationNotes('');
                          setCancelError(null);
                          setIsCancelModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-all shadow-2xs flex items-center gap-1.5"
                      >
                        <span>✕</span>
                        <span>Cancel Policy</span>
                      </button>
                    )}

                    {/* Delete Policy Button */}
                    <button
                      type="button"
                      onClick={handleDeletePolicy}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-all shadow-2xs flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Delete Policy</span>
                    </button>

                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      policyStatus === 'Active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : policyStatus === 'Pending'
                        ? 'bg-amber-50 text-amber-700 border-amber-100'
                        : policyStatus === 'Cancelled'
                        ? 'bg-rose-50 text-rose-700 border-rose-100'
                        : 'bg-slate-50 text-slate-650 border-slate-200'
                    }`}>
                      {policyStatus}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-100 pt-4 text-xs">
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Writing Carrier</span>
                    <span className="font-semibold text-blue-700 text-[18px] sm:text-[19px] leading-tight mt-0.5 block truncate">{writingCompany || '-'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Term</span>
                    <span className="font-semibold text-slate-800 mt-0.5 block">
                      {calculateTermDuration(effectiveDate, expirationDate)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ownership</span>
                    <span className="font-semibold text-slate-800 mt-0.5 block">{policyOwnershipType === 'company' ? 'Company' : 'Personal'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Full Premium</span>
                    <span className="font-bold text-emerald-700 mt-0.5 block">{formatCurrency(totalPremium)}</span>
                  </div>
                </div>
              </div>
            {/* TAB CONTENT DETAILS */}
            {/* TAB CONTENT DETAILS */}
            {activeMenuTab === 'documents' && (
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
                <div className="flex flex-wrap items-center justify-between border-b border-slate-50 pb-4 gap-3">
                  <h3 className="text-lg font-extrabold text-slate-900 font-sans">Policy Documents</h3>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10 cursor-pointer disabled:opacity-50 font-sans">
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Upload Document
                      <input
                        type="file"
                        multiple
                        disabled={savingSection}
                        className="hidden"
                        onChange={(e) => {
                          handleDirectOrSectionUpload(null, e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      onClick={handleAddSection}
                      disabled={savingSection || sections.length >= 10}
                      className="inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50 font-sans"
                    >
                      Add Section
                    </button>
                  </div>
                </div>

                {noteActionError && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm">
                    {noteActionError}
                  </div>
                )}

                {noteActionSuccess && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm">
                    {noteActionSuccess}
                  </div>
                )}

                {(() => {
                  const effectiveSections: DocumentSection[] = sections.length > 0
                    ? sections
                    : documents.length > 0
                      ? [{ id: 'general-default', policy_id: policyId, name: 'General', position: 0, created_by: '', created_at: '', updated_at: '' }]
                      : [];

                  if (docsLoading && documents.length === 0 && sections.length === 0) {
                    return (
                      <div className="flex justify-center items-center py-20">
                        <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                    );
                  }

                  if (effectiveSections.length === 0) {
                    return (
                      <div className="text-center py-12 px-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-4">
                        <svg className="w-12 h-12 text-slate-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <div>
                          <h4 className="text-sm font-extrabold text-slate-800 font-sans">No documents uploaded yet</h4>
                          <p className="text-xs text-slate-450 font-sans mt-1">Upload policy files directly or organize them into custom sections.</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                          <label className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10 cursor-pointer font-sans">
                            Select Files to Upload
                            <input
                              type="file"
                              multiple
                              disabled={savingSection}
                              className="hidden"
                              onChange={(e) => {
                                handleDirectOrSectionUpload(null, e.target.files);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          <button
                            onClick={handleAddSection}
                            disabled={savingSection || sections.length >= 10}
                            className="inline-flex items-center justify-center bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition-all font-sans"
                          >
                            Create Section
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-6">
                      {effectiveSections.map(section => {
                        const sectionDocs = documents.filter(
                          d => d.section_id === section.id || (!d.section_id && (section.id === 'general-default' || section.id === (sections[0]?.id || '')))
                        );
                        const isRenaming = renamingSectionId === section.id;
                        const isUploading = !!uploadingFiles[section.id];

                      return (
                        <div key={section.id} className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                          {/* Section Header */}
                          <div className="bg-slate-50/50 px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
                            {isRenaming ? (
                              <div className="flex items-center gap-2 flex-1 max-w-md">
                                <input
                                  type="text"
                                  value={renamingSectionName}
                                  onChange={e => setRenamingSectionName(e.target.value)}
                                  className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-1.5 text-slate-800 text-sm outline-none transition-all font-sans"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleRenameSection(section.id)}
                                  disabled={savingSection || !renamingSectionName.trim()}
                                  className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg shadow transition-all"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setRenamingSectionId(null);
                                    setRenamingSectionName('');
                                  }}
                                  className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg transition-all"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <h4 className="text-sm font-extrabold text-slate-800 font-sans">{section.name}</h4>
                                <span className="text-[10px] bg-slate-200 text-slate-655 px-2 py-0.5 rounded-full font-sans font-bold">
                                  {sectionDocs.length} {sectionDocs.length === 1 ? 'file' : 'files'}
                                </span>
                              </div>
                            )}

                            {!isRenaming && (
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => {
                                    setRenamingSectionId(section.id);
                                    setRenamingSectionName(section.name);
                                  }}
                                  className="text-xs text-slate-500 hover:text-blue-600 transition-colors font-bold font-sans"
                                >
                                  Rename
                                </button>
                                <button
                                  onClick={() => handleDeleteSection(section.id, section.name)}
                                  className="text-xs text-rose-500 hover:text-rose-700 transition-colors font-bold font-sans"
                                >
                                  Delete Section
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Section Body */}
                          <div className="p-5 space-y-4">
                            {/* Upload Area with Visible Dropzone */}
                            <div className="pb-2">
                              <FileDropzone
                                compact={true}
                                label="Drag & drop files here or click to select"
                                onFilesSelected={(files) => handleFileUpload(section.id, files)}
                                disabled={isUploading}
                                multiple={true}
                              />
                            </div>

                            {/* Upload Progress Bar */}
                            {isUploading && Object.keys(uploadProgress).length > 0 && (
                              <div className="p-3 bg-blue-50/50 border border-blue-100/50 rounded-xl space-y-2">
                                {Object.entries(uploadProgress).map(([filename, progress]) => (
                                  <div key={filename} className="text-xs space-y-1">
                                    <div className="flex items-center justify-between font-sans">
                                      <span className="font-semibold text-slate-700 truncate max-w-xs">{filename}</span>
                                      <span className="text-blue-650 font-bold">{progress}%</span>
                                    </div>
                                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                      <div className="bg-blue-600 h-full transition-all duration-305" style={{ width: `${progress}%` }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Documents list */}
                            {sectionDocs.length === 0 ? (
                              <p className="text-xs text-slate-400 text-center py-4 font-sans">No documents uploaded to this section yet.</p>
                            ) : (
                              <div className="divide-y divide-slate-50">
                                {sectionDocs.map(doc => {
                                  const isRenamingDoc = renamingDocId === doc.id;
                                  const formattedSize = doc.size_bytes > 1024 * 1024
                                    ? `${(doc.size_bytes / (1024 * 1024)).toFixed(2)} MB`
                                    : `${(doc.size_bytes / 1024).toFixed(1)} KB`;

                                  const formattedDateTime = formatDateTimeMMDDYYYY(doc.created_at);

                                  const uploader = uploaderProfiles[doc.uploaded_by] || 'Agent';

                                  return (
                                    <div key={doc.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 first:pt-0 last:pb-0">
                                      <div className="space-y-1 min-w-0 flex-1">
                                        {isRenamingDoc ? (
                                          <div className="flex items-center gap-2 max-w-md">
                                            <input
                                              type="text"
                                              value={renamingDocName}
                                              onChange={e => setRenamingDocName(e.target.value)}
                                              className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-1.5 text-slate-800 text-sm outline-none transition-all font-sans"
                                              autoFocus
                                            />
                                            <button
                                              onClick={() => handleRenameDoc(doc.id, doc.display_name)}
                                              disabled={savingSection || !renamingDocName.trim()}
                                              className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg shadow transition-all font-sans"
                                            >
                                              Save
                                            </button>
                                            <button
                                              onClick={() => {
                                                setRenamingDocId(null);
                                                setRenamingDocName('');
                                              }}
                                              className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg transition-all font-sans"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          <h5 className="text-sm font-extrabold text-slate-800 font-sans truncate">{doc.display_name}</h5>
                                        )}
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 font-sans">
                                          <span className="truncate max-w-xs">File: {doc.original_filename}</span>
                                          <span>•</span>
                                          <span>Size: {formattedSize}</span>
                                          <span>•</span>
                                          <span>Uploaded: {formattedDateTime} by {uploader}</span>
                                        </div>
                                      </div>

                                      {!isRenamingDoc && (
                                        <div className="flex items-center gap-3.5 self-end sm:self-center">
                                          <button
                                            onClick={() => handlePreviewDoc(doc)}
                                            className="text-xs text-slate-700 hover:text-slate-900 font-bold font-sans"
                                          >
                                            Preview
                                          </button>
                                          <button
                                            onClick={() => handleDownloadDoc(doc)}
                                            className="text-xs text-blue-600 hover:text-blue-800 font-bold font-sans"
                                          >
                                            Download
                                          </button>
                                          <button
                                            onClick={() => {
                                              setRenamingDocId(doc.id);
                                              setRenamingDocName(doc.display_name);
                                            }}
                                            className="text-xs text-slate-500 hover:text-slate-800 font-bold font-sans"
                                          >
                                            Rename
                                          </button>
                                          <button
                                            onClick={() => handleDeleteDoc(doc)}
                                            className="text-xs text-rose-500 hover:text-rose-700 font-bold font-sans"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              </div>
            )}

            {activeMenuTab === 'chronology' && (() => {
              const filteredChronoEvents = chronoEvents.filter(evt => {
                if (chronoFilter === 'policies') {
                  return evt.event_type === 'policy_created' || evt.event_type === 'policy_updated';
                }
                if (chronoFilter === 'notes') {
                  return evt.event_type === 'note_added' || evt.event_type === 'note_edited' || evt.event_type === 'note_deleted';
                }
                if (chronoFilter === 'documents') {
                  return evt.event_type === 'document_uploaded' || evt.event_type === 'document_renamed' || evt.event_type === 'document_deleted';
                }
                return true;
              });

              // Group by US date
              const groupChronoEventsByDate = (eventsList: ActivityEvent[]) => {
                const groups: { [key: string]: ActivityEvent[] } = {};
                eventsList.forEach(evt => {
                  const dateStr = formatDateMMDDYYYY(evt.created_at);
                  if (!groups[dateStr]) {
                    groups[dateStr] = [];
                  }
                  groups[dateStr].push(evt);
                });
                return groups;
              };

              const groupedChrono = groupChronoEventsByDate(filteredChronoEvents);
              const uniqueChronoDates = Array.from(new Set(filteredChronoEvents.map(evt => 
                formatDateMMDDYYYY(evt.created_at)
              )));

              return (
                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
                  {/* Chronology Header & Filters */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-50 pb-4 gap-4">
                    <h3 className="text-lg font-extrabold text-slate-900 font-sans">Policy Chronology</h3>
                    <div className="flex bg-slate-50 border border-slate-200/60 p-1 rounded-xl gap-1">
                      <button
                        onClick={() => setChronoFilter('all')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                          chronoFilter === 'all'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-555 hover:text-slate-800'
                        }`}
                      >
                        All Activity
                      </button>
                      <button
                        onClick={() => setChronoFilter('policies')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                          chronoFilter === 'policies'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-555 hover:text-slate-800'
                        }`}
                      >
                        Policy Changes
                      </button>
                      <button
                        onClick={() => setChronoFilter('notes')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                          chronoFilter === 'notes'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-555 hover:text-slate-800'
                        }`}
                      >
                        Notes
                      </button>
                      <button
                        onClick={() => setChronoFilter('documents')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                          chronoFilter === 'documents'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-555 hover:text-slate-800'
                        }`}
                      >
                        Documents
                      </button>
                    </div>
                  </div>

                  {/* Chronology Body */}
                  {chronoLoading ? (
                    <div className="flex justify-center items-center py-20">
                      <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  ) : chronoError ? (
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm">
                      {chronoError}
                    </div>
                  ) : filteredChronoEvents.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-slate-200 rounded-2xl">
                      <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm text-slate-400 font-sans">No events found for this policy.</p>
                    </div>
                  ) : (
                    <div className="relative border-l border-slate-100 ml-4 pl-6 space-y-8">
                      {uniqueChronoDates.map(dateStr => {
                        const dayEvents = groupedChrono[dateStr] || [];
                        return (
                          <div key={dateStr} className="space-y-4">
                            {/* Date Header */}
                            <div className="relative -ml-[31px] flex items-center gap-3">
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-blue-50" />
                              <span className="text-xs font-bold text-slate-400 font-sans tracking-wider uppercase bg-white px-2">
                                {dateStr}
                              </span>
                            </div>

                            {/* Events list */}
                            <div className="space-y-4">
                              {dayEvents.map(evt => {
                                const actorDisplay = evt.profiles?.name || evt.profiles?.email || 'Agent';
                                const timeStr = new Date(evt.created_at).toLocaleTimeString('en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: true
                                });

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

            {activeMenuTab === 'notes' && policy && (
              <UnifiedNotesManager
                clientId={policy.client_id}
                inferredCategory={
                  (policy.policy_type?.toLowerCase().includes('health')
                    ? 'health'
                    : policy.policy_type?.toLowerCase().includes('life')
                    ? 'life'
                    : 'property_casualty') as NoteCategory
                }
                policyId={policyId}
                currentUserId={currentUserId}
              />
            )}

            {activeMenuTab === 'summary' && (
              /* AREA 3: SUMMARY FORM (2-column desktop layout) */
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                  <h3 className="text-lg font-bold text-slate-900 font-sans">Summary Details</h3>
                </div>

                {errorMsg && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm">
                    {errorMsg}
                  </div>
                )}

                {successMsg && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm">
                    {successMsg}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
                  
                  {/* LEFT COLUMN */}
                  <div className="space-y-4">
                    {/* 1. Line of Business */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Line of Business</label>
                      <select
                        value={lob}
                        onChange={e => setLob(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                        required
                      >
                        <option value="">Select Option</option>
                        {[...LINES_OF_BUSINESS].sort((a, b) => a.localeCompare(b)).map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>

                    {/* Cargo */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Cargo</label>
                      <input
                        type="text"
                        value={cargo}
                        onChange={e => setCargo(e.target.value)}
                        placeholder="e.g. Dry Van, Refrigerated, Auto Hauler"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      />
                    </div>

                    {/* 2. Company */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Company</label>
                      <input
                        type="text"
                        value={writingCompany}
                        onChange={e => setWritingCompany(e.target.value)}
                        placeholder="e.g. Progressive"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      />
                    </div>

                    {/* 3. Policy Number */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Policy Number</label>
                      <input
                        type="text"
                        value={policyNumber}
                        onChange={e => setPolicyNumber(e.target.value)}
                        placeholder="e.g. POL-123456"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      />
                    </div>

                    {/* 4. Effective Date */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Effective Date</label>
                      <input
                        type="text"
                        value={effectiveDate}
                        onChange={e => setEffectiveDate(formatAsDateInput(e.target.value))}
                        placeholder="MM/DD/YYYY"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                        required
                      />
                    </div>

                    {/* 5. Expiration Date */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Expiration Date</label>
                      <input
                        type="text"
                        value={expirationDate}
                        onChange={e => setExpirationDate(formatAsDateInput(e.target.value))}
                        placeholder="MM/DD/YYYY"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                        required
                      />
                    </div>

                    {/* 6. Policy Address */}
                    <div className="border-t border-slate-100 pt-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-slate-900">Policy Address</h4>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={useAddressOnFile}
                            onChange={e => handleUseAddressOnFileToggle(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                          />
                          <span className="text-xs font-semibold text-slate-700">Use Address on File</span>
                        </label>
                      </div>

                      {noAddressMessage && (
                        <div className="p-3 mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold leading-relaxed">
                          {noAddressMessage}
                        </div>
                      )}

                      {residenceError && (
                        <div className="p-3 mb-4 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 text-xs leading-relaxed">
                          {residenceError}
                        </div>
                      )}

                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Street Address</label>
                          <input
                            type="text"
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                            disabled={useAddressOnFile}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm disabled:opacity-60 disabled:cursor-not-allowed outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">City</label>
                          <input
                            type="text"
                            value={city}
                            onChange={e => setCity(e.target.value)}
                            disabled={useAddressOnFile}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm disabled:opacity-60 disabled:cursor-not-allowed outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">State</label>
                            <input
                              type="text"
                              value={state}
                              onChange={e => setState(e.target.value)}
                              disabled={useAddressOnFile}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm disabled:opacity-60 disabled:cursor-not-allowed outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ZIP Code</label>
                            <input
                              type="text"
                              value={zipCode}
                              onChange={e => setZipCode(e.target.value)}
                              disabled={useAddressOnFile}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm disabled:opacity-60 disabled:cursor-not-allowed outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN */}
                  <div className="space-y-4">
                    {/* 1. Policy Type (Read-Only) */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Policy Type</label>
                      <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 text-sm font-semibold flex items-center justify-between cursor-not-allowed select-none">
                        <span>{(client?.client_type === 'company' || policyOwnershipType === 'company') ? 'Company' : 'Personal'}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-200 text-slate-600">
                          Derived from Client Profile
                        </span>
                      </div>
                    </div>

                    {/* 2. Policy Status */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Policy Status</label>
                      <select
                        value={policyStatus}
                        onChange={e => setPolicyStatus(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                        required
                      >
                        <option value="Active">Active</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="Expired">Expired</option>
                        <option value="Pending">Pending</option>
                      </select>
                    </div>

                    {/* 2. Total Premium */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Total Premium</label>
                      <input
                        type="number"
                        value={totalPremium}
                        onChange={e => setTotalPremium(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 5000"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      />
                    </div>

                    {/* 3. Policy Payment Frequency */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Policy Payment Frequency</label>
                      <select
                        value={paymentFrequency}
                        onChange={e => setPaymentFrequency(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                        required
                      >
                        <option value="Annual">Annual</option>
                        <option value="Monthly">Monthly</option>
                      </select>
                    </div>

                    {/* 4. Billing Type */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Billing Type</label>
                      <select
                        value={billingType}
                        onChange={e => setBillingType(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                        required
                      >
                        <option value="Direct Bill">Direct Bill</option>
                        <option value="Agency Bill">Agency Bill</option>
                      </select>
                    </div>

                    {/* 5. Broker Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Broker Name</label>
                      <input
                        type="text"
                        value={brokerName}
                        onChange={e => setBrokerName(e.target.value)}
                        placeholder="e.g. John Agent"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      />
                    </div>

                    {/* Summary Form Action Bar */}
                    <div className="col-span-1 lg:col-span-2 border-t border-slate-100 pt-4 mt-2 flex items-center justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          fetchData();
                          setSuccessMsg(null);
                          setErrorMsg(null);
                        }}
                        disabled={saving}
                        className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all"
                      >
                        Cancel Changes
                      </button>

                      <button
                        type="submit"
                        disabled={saving}
                        className="crm-btn-primary text-xs px-5 py-2 flex items-center gap-1.5 shadow-sm font-bold"
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
            </main>
          </div>
        )}
      </CrmPageContainer>
      {/* Unlink Personal Client Confirmation Modal */}
      {isConfirmUnlinkOpen && linkedPersonalClient && linkedPersonalClient.client && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Unlink Personal Client</h3>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmUnlinkOpen(false);
                  setUnlinkError(null);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to unlink this personal client from the company policy?
            </p>

            <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-4 space-y-2 text-xs text-slate-700">
              <div><span className="font-bold text-slate-500">Personal Client:</span> <strong className="text-slate-900">{linkedPersonalClient.client.full_name}</strong></div>
              <div><span className="font-bold text-slate-500">Linked Role:</span> <strong className="text-slate-900">{linkedPersonalClient.linked_person_role === 'co_applicant' ? 'Co-Applicant' : 'Main Applicant'}</strong></div>
              <div><span className="font-bold text-slate-500">Policy Number:</span> <strong className="text-slate-900">{policyNumber || '-'}</strong></div>
            </div>

            <div className="p-3 text-[11px] bg-amber-50 border border-amber-200/60 text-amber-800 rounded-xl font-medium">
              ⚠️ No policy or client data will be deleted. Only the relationship link will be removed.
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
                  setUnlinkError(null);
                }}
                disabled={unlinkingClient}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnlinkClient}
                disabled={unlinkingClient}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white rounded-xl transition-all shadow-md shadow-rose-500/10 flex items-center gap-1.5"
              >
                {unlinkingClient ? 'Unlinking...' : 'Confirm Unlink'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DocumentPreviewModal
        isOpen={pcPreviewState.isOpen}
        onClose={() => setPcPreviewState((prev) => ({ ...prev, isOpen: false, signedUrl: null, officePreview: null }))}
        fileName={pcPreviewState.fileName}
        mimeType={pcPreviewState.mimeType}
        signedUrl={pcPreviewState.signedUrl}
        officePreview={pcPreviewState.officePreview}
        loading={pcPreviewState.loading}
        error={pcPreviewState.error}
        onDownload={pcPreviewState.doc ? () => handleDownloadDoc(pcPreviewState.doc!) : undefined}
      />

      {/* RENEW POLICY MODAL */}
      {isRenewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs font-sans animate-fade-in">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-2xl p-6 max-w-md w-full space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Renew P&C Policy</h3>
              <button
                type="button"
                onClick={() => setIsRenewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              A new policy will be created using the current policy information. Effective Date, Expiration Date, and Total Premium must be entered for the new policy.
            </p>

            {renewError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs">
                {renewError}
              </div>
            )}

            <form onSubmit={handleRenewPolicySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Effective Date <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  value={renewEffectiveDate}
                  onChange={e => setRenewEffectiveDate(formatAsDateInput(e.target.value))}
                  placeholder="MM/DD/YYYY"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Expiration Date <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  value={renewExpirationDate}
                  onChange={e => setRenewExpirationDate(formatAsDateInput(e.target.value))}
                  placeholder="MM/DD/YYYY"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Total Premium <span className="text-rose-500">*</span></label>
                <input
                  type="number"
                  value={renewPremium}
                  onChange={e => setRenewPremium(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 5000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRenewModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renewing}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs disabled:opacity-50"
                >
                  {renewing ? 'Creating Renewal...' : 'Create Renewal Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL POLICY MODAL */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs font-sans animate-fade-in">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-2xl p-6 max-w-md w-full space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Cancel P&C Policy</h3>
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to cancel this policy? This action will update the policy status to <strong>Cancelled</strong> and preserve all historical policy records, documents, notes, and chronology.
            </p>

            {cancelError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs">
                {cancelError}
              </div>
            )}

            <form onSubmit={handleCancelPolicySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cancellation Reason</label>
                <select
                  value={cancellationReason}
                  onChange={e => setCancellationReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none focus:border-blue-500"
                >
                  <option value="Client Requested">Client Requested</option>
                  <option value="Changed Carrier">Changed Carrier</option>
                  <option value="Non-Renewal">Non-Renewal</option>
                  <option value="Non-Payment">Non-Payment</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes / Reason Details (Optional)</label>
                <textarea
                  rows={3}
                  value={cancellationNotes}
                  onChange={e => setCancellationNotes(e.target.value)}
                  placeholder="Additional context regarding cancellation..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 rounded-xl transition-all"
                >
                  Keep Active
                </button>
                <button
                  type="submit"
                  disabled={cancelling}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-xs disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
