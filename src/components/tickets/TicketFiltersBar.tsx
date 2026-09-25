'use client';

import React from 'react';
import type { LanzaUser } from './types';

interface TicketFiltersBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  priorityFilter: string;
  onPriorityFilterChange: (value: string) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (value: string) => void;
  sortBy: string;
  onSortByChange: (value: string) => void;
  onClearFilters: () => void;
  appUsers: LanzaUser[];
}

export default function TicketFiltersBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  sortBy,
  onSortByChange,
  onClearFilters,
  appUsers,
}: TicketFiltersBarProps) {
  const hasActiveFilters =
    searchQuery !== '' ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    assigneeFilter !== 'all' ||
    sortBy !== 'created_desc';

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-none">
      {/* Search Input & Dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search Input */}
        <div className="relative min-w-[220px]">
          <svg
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por código, título, etiqueta..."
            className="w-full rounded-md border border-slate-200 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
        >
          <option value="all">Estado: Todos</option>
          <option value="new">Nuevo</option>
          <option value="in_progress">En Progreso</option>
          <option value="waiting_client">Esp. Cliente</option>
          <option value="waiting_carrier">Esp. Aseguradora</option>
          <option value="resolved">Resuelto</option>
          <option value="closed">Cerrado</option>
        </select>

        {/* Priority Filter */}
        <select
          value={priorityFilter}
          onChange={(e) => onPriorityFilterChange(e.target.value)}
          className="rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
        >
          <option value="all">Prioridad: Todas</option>
          <option value="urgent">Urgente</option>
          <option value="high">Alta</option>
          <option value="medium">Media</option>
          <option value="low">Baja</option>
        </select>

        {/* Assignee Filter */}
        <select
          value={assigneeFilter}
          onChange={(e) => onAssigneeFilterChange(e.target.value)}
          className="rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
        >
          <option value="all">Asignado: Todos</option>
          {appUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </div>

      {/* Sorting & Clear Controls */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 select-none">Orden:</span>
        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value)}
          className="rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
        >
          <option value="created_desc">Más Recientes</option>
          <option value="created_asc">Más Antiguos</option>
          <option value="priority_desc">Mayor Prioridad</option>
          <option value="due_asc">Vencimiento Próximo</option>
        </select>

        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            Limpiar Filtros
          </button>
        )}
      </div>
    </div>
  );
}
