'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type {
  DetailedTicket,
  TicketStatus,
  TicketPriority,
  LanzaUser,
} from './types';
import { getStatusBadge, getPriorityBadge } from './TicketTableView';

interface TicketDetailWorkspaceProps {
  ticketId: string;
  onBack: () => void;
  onTicketUpdated: () => void;
  appUsers: LanzaUser[];
  currentUser?: { id: string; name: string; email: string; role: string } | null;
}

export default function TicketDetailWorkspace({
  ticketId,
  onBack,
  onTicketUpdated,
  appUsers,
  currentUser,
}: TicketDetailWorkspaceProps) {
  const [ticket, setTicket] = useState<DetailedTicket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'notes' | 'checklist' | 'documents' | 'activity'>('details');

  // Input states
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  // Multi-checklist state
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [isSubmittingChecklist, setIsSubmittingChecklist] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);

  const [newStepTitles, setNewStepTitles] = useState<Record<string, string>>({});
  const [newStepAssignees, setNewStepAssignees] = useState<Record<string, string>>({});
  const [isSubmittingStep, setIsSubmittingStep] = useState<Record<string, boolean>>({});

  // File upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Attribute update states
  const [isUpdatingAttr, setIsUpdatingAttr] = useState(false);
  const [attrError, setAttrError] = useState<string | null>(null);

  // Delete ticket states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadTicketDetail = useCallback(async (id: string) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', ticketId: id }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.ticket) {
        setFetchError(data.error || 'No se pudo cargar la información del ticket.');
        setTicket(null);
        return;
      }

      setTicket(data.ticket);
    } catch (err: any) {
      setFetchError('Error de red al conectar con el servidor.');
      setTicket(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ticketId) {
      loadTicketDetail(ticketId);
    }
  }, [ticketId, loadTicketDetail]);

  // Handle Attribute Updates
  const handleUpdateAttribute = async (updates: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedTo?: string | null;
    dueAt?: string | null;
  }) => {
    if (!ticket) return;
    setIsUpdatingAttr(true);
    setAttrError(null);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          ticketId: ticket.id,
          ...updates,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setAttrError(data.error || 'Error al actualizar el ticket.');
        return;
      }

      await loadTicketDetail(ticket.id);
      onTicketUpdated();
    } catch (err: any) {
      setAttrError('Error de red al actualizar el ticket.');
    } finally {
      setIsUpdatingAttr(false);
    }
  };

  // Handle Add Note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket) return;

    if (!newNoteContent || !newNoteContent.trim()) {
      setNoteError('El contenido de la nota no puede estar vacío.');
      return;
    }

    setIsSubmittingNote(true);
    setNoteError(null);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_note',
          ticketId: ticket.id,
          content: newNoteContent.trim(),
          body: newNoteContent.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setNoteError(data.error || 'Contenido de la nota requerido.');
        return;
      }

      setNewNoteContent('');
      await loadTicketDetail(ticket.id);
      onTicketUpdated();
    } catch (err: any) {
      setNoteError('Error de red al enviar la nota.');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  // Handle Add Checklist Item
  const handleAddChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !newTaskTitle.trim()) return;

    setIsSubmittingTask(true);
    setTaskError(null);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_checklist_item',
          ticketId: ticket.id,
          title: newTaskTitle.trim(),
          content: newTaskTitle.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setTaskError(data.error || 'Error al agregar la tarea.');
        return;
      }

      setNewTaskTitle('');
      await loadTicketDetail(ticket.id);
      onTicketUpdated();
    } catch (err: any) {
      setTaskError('Error de red al agregar la tarea.');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  // Handle Toggle Checklist Item
  const handleToggleChecklistItem = async (itemId: string, currentStatus: boolean) => {
    if (!ticket) return;

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_checklist_item',
          ticketId: ticket.id,
          itemId,
          isDone: !currentStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Error al actualizar la tarea.');
        return;
      }

      await loadTicketDetail(ticket.id);
      onTicketUpdated();
    } catch (err: any) {
      alert('Error de red al cambiar estado de la tarea.');
    }
  };

  // Handle Add New Checklist
  const handleAddChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !newChecklistTitle.trim()) return;

    setIsSubmittingChecklist(true);
    setChecklistError(null);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_checklist',
          ticketId: ticket.id,
          title: newChecklistTitle.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setChecklistError(data.error || 'Error al crear el checklist.');
        return;
      }

      setNewChecklistTitle('');
      await loadTicketDetail(ticket.id);
      onTicketUpdated();
    } catch (err: any) {
      setChecklistError('Error de red al crear el checklist.');
    } finally {
      setIsSubmittingChecklist(false);
    }
  };

  // Handle Delete Checklist
  const handleDeleteChecklist = async (checklistId: string) => {
    if (!ticket) return;
    setChecklistError(null);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_checklist',
          ticketId: ticket.id,
          checklistId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setChecklistError(data.error || 'Error al eliminar el checklist.');
        return;
      }

      await loadTicketDetail(ticket.id);
      onTicketUpdated();
    } catch (err: any) {
      setChecklistError('Error de red al eliminar el checklist.');
    }
  };

  // Handle Add Step to specific Checklist
  const handleAddStep = async (checklistId?: string) => {
    if (!ticket) return;
    const titleKey = checklistId || 'default';
    const text = (newStepTitles[titleKey] || '').trim();
    if (!text) return;

    setIsSubmittingStep((prev) => ({ ...prev, [titleKey]: true }));
    setChecklistError(null);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_checklist_item',
          ticketId: ticket.id,
          checklistId,
          title: text,
          content: text,
          assignedToWinterfellProfileId: newStepAssignees[titleKey] || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setChecklistError(data.error || 'Error al agregar el paso.');
        return;
      }

      setNewStepTitles((prev) => ({ ...prev, [titleKey]: '' }));
      setNewStepAssignees((prev) => ({ ...prev, [titleKey]: '' }));
      await loadTicketDetail(ticket.id);
      onTicketUpdated();
    } catch (err: any) {
      setChecklistError('Error de red al agregar el paso.');
    } finally {
      setIsSubmittingStep((prev) => ({ ...prev, [titleKey]: false }));
    }
  };

  // Handle Delete Step
  const handleDeleteStep = async (itemId: string) => {
    if (!ticket) return;
    setChecklistError(null);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_checklist_item',
          ticketId: ticket.id,
          itemId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setChecklistError(data.error || 'Error al eliminar el paso.');
        return;
      }

      await loadTicketDetail(ticket.id);
      onTicketUpdated();
    } catch (err: any) {
      setChecklistError('Error de red al eliminar el paso.');
    }
  };

  // Handle Document Upload
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !selectedFile) return;

    if (selectedFile.size > 10 * 1024 * 1024) {
      setFileError('El archivo excede el tamaño máximo permitido (10 MB).');
      return;
    }

    setIsUploadingFile(true);
    setFileError(null);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const res = await fetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upload_attachment',
            ticketId: ticket.id,
            fileName: selectedFile.name,
            fileBase64: base64Data,
            mimeType: selectedFile.type,
            sizeBytes: selectedFile.size,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          setFileError(data.error || 'Error al subir el archivo.');
          setIsUploadingFile(false);
          return;
        }

        setSelectedFile(null);
        await loadTicketDetail(ticket.id);
        onTicketUpdated();
        setIsUploadingFile(false);
      };
      reader.onerror = () => {
        setFileError('Error al leer el archivo seleccionado.');
        setIsUploadingFile(false);
      };
    } catch (err: any) {
      setFileError('Error de red al subir el archivo.');
      setIsUploadingFile(false);
    }
  };

  // Handle Download Attachment
  const handleDownloadAttachment = async (attachmentId: string) => {
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_attachment_url',
          attachmentId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.url) {
        alert(data.error || 'No se pudo obtener la URL de descarga.');
        return;
      }

      window.open(data.url, '_blank');
    } catch (err) {
      alert('Error de red al solicitar enlace de descarga.');
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Sin fecha';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const dateFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return dateFmt.format(d);
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const dateFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const timeFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      return `${dateFmt.format(d)}, ${timeFmt.format(d)}`;
    } catch {
      return dateStr;
    }
  };

  const handleDeleteTicket = async () => {
    if (!ticket) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_ticket', ticketId: ticket.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeleteError(data.error || 'No se pudo eliminar el ticket.');
        setIsDeleting(false);
        return;
      }
      setIsDeleteModalOpen(false);
      onTicketUpdated();
      onBack();
    } catch {
      setDeleteError('Error de red al intentar eliminar el ticket.');
      setIsDeleting(false);
    }
  };

  const isUserAdmin = currentUser?.role === 'admin';
  const isUserCreator = Boolean(
    currentUser && (
      (ticket?.createdById && ticket.createdById === currentUser.id) ||
      (ticket?.createdByName && currentUser.name && ticket.createdByName.toLowerCase() === currentUser.name.toLowerCase()) ||
      (ticket?.createdByName && currentUser.email && ticket.createdByName.toLowerCase() === currentUser.email.split('@')[0].toLowerCase())
    )
  );
  const canDelete = !currentUser || isUserAdmin || isUserCreator;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500 text-xs">
        <svg className="h-7 w-7 animate-spin text-indigo-600 mb-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span>Cargando espacio de trabajo del ticket...</span>
      </div>
    );
  }

  if (fetchError || !ticket) {
    return (
      <div className="p-8 max-w-lg mx-auto my-12 text-center rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs">
        <h3 className="font-bold text-sm mb-1">Error al abrir ticket</h3>
        <p>{fetchError || 'Ticket no encontrado.'}</p>
        <button
          onClick={onBack}
          className="mt-4 rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700"
        >
          &larr; Volver a Tickets
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 animate-fadeIn">
      {/* Top Header & Navigation Bar */}
      <div className="border-b border-slate-200 pb-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Volver a la Lista de Tickets
          </button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-indigo-700">{ticket.code}</span>
            {getStatusBadge(ticket.status)}
            {getPriorityBadge(ticket.priority)}
          </div>
        </div>

        <h1 className="text-xl font-bold text-slate-900">{ticket.title}</h1>
        {ticket.description && (
          <p className="mt-1 text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200/80">
            {ticket.description}
          </p>
        )}
      </div>

      {attrError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {attrError}
        </div>
      )}

      {/* Main Full-Width Workspace 2-Column Grid */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Column: Tabbed Main Content Area */}
        <div className="flex-1 w-full space-y-4">
          {/* Main Navigation Tabs */}
          <div className="border-b border-slate-200">
            <nav className="flex space-x-6 text-xs font-semibold">
              <button
                onClick={() => setActiveTab('details')}
                className={`pb-3 border-b-2 transition-colors ${
                  activeTab === 'details'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Detalles
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`pb-3 border-b-2 transition-colors ${
                  activeTab === 'notes'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Notas ({ticket.notes?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('checklist')}
                className={`pb-3 border-b-2 transition-colors ${
                  activeTab === 'checklist'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Checklist ({ticket.checklistDone}/{ticket.checklistTotal})
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className={`pb-3 border-b-2 transition-colors ${
                  activeTab === 'documents'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Documentos ({ticket.attachments?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('activity')}
                className={`pb-3 border-b-2 transition-colors ${
                  activeTab === 'activity'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Actividad
              </button>
            </nav>
          </div>

          {/* TAB 1: DETALLES */}
          {activeTab === 'details' && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Client Context Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                    <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <svg className="h-4 w-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Cliente Asociado
                    </span>
                    {ticket.clientDetails && (
                      <a
                        href={`/clients/${ticket.clientDetails.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        Ver Perfil &rarr;
                      </a>
                    )}
                  </div>
                  {ticket.clientDetails ? (
                    <div className="space-y-1.5 text-slate-700">
                      <p className="font-semibold text-slate-900 text-sm">{ticket.clientDetails.name}</p>
                      {ticket.clientDetails.phone && <p>📞 {ticket.clientDetails.phone}</p>}
                      {ticket.clientDetails.email && <p>✉️ {ticket.clientDetails.email}</p>}
                      {ticket.clientDetails.address && <p>📍 {ticket.clientDetails.address}</p>}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic py-2">No hay cliente asociado a este ticket.</p>
                  )}
                </div>

                {/* Policy Context Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                    <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <svg className="h-4 w-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Póliza Relacionada
                    </span>
                    {ticket.policyDetails && ticket.clientDetails && (
                      <a
                        href={`/clients/${ticket.clientDetails.id}/policies/${ticket.policyDetails.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        Ver Póliza &rarr;
                      </a>
                    )}
                  </div>
                  {ticket.policyDetails ? (
                    <div className="space-y-1.5 text-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm">{ticket.policyDetails.carrierName}</span>
                        <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase border border-indigo-200">
                          {ticket.policyDetails.source}
                        </span>
                      </div>
                      <p className="font-mono text-slate-800 font-medium">
                        Póliza #: {ticket.policyDetails.policyNumber || 'N/A'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-slate-400 italic py-2">No hay póliza vinculada a este ticket.</p>
                  )}
                </div>
              </div>

              {/* General Description Card */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-2xs space-y-2">
                <h3 className="font-bold text-slate-900">Resumen y Contexto</h3>
                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {ticket.description || 'Sin descripción detallada.'}
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: NOTAS */}
          {activeTab === 'notes' && (
            <div className="space-y-4 pt-1">
              {/* Add Note Form */}
              <form onSubmit={handleAddNote} className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-800">Agregar Nota Interna</label>
                {noteError && (
                  <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    {noteError}
                  </div>
                )}
                <textarea
                  rows={3}
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="Escribe el contenido de la nota sobre el avance o gestión..."
                  className="w-full rounded-lg border border-slate-300 p-3 text-xs text-slate-900 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmittingNote || !newNoteContent.trim()}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {isSubmittingNote ? 'Guardando...' : 'Agregar Nota'}
                  </button>
                </div>
              </form>

              {/* Notes List Feed */}
              <div className="space-y-3">
                {(!ticket.notes || ticket.notes.length === 0) ? (
                  <p className="text-xs text-slate-400 italic text-center py-6 border border-dashed border-slate-200 rounded-xl">
                    No hay notas registradas para este ticket.
                  </p>
                ) : (
                  ticket.notes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-slate-200 bg-white p-4 text-xs space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 border-b border-slate-100 pb-2">
                        <span className="font-bold text-slate-900">{note.authorName}</span>
                        <span>{formatDateTime(note.createdAt)}</span>
                      </div>
                      <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{note.body || note.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CHECKLIST */}
          {activeTab === 'checklist' && (
            <div className="space-y-6 pt-1">
              {/* Form to create a new Checklist Container */}
              <form onSubmit={handleAddChecklist} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  type="text"
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  placeholder="Nuevo título de checklist (ej: QA Checklist, Tareas de Renovación)..."
                  className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-xs text-slate-900 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isSubmittingChecklist || !newChecklistTitle.trim()}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap flex items-center justify-center gap-1.5"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  {isSubmittingChecklist ? 'Creando...' : 'Nuevo Checklist'}
                </button>
              </form>

              {checklistError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 font-medium">
                  {checklistError}
                </div>
              )}

              {/* Render Checklist Cards */}
              {(!ticket.checklists || ticket.checklists.length === 0) ? (
                ticket.checklist && ticket.checklist.length > 0 ? (
                  /* Single Checklist Fallback Card for legacy items */
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h4 className="font-bold text-slate-900 text-sm">Checklist General</h4>
                      <span className="text-xs font-semibold text-slate-600">
                        {ticket.checklistDone} / {ticket.checklistTotal} completadas ({Math.round((ticket.checklistDone / (ticket.checklistTotal || 1)) * 100)}%)
                      </span>
                    </div>

                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2 transition-all duration-300"
                        style={{ width: `${Math.round((ticket.checklistDone / (ticket.checklistTotal || 1)) * 100)}%` }}
                      />
                    </div>

                    <div className="space-y-2">
                      {ticket.checklist.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-start gap-3 rounded-lg border p-3 text-xs transition-colors ${
                            item.isDone ? 'bg-emerald-50/40 border-emerald-200/80 text-slate-500 line-through' : 'bg-white border-slate-200 text-slate-800'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={item.isDone}
                            onChange={() => handleToggleChecklistItem(item.id, item.isDone)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{item.content || item.title || item.text}</span>
                              {item.assignedToName && (
                                <span className="no-underline text-[10px] bg-slate-100 font-semibold text-slate-700 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                                  👤 {item.assignedToName}
                                </span>
                              )}
                            </div>
                            {item.isDone && (
                              <p className="text-[11px] no-underline text-emerald-700 font-medium">
                                Completado por {item.doneByName || item.doneBy || 'Agente'} {item.doneAt ? `el ${formatDateTime(item.doneAt)}` : ''}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteStep(item.id)}
                            className="text-slate-400 hover:text-red-600 p-1 transition-colors"
                            title="Eliminar paso"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Footer add step */}
                    <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
                      <input
                        type="text"
                        value={newStepTitles['default'] || ''}
                        onChange={(e) => setNewStepTitles((prev) => ({ ...prev, default: e.target.value }))}
                        placeholder="Nuevo paso..."
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 bg-white"
                      />
                      <select
                        value={newStepAssignees['default'] || ''}
                        onChange={(e) => setNewStepAssignees((prev) => ({ ...prev, default: e.target.value }))}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700 bg-white"
                      >
                        <option value="">Sin asignar</option>
                        {appUsers.map((u) => (
                          <option key={u.id} value={u.profileId || u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleAddStep(undefined)}
                        disabled={isSubmittingStep['default'] || !(newStepTitles['default'] || '').trim()}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        Agregar paso
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-white space-y-2">
                    <svg className="mx-auto h-10 w-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <p className="text-sm font-semibold text-slate-700">No hay checklists creados</p>
                    <p className="text-xs text-slate-400">Crea tu primer checklist utilizando el formulario de arriba.</p>
                  </div>
                )
              ) : (
                ticket.checklists.map((chk) => (
                  <div key={chk.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-4">
                    {/* Card Header */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="space-y-0.5">
                        <h4 className="font-bold text-slate-900 text-sm">{chk.title}</h4>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {chk.completedCount} de {chk.totalCount} completadas ({chk.progressPercent}%)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteChecklist(chk.id)}
                        className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-2.5 py-1 rounded-md font-semibold border border-red-200 transition-colors flex items-center gap-1"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Eliminar Checklist
                      </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2 transition-all duration-300"
                        style={{ width: `${chk.progressPercent}%` }}
                      />
                    </div>

                    {/* Checklist Steps */}
                    <div className="space-y-2">
                      {(!chk.items || chk.items.length === 0) ? (
                        <p className="text-xs text-slate-400 italic py-2 text-center border border-dashed border-slate-200 rounded-lg">
                          No hay pasos en este checklist. Agrega uno abajo.
                        </p>
                      ) : (
                        chk.items.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-start gap-3 rounded-lg border p-3 text-xs transition-colors ${
                              item.isDone ? 'bg-emerald-50/40 border-emerald-200/80 text-slate-500 line-through' : 'bg-white border-slate-200 text-slate-800'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={item.isDone}
                              onChange={() => handleToggleChecklistItem(item.id, item.isDone)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm">{item.content || item.title || item.text}</span>
                                {item.assignedToName && (
                                  <span className="no-underline text-[10px] bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded border border-indigo-200 flex items-center gap-1">
                                    👤 {item.assignedToName}
                                  </span>
                                )}
                              </div>
                              {item.isDone && (
                                <p className="text-[11px] no-underline text-emerald-700 font-medium">
                                  Completado por {item.doneByName || item.doneBy || 'Agente'} {item.doneAt ? `el ${formatDateTime(item.doneAt)}` : ''}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteStep(item.id)}
                              className="text-slate-400 hover:text-red-600 p-1 transition-colors"
                              title="Eliminar paso"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Add Step to this specific checklist */}
                    <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-slate-100">
                      <input
                        type="text"
                        value={newStepTitles[chk.id] || ''}
                        onChange={(e) => setNewStepTitles((prev) => ({ ...prev, [chk.id]: e.target.value }))}
                        placeholder="Nuevo paso para este checklist..."
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                      <select
                        value={newStepAssignees[chk.id] || ''}
                        onChange={(e) => setNewStepAssignees((prev) => ({ ...prev, [chk.id]: e.target.value }))}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Sin asignar</option>
                        {appUsers.map((u) => (
                          <option key={u.id} value={u.profileId || u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleAddStep(chk.id)}
                        disabled={isSubmittingStep[chk.id] || !(newStepTitles[chk.id] || '').trim()}
                        className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {isSubmittingStep[chk.id] ? 'Agregando...' : 'Agregar Paso'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: DOCUMENTOS */}
          {activeTab === 'documents' && (
            <div className="space-y-4 pt-1">
              {/* Document Upload Card */}
              <form onSubmit={handleFileUpload} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <span className="block text-xs font-bold text-slate-800">Adjuntar Nuevo Documento</span>
                {fileError && (
                  <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    {fileError}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.heic"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="flex-1 text-xs text-slate-700 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                  />
                  <button
                    type="submit"
                    disabled={isUploadingFile || !selectedFile}
                    className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {isUploadingFile ? 'Subiendo...' : 'Subir Archivo'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Formatos permitidos: PDF, PNG, JPG, WEBP, HEIC (Máximo 10 MB).
                </p>
              </form>

              {/* Attachments List */}
              <div className="space-y-3">
                {(!ticket.attachments || ticket.attachments.length === 0) ? (
                  <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                    <svg className="mx-auto h-8 w-8 text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span>No hay documentos adjuntos en este ticket.</span>
                  </div>
                ) : (
                  ticket.attachments.map((att) => (
                    <div key={att.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-4 text-xs bg-white shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{att.fileName || att.name || 'Documento'}</p>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                            {att.sizeBytes && <span>{(att.sizeBytes / 1024).toFixed(1)} KB</span>}
                            <span>•</span>
                            <span>Subido por {att.uploadedByName || 'Agente'}</span>
                            <span>•</span>
                            <span>{formatDate(att.uploadedAt || att.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDownloadAttachment(att.id)}
                        className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                      >
                        Descargar
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 5: ACTIVIDAD */}
          {activeTab === 'activity' && (
            <div className="space-y-4 pt-1">
              {(!ticket.activity || ticket.activity.length === 0) ? (
                <p className="text-xs text-slate-400 italic text-center py-6 border border-dashed border-slate-200 rounded-xl">
                  Sin historial de actividad registrado.
                </p>
              ) : (
                <div className="relative border-l-2 border-slate-200 ml-4 space-y-6 py-2">
                  {ticket.activity.map((act) => (
                    <div key={act.id} className="relative pl-6 text-xs">
                      <div className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-indigo-600 border-2 border-white" />
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                        <span className="font-bold text-slate-900">{act.actorName || 'Sistema'}</span>
                        <span>{formatDateTime(act.createdAt)}</span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-800">
                        <p className="font-semibold text-slate-900 mb-0.5">
                          {act.type || act.action || 'Evento de ticket'}
                        </p>
                        <p className="text-slate-600">{act.detail || act.description || 'Detalle registrado en auditoría.'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: PROPIEDADES Panel (Part of Workspace Grid, NOT a Drawer) */}
        <div className="w-full lg:w-80 flex-shrink-0 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-4">
          <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] border-b border-slate-200 pb-2">
            Propiedades
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Estado</label>
              <select
                value={ticket.status}
                disabled={isUpdatingAttr}
                onChange={(e) => handleUpdateAttribute({ status: e.target.value as TicketStatus })}
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 px-2.5 text-xs font-medium text-slate-900 shadow-2xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="new">Nuevo</option>
                <option value="in_progress">En Progreso</option>
                <option value="waiting_client">Esperando Cliente</option>
                <option value="waiting_carrier">Esperando Aseguradora</option>
                <option value="resolved">Resuelto</option>
                <option value="closed">Cerrado</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Prioridad</label>
              <select
                value={ticket.priority}
                disabled={isUpdatingAttr}
                onChange={(e) => handleUpdateAttribute({ priority: e.target.value as TicketPriority })}
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 px-2.5 text-xs font-medium text-slate-900 shadow-2xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Responsable / Asignado a</label>
              <select
                value={ticket.assignedToId || ''}
                disabled={isUpdatingAttr}
                onChange={(e) => handleUpdateAttribute({ assignedTo: e.target.value || null })}
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 px-2.5 text-xs font-medium text-slate-900 shadow-2xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="">Sin Asignar</option>
                {appUsers.map((u) => (
                  <option key={u.id} value={u.profileId || u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Fecha Límite</label>
              <div className="relative">
                <div className="w-full rounded-lg border border-slate-300 bg-white py-1.5 px-2.5 text-xs font-medium text-slate-900 shadow-2xs flex items-center justify-between pointer-events-none">
                  <span>{ticket.dueAt ? formatDate(ticket.dueAt) : 'MM/DD/YYYY'}</span>
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <input
                  type="date"
                  value={ticket.dueAt ? ticket.dueAt.slice(0, 10) : ''}
                  disabled={isUpdatingAttr}
                  onChange={(e) => handleUpdateAttribute({ dueAt: e.target.value ? `${e.target.value}T23:59:59Z` : null })}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {ticket.checklistTotal > 0 && (
              <div>
                <span className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Progreso Checklist</span>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-2 rounded-full"
                      style={{ width: `${(ticket.checklistDone / ticket.checklistTotal) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-slate-700 font-bold">{ticket.checklistDone}/{ticket.checklistTotal}</span>
                </div>
              </div>
            )}

            {ticket.tags && ticket.tags.length > 0 && (
              <div>
                <span className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Etiquetas</span>
                <div className="flex flex-wrap gap-1.5">
                  {ticket.tags.map((tag) => (
                    <span key={tag} className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-3 space-y-1.5 text-[11px] text-slate-500">
            <p><strong>Creado por:</strong> {ticket.createdByName || 'Sistema'}</p>
            <p><strong>Creado:</strong> {formatDateTime(ticket.createdAt)}</p>
            <p><strong>Actualizado:</strong> {formatDateTime(ticket.updatedAt)}</p>
          </div>

          {canDelete && (
            <div className="border-t border-slate-200 pt-3 mt-4">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                className="w-full rounded-lg bg-rose-50 border border-rose-200 py-2 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 hover:text-rose-800 transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Eliminar Ticket</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900">¿Eliminar este ticket?</h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Esta acción eliminará permanentemente el ticket <strong className="font-mono text-slate-900">{ticket.code}</strong> y todo su historial de notas, checklist y archivos adjuntos. Esta acción no se puede deshacer.
            </p>
            {deleteError && (
              <div className="mt-3 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                {deleteError}
              </div>
            )}
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteTicket}
                className="rounded-md bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
