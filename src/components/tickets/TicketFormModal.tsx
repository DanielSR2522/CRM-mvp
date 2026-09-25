'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type {
  TicketPriority,
  TicketStatus,
  LanzaUser,
  WinterfellClientOption,
  WinterfellPolicyOption,
  PolicySource,
} from './types';

interface TicketFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTicket: (ticket: {
    title: string;
    description?: string;
    priority: TicketPriority;
    status: TicketStatus;
    assignedTo?: string | null;
    dueAt?: string | null;
    tags: string[];
    clientId?: string | null;
    policyId?: string | null;
    policySource?: PolicySource | null;
  }) => Promise<void>;
  appUsers: LanzaUser[];
  initialClientId?: string | null;
  initialClientName?: string | null;
  initialPolicyId?: string | null;
  initialPolicySource?: PolicySource | null;
  isClientLocked?: boolean;
}

function parseMMDDYYYYtoYYYYMMDD(displayVal: string): { internalVal: string | null; isValid: boolean } {
  if (!displayVal || !displayVal.trim()) return { internalVal: null, isValid: true };
  const cleaned = displayVal.replace(/\D/g, '');
  if (cleaned.length !== 8) return { internalVal: null, isValid: false };

  const month = parseInt(cleaned.slice(0, 2), 10);
  const day = parseInt(cleaned.slice(2, 4), 10);
  const year = parseInt(cleaned.slice(4, 8), 10);

  if (month < 1 || month > 12) return { internalVal: null, isValid: false };
  if (day < 1 || day > 31) return { internalVal: null, isValid: false };
  if (year < 1900 || year > 2100) return { internalVal: null, isValid: false };

  const dateObj = new Date(year, month - 1, day);
  if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) {
    return { internalVal: null, isValid: false };
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return { internalVal: `${year}-${mm}-${dd}`, isValid: true };
}

