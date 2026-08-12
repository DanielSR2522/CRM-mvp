'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import { supabase } from '@/lib/supabaseClient';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type {
  ExtendedCalendarEventProps,
  AppointmentStatus,
} from '@/lib/calendar/types';
import {
  formatIsoToUsDate,
  formatAsDateInput,
  usDateToIso,
  parseUsDateAnd12hTimeToDate,
  extractUsDateAnd12hTime,
} from '@/utils/dateUtils';
import DatePicker from '@/components/ui/DatePicker';

interface ClientOption {
  id: string;
  full_name: string;
}

const HOURS_12 = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

/** Formats ISO timestamp to US format: MM/DD/YYYY, hh:mm AM/PM */
const formatTimestampToUsDateTime = (isoStr: string | null | undefined): string => {
  if (!isoStr) return 'N/A';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return isoStr;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${mm}/${dd}/${yyyy}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
};

export default function CalendarPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appointmentError, setAppointmentError] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Events & Client List
  const [events, setEvents] = useState<any[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);

  // Modal States
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);
  const [selectedExpiration, setSelectedExpiration] = useState<ExtendedCalendarEventProps | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<ExtendedCalendarEventProps | null>(null);

  // New/Edit Appointment Form State (Separate Controlled Date & 12h Time Inputs)
  const [formAppointmentId, setFormAppointmentId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formClientId, setFormClientId] = useState('');
  
  const [formStartDateUs, setFormStartDateUs] = useState('');
  const [formStartHour, setFormStartHour] = useState('09');
  const [formStartMinute, setFormStartMinute] = useState('00');
  const [formStartAmPm, setFormStartAmPm] = useState<'AM' | 'PM'>('AM');

  const [formEndDateUs, setFormEndDateUs] = useState('');
  const [formEndHour, setFormEndHour] = useState('10');
  const [formEndMinute, setFormEndMinute] = useState('00');
  const [formEndAmPm, setFormEndAmPm] = useState<'AM' | 'PM'>('AM');

  const [formLocation, setFormLocation] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatus] = useState<AppointmentStatus>('scheduled');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const flashNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  // Independent Data Loader for Calendar
  const loadCalendarData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setAppointmentError(null);
      setPolicyError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[NavTrace]', {
          source: 'CalendarPage loadCalendarData',
          event: 'USER_NULL',
          currentPath: typeof window !== 'undefined' ? window.location.pathname : '/calendar',
          target: 'none',
          reason: 'User null during calendar load; skipping router.push to prevent tab-switch redirect',
        });
        setLoading(false);
        return;
      }
      setCurrentUser(user);

      // Fetch Clients for dropdown & client lookup map
      const clientMap = new Map<string, any>();
      try {
        const { data: clientsData, error: clientsErr } = await supabase
          .from('clients')
          .select('id, full_name, email, phone')
          .order('full_name', { ascending: true });

        if (!clientsErr && clientsData) {
          setClients(clientsData.map((c) => ({ id: c.id, full_name: c.full_name })));
          clientsData.forEach((c) => clientMap.set(c.id, c));
        }
      } catch (clientFetchErr) {
        console.error('Error fetching clients list:', clientFetchErr);
      }

      let fetchedExpirations: any[] = [];
      let fetchedAppointments: any[] = [];

      // 1. INDEPENDENT QUERY: Policy Expirations
      try {
        const { data: policiesData, error: policiesErr } = await supabase
          .from('policies')
          .select('id, client_id, policy_number, policy_type, company_name, writing_company, expiration_date')
          .not('expiration_date', 'is', null);

        if (policiesErr) throw policiesErr;

        fetchedExpirations = (policiesData || [])
          .filter((pol: any) => Boolean(pol.expiration_date))
          .map((pol: any) => {
            const client = clientMap.get(pol.client_id);
            const clientName = client?.full_name || 'Client';
            const company = pol.company_name || pol.writing_company || 'N/A';
            const cleanExpDate = String(pol.expiration_date).split('T')[0];

            return {
              id: `expiration-${pol.id}`,
              title: `Expires: ${clientName} - ${pol.policy_type}`,
              start: cleanExpDate,
              allDay: true,
              backgroundColor: '#ef4444',
              borderColor: '#dc2626',
              textColor: '#ffffff',
              extendedProps: {
                eventType: 'policy_expiration',
                policyId: pol.id,
                clientId: pol.client_id,
                clientName,
                policyType: pol.policy_type,
                policyNumber: pol.policy_number || 'N/A',
                company,
                expirationDate: cleanExpDate,
              } as ExtendedCalendarEventProps,
            };
          });
      } catch (err: any) {
        console.error('Error loading policy expirations:', err);
        setPolicyError('Could not load policy expirations: ' + (err?.message || 'Database query failed.'));
      }

      // 2. INDEPENDENT QUERY: Calendar Appointments
      try {
        const { data: apptData, error: apptErr } = await supabase
          .from('calendar_appointments')
          .select('*, client:clients(id, full_name, email, phone)')
          .eq('agent_id', user.id)
          .order('starts_at', { ascending: true });

        if (apptErr) throw apptErr;

        fetchedAppointments = (apptData || []).map((appt: any) => {
          const clientName = appt.client?.full_name || clientMap.get(appt.client_id)?.full_name || null;
          const isCancelled = appt.status === 'cancelled';
          const isCompleted = appt.status === 'completed';

          let bg = '#3b82f6';
          let border = '#2563eb';
          if (isCancelled) {
            bg = '#94a3b8';
            border = '#64748b';
          } else if (isCompleted) {
            bg = '#10b981';
            border = '#059669';
          }

          return {
            id: `appointment-${appt.id}`,
            title: clientName ? `${appt.title} (${clientName})` : appt.title,
            start: appt.starts_at,
            end: appt.ends_at,
            allDay: false,
            backgroundColor: bg,
            borderColor: border,
            textColor: '#ffffff',
            className: isCancelled ? 'opacity-60 line-through' : '',
            extendedProps: {
              eventType: 'appointment',
              appointmentId: appt.id,
              clientId: appt.client_id,
              clientName,
              description: appt.description,
              location: appt.location,
              startsAt: appt.starts_at,
              endsAt: appt.ends_at,
              status: appt.status,
            } as ExtendedCalendarEventProps,
          };
        });
      } catch (err: any) {
        console.error('Error loading appointments:', err);
        setAppointmentError('Could not load appointments: ' + (err?.message || 'Database query failed.'));
      }

      setEvents([...fetchedExpirations, ...fetchedAppointments]);
    } catch (err: any) {
      console.error('Error initializing calendar:', err);
      setError(err?.message || 'Failed to initialize calendar.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadCalendarData();
  }, [loadCalendarData]);

  const handleOpenNewAppointment = (defaultStart?: Date) => {
    setFormError(null);
    setFormAppointmentId(null);
    setFormTitle('');
    setFormClientId('');
    setFormLocation('');
    setFormDescription('');
    setFormStatus('scheduled');

    const start = defaultStart || new Date();
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const startExt = extractUsDateAnd12hTime(start);
    const endExt = extractUsDateAnd12hTime(end);

    setFormStartDateUs(startExt.dateUs);
    setFormStartHour(startExt.hour12);
    setFormStartMinute(startExt.minute);
    setFormStartAmPm(startExt.ampm);

    setFormEndDateUs(endExt.dateUs);
    setFormEndHour(endExt.hour12);
    setFormEndMinute(endExt.minute);
    setFormEndAmPm(endExt.ampm);

    setIsNewAppointmentOpen(true);
  };

  const handleOpenEditAppointment = (props: ExtendedCalendarEventProps) => {
    setFormError(null);
    setFormAppointmentId(props.appointmentId || null);
    setFormTitle(props.clientName ? props.clientName : '');
    setFormClientId(props.clientId || '');
    setFormLocation(props.location || '');
    setFormDescription(props.description || '');
    setFormStatus(props.status || 'scheduled');

    if (props.startsAt) {
      const startExt = extractUsDateAnd12hTime(props.startsAt);
      setFormStartDateUs(startExt.dateUs);
      setFormStartHour(startExt.hour12);
      setFormStartMinute(startExt.minute);
      setFormStartAmPm(startExt.ampm);
    }

    if (props.endsAt) {
      const endExt = extractUsDateAnd12hTime(props.endsAt);
      setFormEndDateUs(endExt.dateUs);
      setFormEndHour(endExt.hour12);
      setFormEndMinute(endExt.minute);
      setFormEndAmPm(endExt.ampm);
    }

    setSelectedAppointment(null);
    setIsNewAppointmentOpen(true);
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formTitle.trim()) {
      setFormError('Title is required.');
      return;
    }

    // Validate and parse Start Date & Time
    const startDate = parseUsDateAnd12hTimeToDate(
      formStartDateUs,
      formStartHour,
      formStartMinute,
      formStartAmPm
    );

    if (!startDate) {
      setFormError('Start Date is invalid. Please enter a valid date in MM/DD/YYYY format (e.g. 07/27/2026).');
      return;
    }

    // Validate and parse End Date & Time
    const endDate = parseUsDateAnd12hTimeToDate(
      formEndDateUs,
      formEndHour,
      formEndMinute,
      formEndAmPm
    );

    if (!endDate) {
      setFormError('End Date is invalid. Please enter a valid date in MM/DD/YYYY format (e.g. 07/27/2026).');
      return;
    }

    if (endDate <= startDate) {
      setFormError('End date and time must be later than start date and time.');
      return;
    }

    setFormSaving(true);
    try {
      const payload: any = {
        agent_id: currentUser.id,
        client_id: formClientId.trim() ? formClientId : null,
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        location: formLocation.trim() || null,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        status: formStatus,
      };

      if (formAppointmentId) {
        const { error: updateErr } = await supabase
          .from('calendar_appointments')
          .update({
            ...payload,
            updated_at: new Date().toISOString(),
          })
          .eq('id', formAppointmentId)
          .eq('agent_id', currentUser.id);

        if (updateErr) throw updateErr;
        flashNotice('Appointment updated successfully.');
      } else {
        const { error: insertErr } = await supabase
          .from('calendar_appointments')
          .insert(payload);

        if (insertErr) throw insertErr;
        flashNotice('New appointment created successfully.');
      }

      setIsNewAppointmentOpen(false);
      await loadCalendarData();
    } catch (err: any) {
      console.error('Error saving appointment:', err);
      setFormError(err?.message || 'Failed to save appointment.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteAppointment = async (appointmentId: string) => {
    if (!confirm('Are you sure you want to delete this appointment?')) return;

    try {
      const { error: delErr } = await supabase
        .from('calendar_appointments')
        .delete()
        .eq('id', appointmentId)
        .eq('agent_id', currentUser.id);

      if (delErr) throw delErr;

      setSelectedAppointment(null);
      flashNotice('Appointment deleted successfully.');
      await loadCalendarData();
    } catch (err: any) {
      console.error('Error deleting appointment:', err);
      setError(err?.message || 'Failed to delete appointment.');
    }
  };

  const handleEventClick = (info: any) => {
    const props = info.event.extendedProps as ExtendedCalendarEventProps;

    if (props.eventType === 'policy_expiration') {
      setSelectedExpiration(props);
    } else if (props.eventType === 'appointment') {
      setSelectedAppointment(props);
    }
  };

  const handleDateSelect = (selectInfo: any) => {
    handleOpenNewAppointment(selectInfo.start);
  };

  if (!mounted) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Calendar</h1>
              <p className="text-sm text-slate-500">Manage your appointments and policy expirations</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-12 border border-slate-200/80 shadow-sm text-center text-xs font-semibold text-slate-400">
            Loading schedule...
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <CrmPageContainer>
        {/* Flash Notification Banner */}
        {notice && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 font-medium text-sm flex items-center justify-between shadow-sm animate-fadeIn">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Close"
              className="text-emerald-500 hover:text-emerald-700 font-bold ml-4 p-1 rounded-lg hover:bg-emerald-500/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 font-medium text-sm flex items-center justify-between shadow-sm">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Close"
              className="text-rose-500 hover:text-rose-700 font-bold ml-4 p-1 rounded-lg hover:bg-rose-500/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Source-specific Error Banners */}
        {policyError && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 font-medium text-sm flex items-center justify-between shadow-sm">
            <span>⚠️ {policyError}</span>
            <button
              type="button"
              onClick={() => setPolicyError(null)}
              aria-label="Close"
              className="text-amber-600 hover:text-amber-800 font-bold ml-4 p-1 rounded-lg hover:bg-amber-500/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {appointmentError && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 font-medium text-sm flex items-center justify-between shadow-sm">
            <span>⚠️ {appointmentError}</span>
            <button
              type="button"
              onClick={() => setAppointmentError(null)}
              aria-label="Close"
              className="text-amber-600 hover:text-amber-800 font-bold ml-4 p-1 rounded-lg hover:bg-amber-500/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Calendar</h1>
              <p className="text-sm text-slate-500">Manage your appointments and policy expirations</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleOpenNewAppointment()}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-medium text-sm transition-all duration-200 shadow-md shadow-blue-500/20 active:scale-[0.98]"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New Appointment
            </button>
          </div>
        </div>

        {/* Legend Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-100/80 px-5 py-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-600">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500 inline-block shadow-sm"></span>
              <span>Appointments</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block shadow-sm"></span>
              <span>Policy Expirations</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-sm"></span>
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-slate-400 inline-block shadow-sm"></span>
              <span className="line-through text-slate-400">Cancelled</span>
            </div>
          </div>
          <span className="text-slate-400 italic">Click on any date to schedule an appointment</span>
        </div>

        {/* Calendar Body Container */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-6 min-h-[650px]">
          {loading ? (
            <div className="h-[600px] flex flex-col items-center justify-center space-y-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-medium text-slate-500">Loading calendar appointments and expirations...</p>
            </div>
          ) : (
            <div className="fullcalendar-wrapper">
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
                }}
                buttonText={{
                  today: 'Today',
                  month: 'Month',
                  week: 'Week',
                  day: 'Day',
                  list: 'List',
                }}
                locale="en"
                firstDay={0}
                selectable={true}
                select={handleDateSelect}
                events={events}
                eventClick={handleEventClick}
                eventTimeFormat={{
                  hour: 'numeric',
                  minute: '2-digit',
                  meridiem: 'short',
                  hour12: true,
                }}
                slotLabelFormat={{
                  hour: 'numeric',
                  minute: '2-digit',
                  meridiem: 'short',
                  hour12: true,
                }}
                height="auto"
                aspectRatio={1.6}
              />
            </div>
          )}
        </div>
      </CrmPageContainer>

      {/* ========================================================================= */}
      {/* 1. NEW / EDIT APPOINTMENT MODAL                                           */}
      {/* ========================================================================= */}
      {isNewAppointmentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-100 animate-scaleIn">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 text-lg">
                {formAppointmentId ? 'Edit Appointment' : 'New Appointment'}
              </h3>
              <button
                type="button"
                onClick={() => setIsNewAppointmentOpen(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveAppointment} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-medium">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Policy Review Meeting"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Client <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <select
                  value={formClientId}
                  onChange={(e) => setFormClientId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all"
                >
                  <option value="">-- No Client Linked --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start Date & Start Time Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <DatePicker
                    label="Start Date"
                    required
                    value={formStartDateUs}
                    onChange={(iso) => {
                      if (iso) {
                        const parts = iso.split('-');
                        setFormStartDateUs(`${parts[1]}/${parts[2]}/${parts[0]}`);
                      } else {
                        setFormStartDateUs('');
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Start Time <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <select
                      value={formStartHour}
                      onChange={(e) => setFormStartHour(e.target.value)}
                      className="bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-2 py-2.5 text-xs text-slate-900 outline-none transition-all"
                    >
                      {HOURS_12.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <select
                      value={formStartMinute}
                      onChange={(e) => setFormStartMinute(e.target.value)}
                      className="bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-2 py-2.5 text-xs text-slate-900 outline-none transition-all"
                    >
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={formStartAmPm}
                      onChange={(e) => setFormStartAmPm(e.target.value as 'AM' | 'PM')}
                      className="bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-2 py-2.5 text-xs font-semibold text-slate-900 outline-none transition-all"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* End Date & End Time Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <DatePicker
                    label="End Date"
                    required
                    value={formEndDateUs}
                    onChange={(iso) => {
                      if (iso) {
                        const parts = iso.split('-');
                        setFormEndDateUs(`${parts[1]}/${parts[2]}/${parts[0]}`);
                      } else {
                        setFormEndDateUs('');
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    End Time <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <select
                      value={formEndHour}
                      onChange={(e) => setFormEndHour(e.target.value)}
                      className="bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-2 py-2.5 text-xs text-slate-900 outline-none transition-all"
                    >
                      {HOURS_12.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <select
                      value={formEndMinute}
                      onChange={(e) => setFormEndMinute(e.target.value)}
                      className="bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-2 py-2.5 text-xs text-slate-900 outline-none transition-all"
                    >
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={formEndAmPm}
                      onChange={(e) => setFormEndAmPm(e.target.value as 'AM' | 'PM')}
                      className="bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-2 py-2.5 text-xs font-semibold text-slate-900 outline-none transition-all"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Status
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as AppointmentStatus)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Location <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="e.g. Office / Zoom / Phone"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Description / Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Add details, agenda, or internal notes..."
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all resize-none"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewAppointmentOpen(false)}
                  className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {formSaving ? 'Saving...' : formAppointmentId ? 'Update Appointment' : 'Create Appointment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. POLICY EXPIRATION DETAIL MODAL                                         */}
      {/* ========================================================================= */}
      {selectedExpiration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-100 animate-scaleIn">
            <div className="px-6 py-4 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping inline-block"></span>
                <h3 className="font-bold text-base">Policy Expiration Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExpiration(null)}
                aria-label="Close"
                className="text-white/80 hover:text-white font-bold p-1 rounded-lg hover:bg-red-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm text-slate-700">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2.5">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-xs uppercase font-semibold text-slate-500">Client</span>
                  <span className="font-semibold text-slate-900">{selectedExpiration.clientName}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-xs uppercase font-semibold text-slate-500">Policy Type</span>
                  <span className="font-semibold text-blue-600">{selectedExpiration.policyType}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-xs uppercase font-semibold text-slate-500">Policy Number</span>
                  <span className="font-mono text-slate-800">{selectedExpiration.policyNumber || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-xs uppercase font-semibold text-slate-500">Carrier / Company</span>
                  <span className="text-slate-800">{selectedExpiration.company || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs uppercase font-semibold text-slate-500">Expiration Date</span>
                  <span className="font-bold text-red-600 font-mono">
                    {selectedExpiration.expirationDate
                      ? formatIsoToUsDate(selectedExpiration.expirationDate)
                      : 'N/A'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedExpiration(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Close
                </button>

                {selectedExpiration.clientId && selectedExpiration.policyId && (
                  <Link
                    href={`/clients/${selectedExpiration.clientId}/policies/${selectedExpiration.policyId}`}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 transition-all"
                  >
                    View Policy Details
                    <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. APPOINTMENT DETAIL MODAL                                                */}
      {/* ========================================================================= */}
      {selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-slate-100 animate-scaleIn">
            <div className="px-6 py-4 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-base">Appointment Details</h3>
              <button
                type="button"
                onClick={() => setSelectedAppointment(null)}
                aria-label="Close"
                className="text-white/80 hover:text-white font-bold p-1 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm text-slate-700">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2.5">
                {selectedAppointment.clientName && (
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                    <span className="text-xs uppercase font-semibold text-slate-500">Client</span>
                    <Link
                      href={`/clients/${selectedAppointment.clientId}`}
                      className="font-semibold text-blue-600 hover:underline"
                    >
                      {selectedAppointment.clientName}
                    </Link>
                  </div>
                )}

                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-xs uppercase font-semibold text-slate-500">Status</span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      selectedAppointment.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : selectedAppointment.status === 'cancelled'
                        ? 'bg-slate-200 text-slate-600'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {selectedAppointment.status}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-xs uppercase font-semibold text-slate-500">Start Time</span>
                  <span className="font-medium text-slate-800 font-mono">
                    {formatTimestampToUsDateTime(selectedAppointment.startsAt)}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-xs uppercase font-semibold text-slate-500">End Time</span>
                  <span className="font-medium text-slate-800 font-mono">
                    {formatTimestampToUsDateTime(selectedAppointment.endsAt)}
                  </span>
                </div>

                {selectedAppointment.location && (
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                    <span className="text-xs uppercase font-semibold text-slate-500">Location</span>
                    <span className="text-slate-800">{selectedAppointment.location}</span>
                  </div>
                )}

                {selectedAppointment.description && (
                  <div className="pt-1">
                    <span className="text-xs uppercase font-semibold text-slate-500 block mb-1">Description</span>
                    <p className="text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200/80 whitespace-pre-wrap">
                      {selectedAppointment.description}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() =>
                    selectedAppointment.appointmentId &&
                    handleDeleteAppointment(selectedAppointment.appointmentId)
                  }
                  className="px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                >
                  Delete Appointment
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAppointment(null)}
                    className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditAppointment(selectedAppointment)}
                    className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 transition-all"
                  >
                    Edit Appointment
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
