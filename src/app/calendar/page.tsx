'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import type {
  ExtendedCalendarEventProps,
  AppointmentStatus,
} from '@/lib/calendar/types';
import {
  formatIsoToUsDate,
  usDateToIso,
  parseUsDateAnd12hTimeToDate,
  extractUsDateAnd12hTime,
} from '@/utils/dateUtils';
import DateTimePicker from '@/components/ui/DateTimePicker';
import DatePicker from '@/components/ui/DatePicker';

interface ClientOption {
  id: string;
  full_name: string;
}

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
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appointmentError, setAppointmentError] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Dynamic FullCalendar Requested Visible Range
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date }>({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
  });

  // Events & Client List
  const [events, setEvents] = useState<any[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);

  // Modal States
  const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false);
  const [selectedExpiration, setSelectedExpiration] = useState<ExtendedCalendarEventProps | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);

  // Recurrence Edit & Delete Choice Dialog States
  const [showRecurrenceEditDialog, setShowRecurrenceEditDialog] = useState(false);
  const [showRecurrenceDeleteDialog, setShowRecurrenceDeleteDialog] = useState(false);

  // Form State
  const [formAppointmentId, setFormAppointmentId] = useState<string | null>(null);
  const [formSeriesId, setFormSeriesId] = useState<string | null>(null);
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

  // Recurrence Form Fields
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formFrequency, setFormFrequency] = useState<'weekly' | 'monthly' | 'yearly'>('weekly');
  const [formIntervalCount, setFormIntervalCount] = useState(1);
  const [formEndType, setFormEndType] = useState<'never' | 'on_date' | 'after_count'>('never');
  const [formEndsOnDateUs, setFormEndsOnDateUs] = useState<string | null>(null);
  const [formOccurrenceCount, setFormOccurrenceCount] = useState<number>(12);

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
        setLoading(false);
        return;
      }
      setCurrentUser(user);

      // Fetch Clients
      const clientMap = new Map<string, any>();
      try {
        const { data: clientsData, error: clientsErr } = await supabase
          .from('clients')
          .select('id, full_name, email, phone')
          .eq('agent_id', user.id)
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
      let fetchedRecurringSeries: any[] = [];
      const exceptionMap = new Map<string, boolean>();

      // 1. Policy Expirations
      try {
        const { data: policiesData, error: policiesErr } = await supabase
          .from('policies')
          .select('id, client_id, policy_number, policy_type, company_name, writing_company, expiration_date')
          .not('expiration_date', 'is', null);

        if (!policiesErr && policiesData) {
          fetchedExpirations = policiesData
            .filter((pol: any) => Boolean(pol.expiration_date))
            .map((pol: any) => {
              const client = clientMap.get(pol.client_id);
              const clientName = client?.full_name || 'Client';
              const company = pol.company_name || pol.writing_company || 'N/A';
              const cleanExpDate = String(pol.expiration_date).split('T')[0];

              return {
                id: `expiration-${pol.id}`,
                title: `Expires: ${clientName} — ${pol.policy_type}`,
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
        }
      } catch (err: any) {
        setPolicyError('Could not load policy expirations: ' + (err?.message || 'Database query failed.'));
      }

      // 2. Calendar Appointments (Includes Exceptions)
      try {
        const { data: apptData, error: apptErr } = await supabase
          .from('calendar_appointments')
          .select('*, client:clients(id, full_name, email, phone)')
          .eq('agent_id', user.id)
          .order('starts_at', { ascending: true });

        if (!apptErr && apptData) {
          fetchedAppointments = apptData.map((appt: any) => {
            const clientName = appt.client?.full_name || clientMap.get(appt.client_id)?.full_name || null;
            const isCancelled = appt.status === 'cancelled';
            const isCompleted = appt.status === 'completed';

            if (appt.recurrence_series_id && appt.recurrence_original_start) {
              const excKey = `${appt.recurrence_series_id}_${appt.recurrence_original_start.split('T')[0]}`;
              exceptionMap.set(excKey, true);
            }

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
                seriesId: appt.recurrence_series_id || null,
                clientId: appt.client_id,
                clientName,
                description: appt.description,
                location: appt.location,
                startsAt: appt.starts_at,
                endsAt: appt.ends_at,
                status: appt.status,
                isException: appt.is_recurrence_exception || false,
              },
            };
          });
        }
      } catch (err: any) {
        setAppointmentError('Could not load appointments: ' + (err?.message || 'Database query failed.'));
      }

      // 3. Calendar Recurrence Series (Expanded dynamically for requested FullCalendar Range with 7d buffer)
      try {
        const { data: seriesData } = await supabase
          .from('calendar_recurrence_series')
          .select('*')
          .eq('agent_id', user.id);

        if (seriesData && seriesData.length > 0) {
          // Range buffer: -7 days before visible start, +7 days after visible end
          const rangeStartBuffer = new Date(visibleRange.start.getTime() - 7 * 24 * 60 * 60 * 1000);
          const rangeEndBuffer = new Date(visibleRange.end.getTime() + 7 * 24 * 60 * 60 * 1000);

          seriesData.forEach((series: any) => {
            const clientName = clientMap.get(series.client_id)?.full_name || null;
            const [sYear, sMonth, sDay] = series.start_date.split('-').map(Number);
            const [sHour, sMin] = (series.start_time || '09:00:00').split(':').map(Number);

            let currDate = new Date(sYear, sMonth - 1, sDay, sHour, sMin, 0);
            let count = 0;
            const maxOccurrences = series.end_type === 'after_count' ? (series.occurrence_count || 12) : 500;

            while (currDate <= rangeEndBuffer && count < maxOccurrences) {
              count++;
              const dateIsoStr = currDate.toISOString();
              const dateOnlyStr = dateIsoStr.split('T')[0];
              const endDate = new Date(currDate.getTime() + (series.duration_minutes || 60) * 60 * 1000);

              // Check if end_type is on_date
              if (series.end_type === 'on_date' && series.ends_on) {
                const endsOn = new Date(series.ends_on + 'T23:59:59');
                if (currDate > endsOn) break;
              }

              // Include occurrence if within requested range AND not suppressed by an exception row
              const excKey = `${series.id}_${dateOnlyStr}`;
              if (currDate >= rangeStartBuffer && !exceptionMap.has(excKey)) {
                fetchedRecurringSeries.push({
                  id: `series-${series.id}-${dateOnlyStr}`,
                  title: clientName ? `🔄 ${series.title} (${clientName})` : `🔄 ${series.title}`,
                  start: dateIsoStr,
                  end: endDate.toISOString(),
                  allDay: false,
                  backgroundColor: '#8b5cf6',
                  borderColor: '#7c3aed',
                  textColor: '#ffffff',
                  extendedProps: {
                    eventType: 'appointment',
                    seriesId: series.id,
                    isRecurringSeries: true,
                    originalStart: dateIsoStr,
                    clientId: series.client_id,
                    clientName,
                    title: series.title,
                    description: series.description,
                    location: series.location,
                    startsAt: dateIsoStr,
                    endsAt: endDate.toISOString(),
                    status: series.status,
                    frequency: series.frequency,
                  },
                });
              }

              // Increment step based on frequency
              if (series.frequency === 'weekly') {
                currDate = new Date(currDate.setDate(currDate.getDate() + 7 * (series.interval_count || 1)));
              } else if (series.frequency === 'monthly') {
                // Short-month clamping anchored to original sDay (e.g. Jan 31 -> Feb 28/29 -> Mar 31)
                const targetMonth = currDate.getMonth() + (series.interval_count || 1);
                const targetYear = currDate.getFullYear() + Math.floor(targetMonth / 12);
                const normMonth = targetMonth % 12;
                const lastDayOfTargetMonth = new Date(targetYear, normMonth + 1, 0).getDate();
                const clampedDay = Math.min(sDay, lastDayOfTargetMonth);
                currDate = new Date(targetYear, normMonth, clampedDay, sHour, sMin, 0);
              } else if (series.frequency === 'yearly') {
                currDate = new Date(currDate.setFullYear(currDate.getFullYear() + (series.interval_count || 1)));
              } else {
                break;
              }
            }
          });
        }
      } catch (_) {
        // Soft fallback
      }

      setEvents([...fetchedExpirations, ...fetchedAppointments, ...fetchedRecurringSeries]);
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize calendar.');
    } finally {
      setLoading(false);
    }
  }, [visibleRange, router]);

  useEffect(() => {
    loadCalendarData();
  }, [loadCalendarData]);

  // Open New Appointment Modal
  const handleOpenNewAppointment = (defaultStart?: Date) => {
    setFormError(null);
    setFormAppointmentId(null);
    setFormSeriesId(null);
    setFormTitle('');
    setFormClientId('');
    setFormLocation('');
    setFormDescription('');
    setFormStatus('scheduled');

    setFormIsRecurring(false);
    setFormFrequency('weekly');
    setFormIntervalCount(1);
    setFormEndType('never');
    setFormEndsOnDateUs(null);
    setFormOccurrenceCount(12);

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

  // Duplicate Event Action
  const handleDuplicateAppointment = (props: any) => {
    setSelectedAppointment(null);
    handleOpenNewAppointment();

    setFormTitle(`${props.title || props.clientName || 'Appointment'} (Copy)`);
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
  };

  // Save Appointment Form
  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formTitle.trim()) {
      setFormError('Title is required.');
      return;
    }

    const startDate = parseUsDateAnd12hTimeToDate(
      formStartDateUs,
      formStartHour,
      formStartMinute,
      formStartAmPm
    );

    if (!startDate) {
      setFormError('Start Date is invalid. Please enter a valid MM/DD/YYYY date.');
      return;
    }

    const endDate = parseUsDateAnd12hTimeToDate(
      formEndDateUs,
      formEndHour,
      formEndMinute,
      formEndAmPm
    );

    if (!endDate) {
      setFormError('End Date is invalid. Please enter a valid MM/DD/YYYY date.');
      return;
    }

    if (endDate <= startDate) {
      setFormError('End date and time must be later than start date and time.');
      return;
    }

    setFormSaving(true);
    try {
      if (formIsRecurring) {
        const durationMinutes = Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
        const isoStartDate = usDateToIso(formStartDateUs) || startDate.toISOString().split('T')[0];
        const timeStr = `${formStartHour}:${formStartMinute}:00`;

        const seriesPayload = {
          agent_id: currentUser.id,
          client_id: formClientId.trim() ? formClientId : null,
          title: formTitle.trim(),
          description: formDescription.trim() || null,
          location: formLocation.trim() || null,
          status: formStatus,
          start_date: isoStartDate,
          start_time: timeStr,
          duration_minutes: durationMinutes,
          frequency: formFrequency,
          interval_count: formIntervalCount,
          day_of_month: startDate.getDate(),
          end_type: formEndType,
          ends_on: formEndsOnDateUs ? usDateToIso(formEndsOnDateUs) : null,
          occurrence_count: formOccurrenceCount,
        };

        const { error: seriesErr } = await supabase
          .from('calendar_recurrence_series')
          .insert(seriesPayload);

        if (seriesErr) throw seriesErr;
        flashNotice('Recurring appointment series created successfully.');
      } else {
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
            .update({ ...payload, updated_at: new Date().toISOString() })
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

  // Delete Single Occurrence vs Series
  const handleDeleteAppointment = async (appointmentId: string) => {
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
      setError(err?.message || 'Failed to delete appointment.');
    }
  };

  const handleDeleteSeries = async (seriesId: string) => {
    try {
      const { error: delErr } = await supabase
        .from('calendar_recurrence_series')
        .delete()
        .eq('id', seriesId)
        .eq('agent_id', currentUser.id);

      if (delErr) throw delErr;

      setSelectedAppointment(null);
      setShowRecurrenceDeleteDialog(false);
      flashNotice('Entire recurring series deleted successfully.');
      await loadCalendarData();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete recurring series.');
    }
  };

  const handleEventClick = (info: any) => {
    const props = info.event.extendedProps;
    if (props.eventType === 'policy_expiration') {
      setSelectedExpiration(props as ExtendedCalendarEventProps);
    } else {
      setSelectedAppointment(props);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Notice & Error Banners */}
        {notice && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium text-sm flex items-center justify-between shadow-sm">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="font-bold text-emerald-600">✕</button>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-medium text-sm flex items-center justify-between shadow-sm">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-bold text-rose-600">✕</button>
          </div>
        )}

        {/* Calendar Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Calendar & Schedule</h1>
            <p className="text-xs text-slate-500 font-medium mt-1">Manage appointments, client meetings, and policy expirations</p>
          </div>
          <button
            onClick={() => handleOpenNewAppointment()}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-sm flex items-center gap-2"
          >
            <span>+</span> New Appointment
          </button>
        </div>

        {/* FullCalendar Mounting Area */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-xs font-semibold text-slate-400">Loading schedule...</div>
          ) : (
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              locale={esLocale}
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth',
              }}
              events={events}
              eventClick={handleEventClick}
              selectable={true}
              select={(sel) => handleOpenNewAppointment(sel.start)}
              datesSet={(dateInfo) => {
                setVisibleRange({ start: dateInfo.start, end: dateInfo.end });
              }}
              height="auto"
            />
          )}
        </div>

        {/* NEW / EDIT APPOINTMENT MODAL */}
        {isNewAppointmentOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-extrabold text-slate-900">
                  {formAppointmentId ? 'Edit Appointment' : 'New Appointment / Reminder'}
                </h3>
                <button onClick={() => setIsNewAppointmentOpen(false)} className="text-slate-400 font-bold">✕</button>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">{formError}</div>
              )}

              <form onSubmit={handleSaveAppointment} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">Title *</label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Annual Policy Review Meeting"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-900 font-medium focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">Linked Client (Optional)</label>
                    <select
                      value={formClientId}
                      onChange={(e) => setFormClientId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-900 font-medium"
                    >
                      <option value="">None / Independent</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.full_name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">Status</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as AppointmentStatus)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-900 font-medium"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                {/* START & END DATE-TIME PICKERS */}
                <DateTimePicker
                  label="Start Date & Time"
                  required
                  dateValue={formStartDateUs}
                  hourValue={formStartHour}
                  minuteValue={formStartMinute}
                  ampmValue={formStartAmPm}
                  onChangeDate={(d) => setFormStartDateUs(d || '')}
                  onChangeHour={setFormStartHour}
                  onChangeMinute={setFormStartMinute}
                  onChangeAmPm={setFormStartAmPm}
                />

                <DateTimePicker
                  label="End Date & Time"
                  required
                  dateValue={formEndDateUs}
                  hourValue={formEndHour}
                  minuteValue={formEndMinute}
                  ampmValue={formEndAmPm}
                  onChangeDate={(d) => setFormEndDateUs(d || '')}
                  onChangeHour={setFormEndHour}
                  onChangeMinute={setFormEndMinute}
                  onChangeAmPm={setFormEndAmPm}
                />

                {/* RECURRENCE CONTROLS */}
                {!formAppointmentId && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                      <input
                        type="checkbox"
                        checked={formIsRecurring}
                        onChange={(e) => setFormIsRecurring(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Repeat this appointment (Recurrence Series)</span>
                    </label>

                    {formIsRecurring && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="block font-bold text-slate-600 mb-1">Frequency</label>
                          <select
                            value={formFrequency}
                            onChange={(e) => setFormFrequency(e.target.value as any)}
                            className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                          >
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Yearly</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-600 mb-1">End Option</label>
                          <select
                            value={formEndType}
                            onChange={(e) => setFormEndType(e.target.value as any)}
                            className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                          >
                            <option value="never">Never</option>
                            <option value="on_date">On Specific Date</option>
                            <option value="after_count">After N Occurrences</option>
                          </select>
                        </div>

                        {formEndType === 'on_date' && (
                          <div className="sm:col-span-2">
                            <DatePicker
                              label="Recurrence End Date"
                              value={formEndsOnDateUs}
                              onChange={setFormEndsOnDateUs}
                            />
                          </div>
                        )}

                        {formEndType === 'after_count' && (
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">Occurrences Count</label>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={formOccurrenceCount}
                              onChange={(e) => setFormOccurrenceCount(Number(e.target.value))}
                              className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">Location (Optional)</label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="e.g. Office / Zoom Call"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">Description (Optional)</label>
                  <textarea
                    rows={2}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Add meeting notes or agenda..."
                    className="w-full p-3 rounded-xl border border-slate-200 text-slate-900"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsNewAppointmentOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formSaving}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-sm"
                  >
                    {formSaving ? 'Saving...' : 'Save Appointment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* APPOINTMENT DETAILS MODAL */}
        {selectedAppointment && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900">Appointment Details</h3>
                  {selectedAppointment.seriesId && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                      🔄 Recurring
                    </span>
                  )}
                </div>
                <button onClick={() => setSelectedAppointment(null)} className="text-slate-400 font-bold">✕</button>
              </div>

              <div className="space-y-3 text-xs text-slate-700">
                <div>
                  <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">Title</span>
                  <span className="font-extrabold text-slate-900 text-sm">{selectedAppointment.title}</span>
                </div>
                {selectedAppointment.clientName && (
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">Client</span>
                    <span className="font-bold text-blue-600">{selectedAppointment.clientName}</span>
                  </div>
                )}
                <div>
                  <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">Time</span>
                  <span className="font-medium">{formatTimestampToUsDateTime(selectedAppointment.startsAt)}</span>
                </div>
                {selectedAppointment.location && (
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">Location</span>
                    <span className="font-medium">{selectedAppointment.location}</span>
                  </div>
                )}
                {selectedAppointment.description && (
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">Description</span>
                    <p className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-medium">{selectedAppointment.description}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleDuplicateAppointment(selectedAppointment)}
                  className="px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold border border-purple-200 transition-colors"
                >
                  Duplicate Event
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedAppointment.seriesId) {
                        setShowRecurrenceDeleteDialog(true);
                      } else {
                        handleDeleteAppointment(selectedAppointment.appointmentId);
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 transition-colors"
                  >
                    Delete
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const sel = selectedAppointment;
                      setSelectedAppointment(null);
                      handleOpenNewAppointment();
                      setFormAppointmentId(sel.appointmentId || null);
                      setFormTitle(sel.title || '');
                      setFormClientId(sel.clientId || '');
                      setFormLocation(sel.location || '');
                      setFormDescription(sel.description || '');
                      setFormStatus(sel.status || 'scheduled');
                    }}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-sm"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RECURRENCE DELETE CHOICE DIALOG */}
        {showRecurrenceDeleteDialog && selectedAppointment && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
              <h3 className="text-base font-extrabold text-slate-900">Delete Recurring Event</h3>
              <p className="text-xs text-slate-600">This event is part of a recurring series. What would you like to delete?</p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    handleDeleteAppointment(selectedAppointment.appointmentId || selectedAppointment.seriesId);
                    setShowRecurrenceDeleteDialog(false);
                  }}
                  className="w-full py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-800 font-bold text-xs text-left px-4"
                >
                  Delete this event only
                </button>
                <button
                  onClick={() => handleDeleteSeries(selectedAppointment.seriesId)}
                  className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs text-left px-4"
                >
                  Delete entire series
                </button>
              </div>
              <div className="pt-2 text-right">
                <button onClick={() => setShowRecurrenceDeleteDialog(false)} className="text-xs font-bold text-slate-500 hover:underline">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* POLICY EXPIRATION DETAILS MODAL (READ-ONLY) */}
        {selectedExpiration && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-extrabold text-slate-900">Policy Expiration (Read-Only)</h3>
                <button onClick={() => setSelectedExpiration(null)} className="text-slate-400 font-bold">✕</button>
              </div>
              <div className="space-y-2 text-xs text-slate-700">
                <div><span className="font-bold text-slate-400 block text-[10px]">Client</span><span className="font-extrabold text-slate-900">{selectedExpiration.clientName}</span></div>
                <div><span className="font-bold text-slate-400 block text-[10px]">Policy Type</span><span className="font-bold text-blue-600">{selectedExpiration.policyType}</span></div>
                <div><span className="font-bold text-slate-400 block text-[10px]">Expiration Date</span><span className="font-bold text-rose-600">{formatIsoToUsDate(selectedExpiration.expirationDate)}</span></div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <Link href={`/clients/${selectedExpiration.clientId}`} className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs">View Client</Link>
              </div>
            </div>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
