'use client';

import React, { useState, useEffect, useRef, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import { LINES_OF_BUSINESS } from '@/constants/linesOfBusiness';
import {
  formatIsoToUsDate,
  usDateToIso,
  calculateTermDuration,
  formatAsDateInput,
} from '@/utils/dateUtils';

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
    section_id: string;
    uploaded_by: string;
    display_name: string;
    original_filename: string;
    storage_path: string;
    mime_type: string | null;
    size_bytes: number;
    created_at: string;
    updated_at: string;
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
  const [totalPremium, setTotalPremium] = useState<number | ''>('');
  const [annualPremium, setAnnualPremium] = useState<number | ''>('');
  const [policyStatus, setPolicyStatus] = useState<'Active' | 'Cancelled' | 'Expired' | 'Pending'>('Active');

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

      const { data, error } = await supabase
        .from('clients')
        .select('id, agent_id, full_name, agency_name, address, email, phone, created_at, updated_at')
        .eq('id', id)
        .single();

      if (error) throw error;
      setClient(data);
      setClientName(data?.full_name || '');

      if (data?.agent_id) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('name, email')
          .eq('id', data.agent_id)
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
      setTotalPremium(policyData.total_premium ?? policyData.premium ?? '');
      setAnnualPremium(policyData.annual_premium ?? '');
      setPolicyStatus(policyData.status || 'Active');
    } catch (err: any) {
      console.error('Error fetching policy data:', err);
      setErrorMsg(err?.message || 'Failed to load policy details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientDetails();
    fetchData();
  }, [id, policyId]);

  // Fetch policy notes
  const fetchNotes = async () => {
    try {
      setNotesLoading(true);
      setNotesError(null);
      const { data, error } = await supabase
        .from('policy_notes')
        .select('*, profiles(name, email)')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes((data as any) || []);
    } catch (err: any) {
      console.error('Error fetching policy notes:', err);
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

  // Fetch sections and documents
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

      const { data: docsData, error: docsErr } = await supabase
        .from('policy_documents')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false });

      if (docsErr) throw docsErr;
      const loadedDocs = (docsData || []) as PolicyDocument[];
      setDocuments(loadedDocs);

      const uploaderIds = Array.from(new Set(loadedDocs.map(d => d.uploaded_by).filter(Boolean)));
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
  const handleFileUpload = async (sectionId: string, filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;

    const allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'jpg', 'jpeg', 'png', 'webp'];
    const maxSizeBytes = 20 * 1024 * 1024; // 20 MB

    setUploadingFiles(prev => ({ ...prev, [sectionId]: true }));
    setNoteActionError(null);
    setNoteActionSuccess(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('You must be logged in.');
      const uploaderId = session.user.id;

      for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
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

  // Download document generating private short-lived signed URL
  const handleDownloadDoc = async (doc: PolicyDocument) => {
    try {
      setNoteActionError(null);
      setNoteActionSuccess(null);

      const { data, error } = await supabase
        .storage
        .from('policy-documents')
        .createSignedUrl(doc.storage_path, 60);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Failed to generate signed download link.');

      window.open(data.signedUrl, '_blank');
    } catch (err: any) {
      console.error('Error downloading document:', err);
      setNoteActionError(err?.message || 'Failed to download document.');
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

      const { error } = await supabase
        .from('policy_documents')
        .update({ display_name: renamingDocName.trim() })
        .eq('id', docId);

      if (error) throw error;

      const doc = documents.find(d => d.id === docId);
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

      const { data: deleteData, error: deleteErr } = await supabase
        .storage
        .from('policy-documents')
        .remove([doc.storage_path]);

      if (deleteErr) throw deleteErr;
      if (!deleteData || deleteData.length === 0) {
        throw new Error('Failed to delete file from storage. Metadata deletion aborted.');
      }

      const { error: metaErr } = await supabase
        .from('policy_documents')
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

      // Upload pending attachments if any
      const hasPending = pendingAttachments.length > 0;
      let attachResult: { succeeded: string[]; failed: string[] } = { succeeded: [], failed: [] };

      if (hasPending && insertedNote?.id) {
        attachResult = await uploadNoteAttachments(
          insertedNote.id,
          policyId,
          id,
          session.user.id,
          pendingAttachments
        );

        // Cleanup preview URLs
        pendingAttachments.forEach(p => URL.revokeObjectURL(p.previewUrl));
        setPendingAttachments([]);
      }

      setNewNoteContent('');
      fetchNotes();

      // Build success message
      if (hasPending && attachResult.failed.length > 0) {
        setNoteActionSuccess('Note added, but some attachments failed.');
        setNoteActionError(`Failed to upload: ${attachResult.failed.join(', ')}`);
      } else if (hasPending && attachResult.succeeded.length > 0) {
        setNoteActionSuccess(`Note added with ${attachResult.succeeded.length} image(s).`);
      } else {
        setNoteActionSuccess('Note added successfully.');
      }

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

  // Submit Form
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
          writing_company: writingCompany.trim() || null,
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

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/clients" className="hover:text-blue-600 transition-colors">Clients</Link>
          <span>/</span>
          <Link href={`/clients/${id}`} className="hover:text-blue-600 transition-colors font-medium">
            {clientName || 'Client Profile'}
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-semibold">{lob || 'Policy details'}</span>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 items-start animate-fade-in">
            {/* Left Sidebar Summary */}
            <aside className="w-full lg:w-80 bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6 flex-shrink-0">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Client Profile</span>
                <h2 className="text-2xl font-extrabold text-slate-900 mt-1 truncate">
                  {loadingClient ? 'Loading...' : client?.full_name || clientName || '-'}
                </h2>
              </div>

              {clientError && (
                <div className="p-3 text-xs bg-rose-50 border border-rose-100 text-rose-600 rounded-xl">
                  {clientError}
                </div>
              )}

              <div className="border-t border-slate-100 pt-5 space-y-4">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Agent</span>
                  <span className="text-sm font-semibold text-slate-800 block mt-1">
                    {loadingClient ? 'Loading...' : getAgentDisplayName()}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Agency</span>
                  <span className="text-sm font-semibold text-slate-800 block mt-1">
                    {loadingClient ? 'Loading...' : client?.agency_name || '-'}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Email Address</span>
                  {loadingClient ? (
                    <span className="text-sm font-semibold text-slate-500 block mt-1">Loading...</span>
                  ) : (
                    <a href={`mailto:${client?.email}`} className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline block mt-1 truncate">
                      {client?.email || '-'}
                    </a>
                  )}
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone Number</span>
                  {loadingClient ? (
                    <span className="text-sm font-semibold text-slate-500 block mt-1">Loading...</span>
                  ) : (
                    <a href={`tel:${client?.phone}`} className="text-sm font-semibold text-slate-800 hover:text-blue-600 block mt-1">
                      {client?.phone || '-'}
                    </a>
                  )}
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Address</span>
                  <span className="text-sm font-medium text-slate-700 block mt-1 leading-relaxed">
                    {loadingClient ? 'Loading...' : client?.address || '-'}
                  </span>
                </div>
              </div>
            </aside>

            {/* Right: Policy Content */}
            <div className="flex-1 w-full space-y-6">
            
            {/* AREA 1: TOP POLICY SUMMARY (Non-sticky) */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
              {/* Row 1 */}
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Policy Number</span>
                  <h1 className="text-xl font-extrabold text-slate-900">{policyNumber || 'Not provided'}</h1>
                </div>
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

              {/* Row 2 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-50 pt-4 text-sm">
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Line of Business</span>
                  <span className="font-semibold text-slate-800 mt-1 block">{lob || '-'}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Term</span>
                  <span className="font-semibold text-slate-800 mt-1 block">
                    {calculateTermDuration(effectiveDate, expirationDate)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Company</span>
                  <span className="font-semibold text-slate-800 mt-1 block">{writingCompany || '-'}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Full Premium</span>
                  <span className="font-bold text-emerald-700 mt-1 block">{formatCurrency(totalPremium)}</span>
                </div>
              </div>
            </div>

            {/* AREA 2: STICKY INTERNAL POLICY MENU */}
            {/* Sticky offsets: 69px on mobile header, 0px on desktop header */}
            <div className="sticky top-[69px] md:top-0 z-10 bg-white border border-slate-100 rounded-xl p-2 shadow-sm flex items-center gap-1">
              <button
                onClick={() => setActiveMenuTab('summary')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeMenuTab === 'summary'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-550 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setActiveMenuTab('documents')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeMenuTab === 'documents'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-550 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                Documents
              </button>
              <button
                onClick={() => setActiveMenuTab('notes')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeMenuTab === 'notes'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-550 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                Notes
              </button>
              <button
                onClick={() => setActiveMenuTab('chronology')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeMenuTab === 'chronology'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-550 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                Chronology
              </button>
            </div>

            {/* TAB CONTENT DETAILS */}
            {/* TAB CONTENT DETAILS */}
            {activeMenuTab === 'documents' && (
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                  <h3 className="text-lg font-extrabold text-slate-900 font-sans">Policy Documents</h3>
                  <button
                    onClick={handleAddSection}
                    disabled={savingSection || sections.length >= 10}
                    className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10 disabled:opacity-50 font-sans"
                  >
                    Add Section
                  </button>
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

                {docsLoading && sections.length === 0 ? (
                  <div className="flex justify-center items-center py-20">
                    <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                ) : sections.length === 0 ? (
                  <div className="text-center py-20 border border-dashed border-slate-200 rounded-2xl">
                    <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6m-3-3v6m-9 1V4a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    <p className="text-sm text-slate-450 font-sans">No document sections found. Click "Add Section" to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {sections.map(section => {
                      const sectionDocs = documents.filter(d => d.section_id === section.id);
                      const isRenaming = renamingSectionId === section.id;
                      const isUploading = uploadingFiles[section.id];

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
                            {/* Upload Area */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-50 pb-4">
                              <span className="text-xs text-slate-400 font-sans">
                                Allowed formats: PDF, Word, Excel, CSV, TXT, Images (Max 20MB)
                              </span>
                              <div className="relative">
                                <input
                                  type="file"
                                  id={`file-upload-${section.id}`}
                                  multiple
                                  disabled={isUploading}
                                  onChange={e => handleFileUpload(section.id, e.target.files)}
                                  className="hidden"
                                />
                                <label
                                  htmlFor={`file-upload-${section.id}`}
                                  className={`inline-flex items-center justify-center gap-2 bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
                                    isUploading ? 'opacity-50 cursor-not-allowed' : ''
                                  }`}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                  </svg>
                                  {isUploading ? 'Uploading...' : 'Upload Documents'}
                                </label>
                              </div>
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

                                  const dateObj = new Date(doc.created_at);
                                  const formattedDateTime = dateObj.toLocaleDateString('en-US', {
                                    month: '2-digit',
                                    day: '2-digit',
                                    year: 'numeric'
                                  }) + ' ' + dateObj.toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                  });

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
                )}
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

              const groupedChrono = groupChronoEventsByDate(filteredChronoEvents);
              const uniqueChronoDates = Array.from(new Set(filteredChronoEvents.map(evt => 
                new Date(evt.created_at).toLocaleDateString('en-US', {
                  month: '2-digit',
                  day: '2-digit',
                  year: 'numeric'
                })
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

            {activeMenuTab === 'notes' && (
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                  <h3 className="text-lg font-extrabold text-slate-900 font-sans">Policy Notes</h3>
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

                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="space-y-4">
                  <textarea
                    value={newNoteContent}
                    onChange={e => setNewNoteContent(e.target.value)}
                    onPaste={handleNotePaste}
                    placeholder="Add a note to this policy... (You can paste screenshots here with Ctrl+V)"
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all resize-none font-sans"
                  />

                  {/* Pending attachments previews */}
                  {pendingAttachments.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      {pendingAttachments.map((att, idx) => (
                        <div key={idx} className="relative group bg-white border border-slate-200 rounded-lg p-2 flex flex-col items-center">
                          <img
                            src={att.previewUrl}
                            alt={att.displayName}
                            className="w-full h-20 object-cover rounded-md mb-1.5"
                          />
                          <span className="text-[10px] text-slate-500 truncate w-full text-center font-sans" title={att.displayName}>
                            {att.displayName}
                          </span>
                          <span className="text-[9px] text-slate-400 font-sans">
                            {formatFileSize(att.file.size)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removePendingAttachment(idx)}
                            className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-1 shadow-md hover:bg-rose-600 transition-colors active:scale-95"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <div>
                      <input
                        type="file"
                        ref={noteImageInputRef}
                        onChange={handleAttachImageSelect}
                        accept="image/png, image/jpeg, image/webp"
                        multiple
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => noteImageInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:border-slate-350 hover:bg-slate-50 rounded-xl text-slate-600 text-xs font-bold transition-all active:scale-[0.98]"
                      >
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Attach Image
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={savingNote || (!newNoteContent.trim() && pendingAttachments.length === 0)}
                      className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10 disabled:opacity-50"
                    >
                      {savingNote ? 'Adding...' : 'Add Note'}
                    </button>
                  </div>
                </form>

                {/* Notes List */}
                {notesLoading ? (
                  <div className="flex justify-center items-center py-10">
                    <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                ) : notes.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl">
                    <p className="text-sm text-slate-400 font-sans">No notes have been added to this policy yet.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {notes.map(note => {
                      const isEditing = editingNoteId === note.id;
                      const authorDisplay = note.profiles?.name || note.profiles?.email || 'Agent';
                      const isEdited = new Date(note.updated_at).getTime() !== new Date(note.created_at).getTime();

                      // Format timestamp in US format: MM/DD/YYYY hh:mm A
                      const dateObj = new Date(note.created_at);
                      const formattedDateTime = dateObj.toLocaleDateString('en-US', {
                        month: '2-digit',
                        day: '2-digit',
                        year: 'numeric'
                      }) + ' ' + dateObj.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      });

                      return (
                        <div key={note.id} className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-400 font-sans">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-700">{authorDisplay}</span>
                              <span>•</span>
                              <span>{formattedDateTime}</span>
                              {isEdited && <span className="text-[10px] bg-slate-200 text-slate-650 px-1.5 py-0.5 rounded">Edited</span>}
                            </div>
                            <div className="flex items-center gap-3">
                              {!isEditing && note.author_id === currentUserId && (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingNoteId(note.id);
                                      setEditingNoteContent(note.content);
                                    }}
                                    className="text-slate-500 hover:text-blue-600 transition-colors font-bold"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteNote(note.id)}
                                    className="text-rose-500 hover:text-rose-700 transition-colors font-bold"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {isEditing ? (
                            <div className="space-y-2 pt-2">
                              <textarea
                                value={editingNoteContent}
                                onChange={e => setEditingNoteContent(e.target.value)}
                                rows={3}
                                className="w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-3 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all resize-none font-sans"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setEditingNoteId(null);
                                    setEditingNoteContent('');
                                  }}
                                  className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-150 px-3 py-1.5 rounded-lg transition-all font-sans"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleEditNoteSubmit(note.id)}
                                  disabled={savingNote || !editingNoteContent.trim()}
                                  className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-all shadow-md disabled:opacity-50 font-sans"
                                >
                                  {savingNote ? 'Saving...' : 'Save Changes'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <p className="text-sm text-slate-700 whitespace-pre-wrap pt-1 font-sans">{note.content}</p>
                              {noteAttachments[note.id] && noteAttachments[note.id].length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
                                  {noteAttachments[note.id].map(att => (
                                    <div
                                      key={att.id}
                                      className="relative group bg-white border border-slate-250/60 rounded-lg p-2 flex flex-col items-center shadow-xs"
                                    >
                                      {/* Clickable signed URL thumbnail */}
                                      <div
                                        onClick={() => openAttachmentSignedUrl(att.storage_path)}
                                        className="w-full h-16 bg-slate-50 rounded-md overflow-hidden flex items-center justify-center cursor-pointer hover:opacity-85 transition-opacity"
                                      >
                                        <div className="flex flex-col items-center text-slate-400">
                                          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                          </svg>
                                          <span className="text-[8px] mt-0.5 text-slate-500 font-sans">View Image</span>
                                        </div>
                                      </div>
                                      <span
                                        onClick={() => openAttachmentSignedUrl(att.storage_path)}
                                        className="text-[10px] text-slate-600 truncate w-full text-center font-bold mt-1.5 cursor-pointer hover:text-blue-600 hover:underline font-sans"
                                        title={att.display_name}
                                      >
                                        {att.display_name}
                                      </span>
                                      <span className="text-[9px] text-slate-400 font-sans">
                                        {formatFileSize(att.size_bytes)}
                                      </span>

                                      {/* Deletion of individual attachment */}
                                      <button
                                        type="button"
                                        disabled={deletingAttachmentId === att.id}
                                        onClick={() => handleDeleteAttachment(att)}
                                        className="absolute -top-1.5 -right-1.5 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 rounded-full p-1 shadow-sm transition-colors disabled:opacity-50"
                                        title="Delete attachment"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeMenuTab === 'summary' && (
              /* AREA 3: SUMMARY FORM (2-column desktop layout) */
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                  <h3 className="text-lg font-extrabold text-slate-900">Summary Details</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      onClick={handleSubmit}
                      disabled={saving}
                      className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-all shadow-md disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save Summary'}
                    </button>
                  </div>
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

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  
                  {/* LEFT COLUMN */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Line of Business</label>
                      <select
                        value={lob}
                        onChange={e => setLob(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                        required
                      >
                        <option value="">Select Option</option>
                        {LINES_OF_BUSINESS.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Transaction Type</label>
                      <select
                        value={transactionType}
                        onChange={e => setTransactionType(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all"
                        required
                      >
                        <option value="New Business">New Business</option>
                        <option value="Renewal">Renewal</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Policy Number</label>
                      <input
                        type="text"
                        value={policyNumber}
                        onChange={e => setPolicyNumber(e.target.value)}
                        placeholder="e.g. POL-123456"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Policy Payment Frequency</label>
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

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Effective Date</label>
                      <input
                        type="text"
                        value={effectiveDate}
                        onChange={e => setEffectiveDate(formatAsDateInput(e.target.value))}
                        placeholder="MM/DD/YYYY"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Expiration Date</label>
                      <input
                        type="text"
                        value={expirationDate}
                        onChange={e => setExpirationDate(formatAsDateInput(e.target.value))}
                        placeholder="MM/DD/YYYY"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Billing Type</label>
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
                  </div>

                  {/* RIGHT COLUMN */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Broker Name</label>
                      <input
                        type="text"
                        value={brokerName}
                        onChange={e => setBrokerName(e.target.value)}
                        placeholder="e.g. John Agent"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Writing Company</label>
                      <input
                        type="text"
                        value={writingCompany}
                        onChange={e => setWritingCompany(e.target.value)}
                        placeholder="e.g. Progressive"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Total Premium</label>
                      <input
                        type="number"
                        value={totalPremium}
                        onChange={e => setTotalPremium(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 5000"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Annual Premium</label>
                      <input
                        type="number"
                        value={annualPremium}
                        onChange={e => setAnnualPremium(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 5000"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Policy Status</label>
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
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  </DashboardLayout>
  );
}
