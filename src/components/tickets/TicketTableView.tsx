'use client';

import React from 'react';
import type { TicketItem, TicketStatus, TicketPriority } from './types';

interface TicketTableViewProps {
  tickets: TicketItem[];
  selectedId?: string;
  onSelectTicket?: (ticket: TicketItem) => void;
}

export function getStatusBadge(status: TicketStatus) {
  switch (status) {
    case 'new':
      return <span className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">Nuevo</span>;
    case 'in_progress':
      return <span className="inline-flex items-center rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-200">En Progreso</span>;
    case 'waiting_client':
      return <span className="inline-flex items-center rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">Esp. Cliente</span>;
    case 'waiting_carrier':
      return <span className="inline-flex items-center rounded bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 border border-purple-200">Esp. Aseguradora</span>;
    case 'resolved':
      return <span className="inline-flex items-center rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">Resuelto</span>;
    case 'closed':
      return <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">Cerrado</span>;
    default:
      return <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">{status}</span>;
  }
}

export function getPriorityBadge(priority: TicketPriority) {
  switch (priority) {
    case 'urgent':
      return <span className="inline-flex items-center rounded bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200">Urgente</span>;
    case 'high':
      return <span className="inline-flex items-center rounded bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 border border-orange-200">Alta</span>;
    case 'medium':
      return <span className="inline-flex items-center rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">Media</span>;
    case 'low':
      return <span className="inline-flex items-center rounded bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">Baja</span>;
    default:
      return <span className="inline-flex items-center rounded bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">{priority}</span>;
  }
}

export default function TicketTableView({ tickets, selectedId, onSelectTicket }: TicketTableViewProps) {
  if (tickets.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
        <svg className="mx-auto h-8 w-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
        <p className="text-xs font-medium text-slate-700">No se encontraron tickets</p>
        <p className="text-[11px] text-slate-400 mt-0.5">Ajusta los filtros de búsqueda o crea una nueva solicitud.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-none">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 select-none">
          <tr>
            <th className="px-3.5 py-2.5">Código</th>
            <th className="px-3.5 py-2.5">Asunto / Descripción</th>
            <th className="px-3.5 py-2.5">Estado</th>
            <th className="px-3.5 py-2.5">Prioridad</th>
            <th className="px-3.5 py-2.5">Asignado</th>
            <th className="px-3.5 py-2.5">Vencimiento</th>
            <th className="px-3.5 py-2.5">Checklist</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tickets.map((ticket) => {
            const isSelected = selectedId === ticket.id;
            const formattedDue = ticket.dueAt
              ? (() => {
                  try {
                    const d = new Date(ticket.dueAt);
                    if (isNaN(d.getTime())) return ticket.dueAt;
                    return new Intl.DateTimeFormat('en-US', {
                      timeZone: 'America/New_York',
                      month: '2-digit',
                      day: '2-digit',
                      year: 'numeric',
                    }).format(d);
                  } catch {
                    return ticket.dueAt;
                  }
                })()
              : 'Sin fecha';

            return (
              <tr
                key={ticket.id}
                onClick={() => onSelectTicket?.(ticket)}
                className={`transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-50/70 border-l-2 border-indigo-600 font-medium'
                    : 'hover:bg-slate-50/80'
                }`}
              >
                <td className="whitespace-nowrap px-3.5 py-3 font-mono text-xs font-semibold text-indigo-600">
                  {ticket.code}
                </td>
                <td className="px-3.5 py-3 max-w-md">
                  <span className="block font-medium text-slate-900 line-clamp-1">
                    {ticket.title}
                  </span>
                  {ticket.description ? (
                    <span className="block text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                      {ticket.description}
                    </span>
                  ) : null}
                  {ticket.tags && ticket.tags.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ticket.tags.map((tag) => (
                        <span key={tag} className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3">
                  {getStatusBadge(ticket.status)}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3">
                  {getPriorityBadge(ticket.priority)}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3 text-slate-700">
                  <div className="flex items-center gap-1.5">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
                      {ticket.assignedToName.charAt(0)}
                    </div>
                    <span>{ticket.assignedToName}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3.5 py-3 text-slate-500">
                  {formattedDue}
                </td>
                <td className="whitespace-nowrap px-3.5 py-3 min-w-[100px]">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-indigo-600 rounded-full"
                        style={{
                          width: `${ticket.checklistTotal > 0 ? (ticket.checklistDone / ticket.checklistTotal) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-mono text-slate-500">
                      {ticket.checklistDone}/{ticket.checklistTotal}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
