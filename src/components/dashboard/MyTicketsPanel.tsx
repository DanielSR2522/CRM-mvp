'use client';

import React from 'react';
import Link from 'next/link';

export interface DashboardTicket {
  id: string;
  ticketCode: string;
  title: string;
  status: string;
  priority: string;
  dueAt?: string | null;
  createdAt?: string | null;
  clientName?: string | null;
  assignedToName?: string | null;
}

interface MyTicketsPanelProps {
  tickets: DashboardTicket[];
  loading?: boolean;
}

export default function MyTicketsPanel({ tickets, loading }: MyTicketsPanelProps) {
  const now = new Date();
  const todayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0];

  let openCount = 0;
  let dueTodayCount = 0;
  let overdueCount = 0;

  tickets.forEach((t) => {
    if (t.status === 'completed' || t.status === 'cancelled') return;

    const dueIso = t.dueAt ? new Date(t.dueAt).toISOString().split('T')[0] : null;
    const isOverdue = dueIso && dueIso < todayIso;
    const isDueToday = dueIso && dueIso === todayIso;

    if (isOverdue) overdueCount++;
    else if (isDueToday) dueTodayCount++;

    if (t.status === 'new' || t.status === 'pending' || t.status === 'open' || t.status === 'in_progress') {
      openCount++;
    }
  });

  const activeTickets = tickets.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  const topTickets = activeTickets.slice(0, 5);

  return (
    <div className="crm-card p-4 flex flex-col justify-between bg-white border border-[#E8ECF2] rounded-lg shadow-sm">
      <div>
        <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-[#F3E8FF] text-[#A855F7] text-xs">
              🎟️
            </span>
            <h2 className="text-xs font-semibold text-[#172033]">My Tickets</h2>
          </div>
          <Link
            href="/tickets"
            className="text-[11px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition-colors flex items-center gap-1"
          >
            <span>View All</span>
            <span>→</span>
          </Link>
        </div>

        {/* SUMMARY COUNTS ROW */}
        <div className="grid grid-cols-3 gap-2 mb-3 p-1.5 bg-[#F8FAFC] rounded-lg border border-[#F1F5F9]">
          <div className="text-center">
            <div className="text-sm font-extrabold text-[#2563EB]">{loading ? '...' : openCount}</div>
            <div className="text-[10px] font-semibold text-[#64748B]">Open</div>
          </div>
          <div className="text-center border-x border-[#E2E8F0]">
            <div className="text-sm font-extrabold text-[#D97706]">{loading ? '...' : dueTodayCount}</div>
            <div className="text-[10px] font-semibold text-[#64748B]">Due Today</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-extrabold text-[#DC2626]">{loading ? '...' : overdueCount}</div>
            <div className="text-[10px] font-semibold text-[#64748B]">Overdue</div>
          </div>
        </div>

        {/* TICKET LIST */}
        {loading ? (
          <div className="py-5 text-center text-xs text-[#7C8799]">Loading tickets...</div>
        ) : topTickets.length === 0 ? (
          <div className="py-3 px-3 bg-[#F8FAFC] rounded-lg border border-[#F1F5F9] text-center space-y-1">
            <div className="text-lg">🎟️</div>
            <p className="text-xs font-medium text-[#556176]">No pending tickets in queue.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topTickets.map((t) => {
              const dueIso = t.dueAt ? new Date(t.dueAt).toISOString().split('T')[0] : null;
              const isOverdue = dueIso && dueIso < todayIso;
              const isDueToday = dueIso && dueIso === todayIso;

              let badgeText = 'Open';
              let badgeClass = 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';

              if (isOverdue) {
                badgeText = 'Overdue';
                badgeClass = 'bg-[#FEF2F2] text-[#DC2626] border-[#FCA5A5] font-bold animate-pulse';
              } else if (isDueToday) {
                badgeText = 'Due Today';
                badgeClass = 'bg-[#FEFCE8] text-[#D97706] border-[#FDE68A] font-bold';
              } else if (t.priority === 'urgent' || t.priority === 'high') {
                badgeText = t.priority.toUpperCase();
                badgeClass = 'bg-[#EEF4FF] text-[#2563EB] border-[#BFDBFE] font-bold';
              }

              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] border border-[#F1F5F9] hover:border-[#E2E8F0] transition-all"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <span className="text-[10px] font-mono font-bold text-[#64748B] bg-[#EDF2F7] px-1.5 py-0.5 rounded">
                      {t.ticketCode}
                    </span>

                    <div className="truncate">
                      <div className="text-xs font-bold text-[#1E293B] truncate">
                        {t.title}
                      </div>
                      <div className="text-[11px] font-medium text-[#64748B] truncate">
                        {t.clientName || 'General Client'}
                      </div>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 ${badgeClass}`}>
                    {badgeText}
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
