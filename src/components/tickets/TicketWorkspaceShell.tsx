'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { TicketItem, TicketPriority, LanzaUser, TicketsApiResponse } from './types';
import TicketTableView, { getStatusBadge, getPriorityBadge } from './TicketTableView';
import TicketFiltersBar from './TicketFiltersBar';
import TicketFormModal from './TicketFormModal';
import TicketDetailWorkspace from './TicketDetailWorkspace';

import { useSearchParams, useRouter } from 'next/navigation';

type NavView = 'panel' | 'all_tickets' | 'my_tickets';

export default function TicketWorkspaceShell() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const targetTicketId = searchParams.get('id') || searchParams.get('ticketId');

  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [appUsers, setAppUsers] = useState<LanzaUser[]>([]);
  const [mappedAppUser, setMappedAppUser] = useState<{ id: string; name: string; email: string; role: string } | null>(null);
  const [isMapped, setIsMapped] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<NavView>('all_tickets');
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_desc');

  // Load real tickets from server-to-server integration
  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/tickets', { cache: 'no-store' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setIsMapped(false);
        setFetchError(errData.error || `HTTP ${res.status}`);
        return;
      }

      const data: TicketsApiResponse = await res.json();

      if (!data.success) {
        setIsMapped(false);
        setFetchError(data.error || 'Error al obtener tickets.');
        return;
      }

      setIsMapped(data.mapped);
      setMappedAppUser(data.appUser || null);
      setTickets(data.tickets || []);
      setAppUsers(data.appUsers || []);
    } catch (err: any) {
      setIsMapped(false);
      setFetchError('Error de red al conectar con el servidor de integración.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Handle URL query parameter for ticket ID navigation
  useEffect(() => {
    if (targetTicketId) {
      const match = tickets.find((t) => t.id === targetTicketId);
      if (match) {
        setSelectedTicket(match);
      } else {
        fetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get', ticketId: targetTicketId }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.ticket) {
              setSelectedTicket(data.ticket);
            }
          })
          .catch(() => {});
      }
    }
  }, [targetTicketId, tickets]);

  // Handle new ticket creation via server API
  // Handle ticket context validation pass (Requirement 5 & 15: do NOT persist ticket to DB yet)
  const handleCreateTicket = async (newTicketData: {
    title: string;
    description?: string;
    priority: TicketPriority;
    status: any;
    assignedTo?: string | null;
    dueAt?: string | null;
    tags: string[];
    clientId?: string | null;
    policyId?: string | null;
    policySource?: any;
  }) => {
    if (!newTicketData.title || newTicketData.title.trim().length < 3) {
      throw new Error('El título del ticket debe tener al menos 3 caracteres.');
    }
    if (!newTicketData.clientId) {
      throw new Error('Debe seleccionar un cliente para crear el ticket.');
    }

    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTicketData),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Error al crear el ticket.');
    }

    // Immediately re-fetch real ticket list
    await fetchTickets();
  };

  // Stats calculation
  const stats = useMemo(() => {
    const total = tickets.length;
    const inProgress = tickets.filter((t) => t.status === 'in_progress' || t.status === 'new').length;
    const waiting = tickets.filter((t) => t.status === 'waiting_client' || t.status === 'waiting_carrier').length;
    const resolved = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;
    const urgent = tickets.filter((t) => t.priority === 'urgent').length;
    return { total, inProgress, waiting, resolved, urgent };
  }, [tickets]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets
      .filter((ticket) => {
        // Internal rail view condition for 'my_tickets'
        if (activeView === 'my_tickets' && mappedAppUser && ticket.assignedToId !== mappedAppUser.id) {
          return false;
        }

        // Search query
        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase();
          const matchCode = ticket.code.toLowerCase().includes(q);
          const matchTitle = ticket.title.toLowerCase().includes(q);
          const matchDesc = ticket.description?.toLowerCase().includes(q) ?? false;
          const matchTag = ticket.tags.some((tag) => tag.toLowerCase().includes(q));
          if (!matchCode && !matchTitle && !matchDesc && !matchTag) {
            return false;
          }
        }

        // Status filter
        if (statusFilter !== 'all' && ticket.status !== statusFilter) {
          return false;
        }

        // Priority filter
        if (priorityFilter !== 'all' && ticket.priority !== priorityFilter) {
          return false;
        }

        // Assignee filter
        if (assigneeFilter !== 'all' && ticket.assignedToId !== assigneeFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'created_desc') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (sortBy === 'created_asc') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        if (sortBy === 'priority_desc') {
          const priorityWeight: Record<TicketPriority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
          return priorityWeight[b.priority] - priorityWeight[a.priority];
        }
        if (sortBy === 'due_asc') {
          if (!a.dueAt) return 1;
          if (!b.dueAt) return -1;
          return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        }
        return 0;
      });
  }, [tickets, activeView, mappedAppUser, searchQuery, statusFilter, priorityFilter, assigneeFilter, sortBy]);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setAssigneeFilter('all');
    setSortBy('created_desc');
  };

  const myAssignedCount = useMemo(() => {
    if (!mappedAppUser) return 0;
    return tickets.filter((t) => t.assignedToId === mappedAppUser.id).length;
  }, [tickets, mappedAppUser]);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] w-full rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      {/* ------------------------------------------------------------- */}
      {/* INTERNAL COMPACT RAIL (Secondary Sidebar for Ticket Workspace) */}
      {/* ------------------------------------------------------------- */}
      <aside className="w-52 flex-shrink-0 border-r border-slate-200 bg-slate-50/60 p-3.5 flex flex-col justify-between select-none">
        <div>
          {/* Action Button: + Nuevo ticket */}
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={isLoading || fetchError !== null}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Nuevo Ticket
          </button>

          {/* Internal Rail Navigation Items */}
          <div className="mt-5 space-y-1">
            <span className="block px-2 text-xs font-semibold text-slate-500">
              Vistas
            </span>

            <button
              onClick={() => setActiveView('panel')}
              className={`w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activeView === 'panel'
                  ? 'bg-indigo-50 font-semibold text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                <span>Panel / Resumen</span>
              </div>
            </button>

            <button
              onClick={() => setActiveView('all_tickets')}
              className={`w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activeView === 'all_tickets'
                  ? 'bg-indigo-50 font-semibold text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                </svg>
                <span>Todos los Tickets</span>
              </div>
              {!isLoading && !fetchError && (
                <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                  {tickets.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveView('my_tickets')}
              className={`w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                activeView === 'my_tickets'
                  ? 'bg-indigo-50 font-semibold text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>Mis Asignados</span>
              </div>
              {!isLoading && !fetchError && (
                <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                  {myAssignedCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------- */}
      {/* MAIN TICKET WORKSPACE CONTENT AREA                             */}
      {/* ------------------------------------------------------------- */}
      <main className="flex-1 p-5 overflow-y-auto bg-white">
        {/* Workspace Title Bar */}
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              {activeView === 'panel'
                ? 'Panel de Control de Tickets'
                : activeView === 'my_tickets'
                ? 'Mis Tickets Asignados'
                : 'Tickets & Operaciones'}
            </h1>
            <p className="text-xs text-slate-500">
              Módulo integrado de seguimiento de solicitudes, servicio post-venta y renovación.
            </p>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-slate-500 text-xs">
            <svg className="h-5 w-5 animate-spin text-indigo-600 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Cargando tickets...</span>
          </div>
        )}

        {/* Error State (e.g. inactive user or network error) */}
        {!isLoading && fetchError && (
          <div className="rounded-xl border border-red-200 bg-red-50/40 p-8 text-center max-w-lg mx-auto my-10 shadow-xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-3">
              <svg className="h-6 w-6 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-red-900">Acceso a Tickets</h3>
            <p className="mt-1 text-xs text-red-700 leading-relaxed">
              {fetchError}
            </p>
          </div>
        )}

        {/* Workspace Content */}
        {!isLoading && !fetchError && (
          <>
            {selectedTicket ? (
              <TicketDetailWorkspace
                ticketId={selectedTicket.id}
                onBack={() => {
                  setSelectedTicket(null);
                  const fromClient = searchParams.get('fromClient');
                  if (fromClient) {
                    router.push(`/clients/${fromClient}?section=tickets`);
                  } else if (targetTicketId) {
                    router.push('/tickets');
                  }
                }}
                onTicketUpdated={fetchTickets}
                appUsers={appUsers}
                currentUser={mappedAppUser}
              />
            ) : (
              <>
                {/* Panel View Mode: Metrics Cards */}
                {activeView === 'panel' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-4 gap-4">
                      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                        <span className="text-xs font-medium text-slate-500">Total Tickets</span>
                        <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</p>
                      </div>

                      <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-4">
                        <span className="text-xs font-medium text-indigo-600">En Progreso</span>
                        <p className="mt-1 text-2xl font-bold text-indigo-700">{stats.inProgress}</p>
                      </div>

                      <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-4">
                        <span className="text-xs font-medium text-amber-600">Esperando Respuesta</span>
                        <p className="mt-1 text-2xl font-bold text-amber-700">{stats.waiting}</p>
                      </div>

                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4">
                        <span className="text-xs font-medium text-emerald-600">Resueltos / Cerrados</span>
                        <p className="mt-1 text-2xl font-bold text-emerald-700">{stats.resolved}</p>
                      </div>
                    </div>

                    {/* Quick Preview Table in Panel View */}
                    <div>
                      <h2 className="mb-2 text-sm font-semibold text-slate-800">Últimos Tickets Creados</h2>
                      <TicketTableView
                        tickets={tickets.slice(0, 5)}
                        selectedId={undefined}
                        onSelectTicket={(ticket) => setSelectedTicket(ticket)}
                      />
                    </div>
                  </div>
                )}

                {/* All Tickets & My Tickets View Modes */}
                {(activeView === 'all_tickets' || activeView === 'my_tickets') && (
                  <div>
                    <TicketFiltersBar
                      searchQuery={searchQuery}
                      onSearchChange={setSearchQuery}
                      statusFilter={statusFilter}
                      onStatusFilterChange={setStatusFilter}
                      priorityFilter={priorityFilter}
                      onPriorityFilterChange={setPriorityFilter}
                      assigneeFilter={assigneeFilter}
                      onAssigneeFilterChange={setAssigneeFilter}
                      sortBy={sortBy}
                      onSortByChange={setSortBy}
                      onClearFilters={clearFilters}
                      appUsers={appUsers}
                    />

                    <TicketTableView
                      tickets={filteredTickets}
                      selectedId={undefined}
                      onSelectTicket={(ticket) => setSelectedTicket(ticket)}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Form Modal */}
      <TicketFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreateTicket={handleCreateTicket}
        appUsers={appUsers}
      />
    </div>
  );
}