function formatRawInputToMMDDYYYY(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function TicketFormModal({
  isOpen,
  onClose,
  onCreateTicket,
  appUsers,
  initialClientId,
  initialClientName,
  initialPolicyId,
  initialPolicySource,
  isClientLocked = false,
}: TicketFormModalProps) {
  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [status, setStatus] = useState<TicketStatus>('new');
  const [assignedToId, setAssignedToId] = useState('');
  const [dueDateInput, setDueDateInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // Context Selection State (Client & Policy)
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [clientsList, setClientsList] = useState<WinterfellClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<WinterfellClientOption | null>(null);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isSearchingClients, setIsSearchingClients] = useState(false);

  const [policiesList, setPoliciesList] = useState<WinterfellPolicyOption[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [selectedPolicySource, setSelectedPolicySource] = useState<PolicySource | null>(null);
  const [isLoadingPolicies, setIsLoadingPolicies] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search clients from CRM API
  const searchClients = useCallback(async (query: string) => {
    setIsSearchingClients(true);
    try {
      const res = await fetch(`/api/tickets/context?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setClientsList(data.clients || []);
      }
    } catch {
      // Ignore network errors during typing
    } finally {
      setIsSearchingClients(false);
    }
  }, []);

  // Fetch policies when selectedClient changes
  const fetchPolicies = useCallback(async (clientId: string) => {
    setIsLoadingPolicies(true);
    setPoliciesList([]);
    try {
      const res = await fetch(`/api/tickets/context?clientId=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setPoliciesList(data.policies || []);
      }
    } catch {
      // Fallback to empty policies
    } finally {
      setIsLoadingPolicies(false);
    }
  }, []);

  // Initial client search load on modal open
  useEffect(() => {
    if (isOpen) {
      if (initialClientId) {
        const clientObj: WinterfellClientOption = {
          id: initialClientId,
          name: initialClientName || 'Cliente Contextual',
        };
        setSelectedClient(clientObj);
        fetchPolicies(initialClientId);
        if (initialPolicyId) {
          setSelectedPolicyId(initialPolicyId);
          setSelectedPolicySource(initialPolicySource || null);
        }
      } else {
        searchClients('');
      }
    }
  }, [isOpen, initialClientId, initialClientName, initialPolicyId, initialPolicySource, searchClients, fetchPolicies]);

  // When selectedClient changes -> reset policy selection & load new policies
  const handleSelectClient = (client: WinterfellClientOption | null) => {
    setSelectedClient(client);
    setIsClientDropdownOpen(false);
    setSelectedPolicyId('');
    setSelectedPolicySource(null);

    if (client) {
      fetchPolicies(client.id);
    } else {
      setPoliciesList([]);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setError(null);

    if (!selectedClient) {
      setError('Debe seleccionar un cliente para crear el ticket.');
      return;
    }

    // Validate US Date format (MM/DD/YYYY)
    const { internalVal: dueAtInternal, isValid: isDateValid } = parseMMDDYYYYtoYYYYMMDD(dueDateInput);
    if (!isDateValid) {
      setError('Fecha de vencimiento inválida. Formato requerido: MM/DD/YYYY (ej: 09/30/2026).');
      return;
    }

    setIsSubmitting(true);

    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const clientId = selectedClient ? selectedClient.id : null;
      const policyId = selectedPolicyId ? selectedPolicyId : null;
      const policySource = selectedPolicyId ? selectedPolicySource : null;

      if (policyId && (!clientId || !policySource)) {
        throw new Error('No se puede seleccionar una póliza sin cliente y tipo de póliza válido.');
      }

      await onCreateTicket({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        status,
        assignedTo: assignedToId || null,
        dueAt: dueAtInternal ? new Date(dueAtInternal).toISOString() : null,
        tags,
        clientId,
        policyId,
        policySource,
      });

      // Reset Form State
      setTitle('');
      setDescription('');
      setPriority('medium');
      setStatus('new');
      setAssignedToId('');
      setDueDateInput('');
      setTagsInput('');
      setSelectedClient(null);
      setSelectedPolicyId('');
      setSelectedPolicySource(null);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al procesar la solicitud.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl transition-all">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-semibold text-slate-900">Crear Nuevo Ticket</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {/* CLIENT & POLICY CONTEXT SECTION */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
            <span className="block text-xs font-semibold text-indigo-700">
              Cliente y Póliza
            </span>

            {/* Client Selector */}
            <div className="relative">
              <label className="block font-medium text-slate-700 mb-1">
                Cliente
              </label>
              {selectedClient ? (
                <div className="flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50/50 px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="font-semibold text-indigo-900">{selectedClient.name}</span>
                    {selectedClient.city && (
                      <span className="text-[11px] text-indigo-600 font-normal">({selectedClient.city})</span>
                    )}
                  </div>
                  {!isClientLocked && (
                    <button
                      type="button"
                      onClick={() => handleSelectClient(null)}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-800"
                    >
                      Cambiar
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={clientSearchQuery}
                    onFocus={() => setIsClientDropdownOpen(true)}
                    onChange={(e) => {
                      setClientSearchQuery(e.target.value);
                      searchClients(e.target.value);
                      setIsClientDropdownOpen(true);
                    }}
                    placeholder="Buscar cliente por nombre..."
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  {isSearchingClients && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                      Buscando...
                    </span>
                  )}

                  {isClientDropdownOpen && (
                    <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                      {clientsList.length === 0 ? (
                        <div className="p-2.5 text-center text-slate-400 text-[11px]">
                          No se encontraron clientes autorizados
                        </div>
                      ) : (
                        clientsList.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSelectClient(c)}
                            className="w-full text-left px-3 py-2 hover:bg-indigo-50/70 border-b border-slate-100 last:border-none transition-colors"
                          >
                            <span className="font-medium text-slate-900 block">{c.name}</span>
                            <span className="text-[10px] text-slate-500">
                              {c.city ? `${c.city}` : 'Cliente Registrado'}
                              {c.phoneLast4 ? ` • Tel: ***${c.phoneLast4}` : ''}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Policy Selector */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Póliza Asociada (Opcional)
              </label>
              <select
                disabled={!selectedClient || isLoadingPolicies}
                value={selectedPolicyId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedPolicyId(val);
                  const found = policiesList.find((p) => p.id === val);
                  setSelectedPolicySource(found ? found.source : null);
                }}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="">
                  {!selectedClient
                    ? 'Seleccione primero un cliente'
                    : isLoadingPolicies
                    ? 'Cargando pólizas del cliente...'
                    : policiesList.length === 0
                    ? 'Sin pólizas registradas (Solo Cliente)'
                    : 'Sin póliza específica (Solo Cliente)'}
                </option>
                {policiesList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayLabel}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* STANDARD TICKET FIELDS */}
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Título / Asunto <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Cambio de dirección de correspondencia"
              className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Descripción</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalles sobre el requerimiento del cliente o tarea interna..."
              className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Prioridad</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Estado Inicial</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TicketStatus)}
                className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="new">Nuevo</option>
                <option value="in_progress">En Progreso</option>
                <option value="waiting_client">Esp. Cliente</option>
                <option value="waiting_carrier">Esp. Aseguradora</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Asignado a</label>
              <select
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Sin Asignar</option>
                {appUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Fecha de Vencimiento (MM/DD/YYYY)</label>
              <input
                type="text"
                placeholder="MM/DD/YYYY"
                maxLength={10}
                value={dueDateInput}
                onChange={(e) => setDueDateInput(formatRawInputToMMDDYYYY(e.target.value))}
                className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Etiquetas (separadas por coma)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Salud, Ambetter, Urgente"
              className="w-full rounded-md border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Creando Ticket...' : 'Crear Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

