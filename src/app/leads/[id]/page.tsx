'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import { Lead, LeadStatus, LeadPriority } from '@/lib/leads/types';
import {
  formatIsoToUsDate,
  usDateToIso,
  formatAsDateInput,
  parseUsDateAnd12hTimeToDate,
  extractUsDateAnd12hTime,
} from '@/utils/dateUtils';
import ConvertLeadModal from '@/components/leads/ConvertLeadModal';
import LeadNotesTab from '@/components/leads/LeadNotesTab';
import LeadDocumentsTab from '@/components/leads/LeadDocumentsTab';
import LeadTimelineTab from '@/components/leads/LeadTimelineTab';

interface LeadProfilePageProps {
  params: Promise<{ id: string }>;
}

export default function LeadProfilePage({ params }: LeadProfilePageProps) {
  const resolvedParams = use(params);
  const leadId = resolvedParams.id;
  const router = useRouter();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'documents' | 'timeline'>('overview');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Convert Modal State
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);

  // Form Fields for Edit
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [productInterest, setProductInterest] = useState('');
  const [status, setStatus] = useState<LeadStatus>('new');
  const [priority, setPriority] = useState<LeadPriority>('medium');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [zipCode, setZipCode] = useState('');

  // Follow-up Date & Time fields
  const [enableFollowUp, setEnableFollowUp] = useState(false);
  const [followUpDateUs, setFollowUpDateUs] = useState('');
  const [followUpHour, setFollowUpHour] = useState('09');
  const [followUpMinute, setFollowUpMinute] = useState('00');
  const [followUpAmPm, setFollowUpAmPm] = useState<'AM' | 'PM'>('AM');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadLeadDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error: fetchErr } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .eq('agent_id', user.id)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      if (!data) {
        setError('Lead not found or access denied.');
        setLead(null);
      } else {
        setLead(data);
      }
    } catch (err: any) {
      console.error('Error loading lead profile:', err);
      setError(err?.message || 'Failed to load lead details.');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    loadLeadDetails();
  }, [loadLeadDetails]);

  // Open Edit Modal
  const handleOpenEditModal = () => {
    if (!lead) return;
    if (lead.status === 'converted') {
      showToast('Converted leads cannot be edited.', 'error');
      return;
    }
    setFirstName(lead.first_name || '');
    setLastName(lead.last_name || '');
    setPhone(lead.phone || '');
    setEmail(lead.email || '');
    setProductInterest(lead.product_interest || '');
    setStatus(lead.status);
    setPriority(lead.priority);
    setAddress(lead.address || '');
    setCity(lead.city || '');
    setStateVal(lead.state || '');
    setZipCode(lead.zip_code || '');

    if (lead.next_follow_up_at) {
      setEnableFollowUp(true);
      const { dateUs, hour12, minute, ampm } = extractUsDateAnd12hTime(lead.next_follow_up_at);
      setFollowUpDateUs(dateUs);
      setFollowUpHour(hour12);
      setFollowUpMinute(minute);
      setFollowUpAmPm(ampm);
    } else {
      setEnableFollowUp(false);
      const { dateUs, hour12, minute, ampm } = extractUsDateAnd12hTime(null);
      setFollowUpDateUs(dateUs);
      setFollowUpHour(hour12);
      setFollowUpMinute(minute);
      setFollowUpAmPm(ampm);
    }

    setFormError(null);
    setIsEditModalOpen(true);
  };

  // Save Lead Updates
  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    if (!trimmedFirst || !trimmedLast) {
      setFormError('First Name and Last Name are required.');
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }

    let nextFollowUpIso: string | null = null;
    if (enableFollowUp) {
      if (!followUpDateUs.trim()) {
        setFormError('Please enter a valid follow-up date (MM/DD/YYYY).');
        return;
      }
      const parsedDate = parseUsDateAnd12hTimeToDate(
        followUpDateUs,
        followUpHour,
        followUpMinute,
        followUpAmPm
      );
      if (!parsedDate) {
        setFormError('Invalid follow-up date or time. Please use MM/DD/YYYY format.');
        return;
      }
      nextFollowUpIso = parsedDate.toISOString();
    }

    setFormSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated.');

      const payload = {
        first_name: trimmedFirst,
        last_name: trimmedLast,
        phone: phone.trim() || null,
        email: trimmedEmail || null,
        product_interest: productInterest.trim() || null,
        status: status,
        priority: priority,
        next_follow_up_at: nextFollowUpIso,
        address: address.trim() || null,
        city: city.trim() || null,
        state: stateVal.trim() || null,
        zip_code: zipCode.trim() || null,
        last_activity_at: new Date().toISOString(),
      };

      const { error: updateErr } = await supabase
        .from('leads')
        .update(payload)
        .eq('id', leadId)
        .eq('agent_id', user.id);

      if (updateErr) throw updateErr;

      showToast('Lead updated successfully');
      setIsEditModalOpen(false);
      loadLeadDetails();
    } catch (err: any) {
      console.error('Error updating lead:', err);
      setFormError(err?.message || 'Failed to update lead.');
    } finally {
      setFormSaving(false);
    }
  };

  // Execute Lead Delete
  const handleDeleteLead = async () => {
    try {
      setDeleting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error: delErr } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadId)
        .eq('agent_id', user.id);

      if (delErr) throw delErr;

      showToast('Lead deleted successfully');
      router.replace('/leads');
    } catch (err: any) {
      console.error('Error deleting lead:', err);
      showToast(err?.message || 'Failed to delete lead', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (st: LeadStatus) => {
    switch (st) {
      case 'new':
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">New</span>;
      case 'contacted':
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">Contacted</span>;
      case 'in_progress':
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">In Progress</span>;
      case 'qualified':
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Qualified</span>;
      case 'converted':
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20">Converted</span>;
      case 'lost':
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">Lost</span>;
      default:
        return <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300">{st}</span>;
    }
  };

  const getPriorityBadge = (pr: LeadPriority) => {
    switch (pr) {
      case 'high':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">High Priority</span>;
      case 'medium':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Medium Priority</span>;
      case 'low':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">Low Priority</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300">{pr}</span>;
    }
  };

  const formatFollowUpDisplay = (isoStr: string | null) => {
    if (!isoStr) return <span className="text-slate-500 text-sm italic">No follow-up set</span>;

    const { dateUs, hour12, minute, ampm } = extractUsDateAnd12hTime(isoStr);
    const now = new Date().toISOString();
    const isOverdue = isoStr <= now;

    return (
      <div className="flex items-center gap-2">
        <span className={`text-sm ${isOverdue ? 'text-rose-400 font-semibold' : 'text-slate-200'}`}>
          {dateUs} at {hour12}:{minute} {ampm}
        </span>
        {isOverdue && (
          <span className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold uppercase tracking-wider">
            Overdue
          </span>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-slate-500 text-sm">
          Loading lead profile...
        </div>
      </DashboardLayout>
    );
  }

  if (error || !lead) {
    return (
      <DashboardLayout>
        <div className="max-w-xl mx-auto my-12 bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
          <h2 className="text-xl font-bold text-slate-100">Lead Not Found</h2>
          <p className="text-sm text-slate-400">
            {error || 'The requested lead does not exist or you do not have authorization to view it.'}
          </p>
          <Link
            href="/leads"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
          >
            Back to Leads
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const isConverted = lead.status === 'converted';

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Toast Notification */}
        {toast && (
          <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium transition-all duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/90 border-rose-500/30 text-rose-300'
          }`}>
            {toast.message}
          </div>
        )}

        {/* Back Link */}
        <div>
          <Link
            href="/leads"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Leads
          </Link>
        </div>

        {/* Lead Profile Header */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
                  {lead.first_name} {lead.last_name}
                </h1>
                {getStatusBadge(lead.status)}
                {getPriorityBadge(lead.priority)}
              </div>
              <p className="text-sm text-slate-400 mt-1">
                Interest: <strong className="text-slate-200">{lead.product_interest || 'General Lead'}</strong>
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {!isConverted ? (
                <button
                  onClick={handleOpenEditModal}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                >
                  Edit Lead
                </button>
              ) : (
                <span className="px-4 py-2 rounded-xl bg-slate-950 text-slate-600 text-xs font-semibold cursor-not-allowed border border-slate-800/40">
                  Edit (Converted)
                </span>
              )}

              {!isConverted ? (
                <button
                  onClick={() => setIsConvertModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white text-xs font-semibold shadow-lg shadow-emerald-500/20 transition-all"
                >
                  Convert to Client
                </button>
              ) : lead.converted_client_id ? (
                <Link
                  href={`/clients/${lead.converted_client_id}`}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open Client Profile
                </Link>
              ) : (
                <span className="px-4 py-2 rounded-xl bg-slate-950 text-slate-600 text-xs font-semibold border border-slate-800/40">
                  Converted
                </span>
              )}

              <button
                onClick={() => setIsDeleteModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold transition-colors"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-800/80 pt-4 gap-6 text-sm font-semibold">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'notes'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Notes
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'documents'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Documents
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'timeline'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Timeline
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contact & Opportunity Card */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider border-b border-slate-800/80 pb-3">
                Contact & Opportunity Details
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 font-semibold block uppercase">Phone</span>
                  <span className="text-slate-200 text-sm font-medium">{lead.phone || 'Not provided'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase">Email</span>
                  <span className="text-slate-200 text-sm font-medium">{lead.email || 'Not provided'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase">Product Interest</span>
                  <span className="text-slate-200 text-sm font-medium">{lead.product_interest || 'Not specified'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase">Priority</span>
                  <div className="mt-1">{getPriorityBadge(lead.priority)}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 font-semibold block uppercase mb-1">Next Scheduled Follow-up</span>
                  {formatFollowUpDisplay(lead.next_follow_up_at)}
                </div>
              </div>
            </div>

            {/* Address & Timestamps Card */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider border-b border-slate-800/80 pb-3">
                Address & Record Timeline
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="col-span-2">
                  <span className="text-slate-500 font-semibold block uppercase">Street Address</span>
                  <span className="text-slate-200 text-sm font-medium">{lead.address || 'Not provided'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase">City</span>
                  <span className="text-slate-200 text-sm font-medium">{lead.city || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block uppercase">State / ZIP</span>
                  <span className="text-slate-200 text-sm font-medium">
                    {lead.state || 'N/A'} {lead.zip_code || ''}
                  </span>
                </div>
                <div className="border-t border-slate-800/60 pt-3 col-span-2 grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-500 font-semibold block uppercase">Created Date</span>
                    <span className="text-slate-300">{formatIsoToUsDate(lead.created_at)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold block uppercase">Last Activity</span>
                    <span className="text-slate-300">{formatIsoToUsDate(lead.last_activity_at)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold block uppercase">Last Updated</span>
                    <span className="text-slate-300">{formatIsoToUsDate(lead.updated_at)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold block uppercase">Conversion Status</span>
                    <span className="text-slate-300">
                      {isConverted ? (
                        <span className="text-green-400 font-semibold">Converted on {formatIsoToUsDate(lead.converted_at)}</span>
                      ) : (
                        'Not Converted'
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notes Tab */}
        {activeTab === 'notes' && (
          <LeadNotesTab lead={lead} onActivityLogged={loadLeadDetails} />
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <LeadDocumentsTab lead={lead} onActivityLogged={loadLeadDetails} />
        )}

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <LeadTimelineTab lead={lead} />
        )}
      </div>

      {/* Edit Lead Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8 relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
              <h2 className="text-xl font-bold text-slate-100">Edit Lead</h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {formError && (
              <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveLead} className="space-y-6">
              {/* SECTION 1 — CONTACT INFORMATION */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-3">
                  1. Contact Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      First Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Last Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Phone</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-blue-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2 — OPPORTUNITY */}
              <div className="border-t border-slate-800/80 pt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3">
                  2. Opportunity Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Product Interest</label>
                    <input
                      type="text"
                      value={productInterest}
                      onChange={(e) => setProductInterest(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Lead Status <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as LeadStatus)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="in_progress">In Progress</option>
                      <option value="qualified">Qualified</option>
                      <option value="lost">Lost</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Priority <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as LeadPriority)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                {/* Follow-up Section */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableFollowUp}
                        onChange={(e) => setEnableFollowUp(e.target.checked)}
                        className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                      />
                      Schedule Next Follow-up
                    </label>
                    {enableFollowUp && (
                      <button
                        type="button"
                        onClick={() => setEnableFollowUp(false)}
                        className="text-[11px] text-rose-400 hover:underline font-medium"
                      >
                        Clear Follow-up
                      </button>
                    )}
                  </div>

                  {enableFollowUp && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                          Date (MM/DD/YYYY)
                        </label>
                        <input
                          type="text"
                          maxLength={10}
                          placeholder="MM/DD/YYYY"
                          value={followUpDateUs}
                          onChange={(e) => setFollowUpDateUs(formatAsDateInput(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Time</label>
                        <div className="flex items-center gap-1">
                          <select
                            value={followUpHour}
                            onChange={(e) => setFollowUpHour(e.target.value)}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-100 outline-none flex-1"
                          >
                            {['01','02','03','04','05','06','07','08','09','10','11','12'].map((h) => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                          <span className="text-slate-500 font-bold">:</span>
                          <select
                            value={followUpMinute}
                            onChange={(e) => setFollowUpMinute(e.target.value)}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-100 outline-none flex-1"
                          >
                            {['00','15','30','45'].map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">AM/PM</label>
                        <select
                          value={followUpAmPm}
                          onChange={(e) => setFollowUpAmPm(e.target.value as 'AM' | 'PM')}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 outline-none"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 3 — ADDRESS */}
              <div className="border-t border-slate-800/80 pt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3">
                  3. Address
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Street Address</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">City</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">State</label>
                      <input
                        type="text"
                        value={stateVal}
                        onChange={(e) => setStateVal(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">ZIP Code</label>
                      <input
                        type="text"
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white text-sm font-semibold shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {formSaving ? 'Updating...' : 'Update Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-slate-100 mb-2">Delete Lead</h3>
            <p className="text-sm text-slate-400 mb-6">
              Are you sure you want to delete lead <strong className="text-slate-200">{lead.first_name} {lead.last_name}</strong>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteLead}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg transition-all disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Lead'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Convert Lead Modal */}
      {isConvertModalOpen && lead && (
        <ConvertLeadModal
          lead={lead}
          onClose={() => setIsConvertModalOpen(false)}
          onSuccess={(clientId) => {
            setIsConvertModalOpen(false);
            showToast('Lead converted to client successfully!');
            loadLeadDetails();
          }}
        />
      )}
    </DashboardLayout>
  );
}
