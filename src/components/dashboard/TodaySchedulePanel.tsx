'use client';

import React from 'react';
import Link from 'next/link';

export interface DashboardAppointment {
  id: string;
  startsAt: string;
  endsAt?: string | null;
  title: string;
  clientName?: string | null;
  status: string;
  appointmentType?: string | null;
}

interface TodaySchedulePanelProps {
  appointments: DashboardAppointment[];
  loading?: boolean;
}

export default function TodaySchedulePanel({ appointments, loading }: TodaySchedulePanelProps) {
  // Sort today's appointments by start time
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );

  const formatTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
      return '—';
    }
  };

  const getInitials = (name?: string | null) => {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getAvatarColor = (idx: number) => {
    const colors = [
      'bg-[#FEE2E2] text-[#EF4444]',
      'bg-[#E0E7FF] text-[#6366F1]',
      'bg-[#D1FAE5] text-[#10B981]',
      'bg-[#FEF3C7] text-[#D97706]',
      'bg-[#F3E8FF] text-[#A855F7]',
    ];
    return colors[idx % colors.length];
  };

  return (
    <div className="crm-card p-4 flex flex-col justify-between bg-white border border-[#E8ECF2] rounded-lg shadow-sm">
      <div>
        <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-[#EEF4FF] text-[#2563EB] text-xs">
              📅
            </span>
            <h2 className="text-xs font-semibold text-[#172033]">Today's Schedule</h2>
          </div>
          <Link
            href="/calendar"
            className="text-[11px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition-colors flex items-center gap-1"
          >
            <span>View Calendar</span>
            <span>→</span>
          </Link>
        </div>

        {loading ? (
          <div className="py-5 text-center text-xs text-[#7C8799]">Loading today's schedule...</div>
        ) : sorted.length === 0 ? (
          <div className="py-3 px-3 bg-[#F8FAFC] rounded-lg border border-[#F1F5F9] text-center space-y-1">
            <div className="text-lg">📅</div>
            <p className="text-xs font-medium text-[#556176]">No appointments scheduled for today.</p>
            <Link href="/calendar" className="inline-block text-[11px] font-semibold text-[#2563EB] hover:underline pt-0.5">
              + Add Appointment
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((item, idx) => {
              const timeStr = formatTime(item.startsAt);
              const initials = getInitials(item.clientName);
              const avatarClass = getAvatarColor(idx);

              // Calculate relative status badge
              const nowMs = Date.now();
              const startMs = new Date(item.startsAt).getTime();
              const diffMinutes = Math.round((startMs - nowMs) / (1000 * 60));

              let statusBadgeText = 'Upcoming';
              let statusBadgeClass = 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';

              if (item.status === 'completed') {
                statusBadgeText = 'Completed';
                statusBadgeClass = 'bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]';
              } else if (item.status === 'cancelled') {
                statusBadgeText = 'Cancelled';
                statusBadgeClass = 'bg-[#FEE2E2] text-[#B91C1C] border-[#FCA5A5]';
              } else if (diffMinutes > 0 && diffMinutes <= 30) {
                statusBadgeText = `In ${diffMinutes} min`;
                statusBadgeClass = 'bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0] font-bold animate-pulse';
              } else if (diffMinutes <= 0 && diffMinutes >= -60) {
                statusBadgeText = 'In Progress';
                statusBadgeClass = 'bg-[#DBEAFE] text-[#1E40AF] border-[#93C5FD] font-bold';
              }

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] border border-[#F1F5F9] hover:border-[#E2E8F0] transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-bold text-[#E11D48] min-w-[60px]">
                      {timeStr}
                    </span>

                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${avatarClass}`}>
                      {initials}
                    </div>

                    <div>
                      <div className="text-xs font-bold text-[#1E293B]">
                        {item.clientName || 'General Meeting'}
                      </div>
                      <div className="text-[11px] font-medium text-[#64748B]">
                        {item.title}
                      </div>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusBadgeClass}`}>
                    {statusBadgeText}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
