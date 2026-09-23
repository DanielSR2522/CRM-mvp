'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';

interface WinterfellUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'agent' | 'assistant';
  createdAt?: string;
  isSelf?: boolean;
}

interface AssistantLink {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function UsersManagementPage() {
  const [users, setUsers] = useState<WinterfellUser[]>([]);
  const [actorRole, setActorRole] = useState<'admin' | 'agent' | 'assistant'>('admin');
  const [myAssistantsCount, setMyAssistantsCount] = useState<number>(0);
  const [maxAssistants] = useState<number>(4);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'agent' | 'assistant'>('all');

  // Create User Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createFirstName, setCreateFirstName] = useState('');
  const [createLastName, setCreateLastName] = useState('');
  const [createWhatsappPhone, setCreateWhatsappPhone] = useState('');
  const [createPreferredLanguage, setCreatePreferredLanguage] = useState<'es' | 'en' | 'pt'>('es');
  const [createRole, setCreateRole] = useState<'admin' | 'agent' | 'assistant'>('assistant');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [userModalError, setUserModalError] = useState<string | null>(null);

  // Edit Role Modal State (Admin only)
  const [editingUser, setEditingUser] = useState<WinterfellUser | null>(null);
  const [editRole, setEditRole] = useState<'admin' | 'agent' | 'assistant'>('agent');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Manage Assistants Modal State (Admin only)
  const [managingUser, setManagingUser] = useState<WinterfellUser | null>(null);
  const [currentAssistants, setCurrentAssistants] = useState<AssistantLink[]>([]);
  const [currentAssists, setCurrentAssists] = useState<AssistantLink[]>([]);
  const [loadingRelationships, setLoadingRelationships] = useState(false);
  const [selectedAssistantToAdd, setSelectedAssistantToAdd] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);

  // Load Users List & Actor Context
  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'No se pudieron cargar los usuarios.');
        setUsers([]);
        return;
      }
      setUsers(data.users || []);
      if (data.actorRole) {
        setActorRole(data.actorRole);
      }
      if (typeof data.myAssistantsCount === 'number') {
        setMyAssistantsCount(data.myAssistantsCount);
      }
    } catch {
      setError('Error de red al conectar con el servidor.');
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Load Assistant Relationships for a selected user (Admin)
  const loadRelationships = useCallback(async (userId: string) => {
    setLoadingRelationships(true);
    setRelationshipError(null);
    try {
      const res = await fetch(`/api/users/${userId}/assistants`);
      const data = await res.json();
      if (res.ok && data.success) {
        setCurrentAssistants(data.assistants || []);
        setCurrentAssists(data.assists || []);
      }
    } catch {
      setRelationshipError('Error de red al cargar relaciones de asistentes.');
    } finally {
      setLoadingRelationships(false);
    }
  }, []);

  const openManageAssistants = (user: WinterfellUser) => {
    setManagingUser(user);
    setSelectedAssistantToAdd('');
    loadRelationships(user.id);
  };

  // Add Assistant Relationship (Admin)
  const handleAddAssistant = async () => {
    if (!managingUser || !selectedAssistantToAdd) return;
    setIsLinking(true);
    setRelationshipError(null);
    try {
      const res = await fetch(`/api/users/${managingUser.id}/assistants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistantProfileId: selectedAssistantToAdd }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setRelationshipError(data.error || 'No se pudo vincular el asistente.');
        setIsLinking(false);
        return;
      }
      setSelectedAssistantToAdd('');
      await loadRelationships(managingUser.id);
      await loadUsers();
    } catch {
      setRelationshipError('Error de red al vincular asistente.');
    } finally {
      setIsLinking(false);
    }
  };

  // Remove Assistant Relationship
  const handleRemoveAssistant = async (assistantId: string, targetAgentId?: string) => {
    const agentId = targetAgentId || (managingUser ? managingUser.id : undefined);
    if (!agentId) return;
    setIsLinking(true);
    setRelationshipError(null);
    try {
      const res = await fetch(`/api/users/${agentId}/assistants?assistantProfileId=${assistantId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const msg = data.error || 'No se pudo desvincular el asistente.';
        if (managingUser) setRelationshipError(msg);
        else setError(msg);
        setIsLinking(false);
        return;
      }
      if (managingUser) {
        await loadRelationships(managingUser.id);
      }
      await loadUsers();
    } catch {
      if (managingUser) setRelationshipError('Error de red al desvincular asistente.');
      else setError('Error de red al desvincular asistente.');
    } finally {
      setIsLinking(false);
    }
  };

  // Create User / Assistant Submit
  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createEmail || !createPassword || isSubmittingUser) return;

    setIsSubmittingUser(true);
    setUserModalError(null);

    const targetRole = actorRole === 'agent' ? 'assistant' : createRole;

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_user',
          email: createEmail,
          password: createPassword,
          firstName: createFirstName,
          lastName: createLastName,
          whatsappPhone: createWhatsappPhone,
          preferredLanguage: createPreferredLanguage,
          role: targetRole,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setUserModalError(data.error || 'No se pudo crear el usuario.');
        setIsSubmittingUser(false);
        return;
      }

      setIsCreateModalOpen(false);
      setCreateEmail('');
      setCreatePassword('');
      setCreateFirstName('');
      setCreateLastName('');
      setCreateWhatsappPhone('');
      setCreatePreferredLanguage('es');
      setCreateRole(actorRole === 'agent' ? 'assistant' : 'agent');
      await loadUsers();
    } catch {
      setUserModalError('Error de red al crear usuario.');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  // Edit Role Submit (Admin only)
  const handleUpdateRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || isUpdatingRole) return;

    setIsUpdatingRole(true);
    setUserModalError(null);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_role',
          targetUserId: editingUser.id,
          role: editRole,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setUserModalError(data.error || 'No se pudo actualizar el rol.');
        setIsUpdatingRole(false);
        return;
      }

      setEditingUser(null);
      await loadUsers();
    } catch {
      setUserModalError('Error de red al actualizar rol.');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  // Filtered Users List
  const filteredUsers = users.filter((u) => {
    if (actorRole === 'agent') {
      // Agent sees ONLY their Assistants (excluding self from the list)
      return !u.isSelf && u.role === 'assistant';
    }
    if (roleFilter === 'all') return true;
    return u.role === roleFilter;
  });

  // Available Assistants dropdown list (for admin modal selection)
  const availableAssistants = users.filter(
    (u) => u.role === 'assistant' && !currentAssistants.some((ca) => ca.id === u.id)
  );

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <span className="inline-flex items-center rounded-md bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200">Administrador</span>;
      case 'assistant':
        return <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">Asistente</span>;
      default:
        return <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">Agente</span>;
    }
  };

  const isAgentMaxReached = actorRole === 'agent' && myAssistantsCount >= maxAssistants;
  const selfUser = users.find((u) => u.isSelf);

  return (
    <DashboardLayout>
      <CrmPageContainer>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  {actorRole === 'agent' ? 'MIS ASISTENTES' : 'Usuarios & Equipo SmarTrack'}
                </h1>
                {actorRole === 'agent' && (
                  <span className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-bold border ${
                    isAgentMaxReached
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  }`}>
                    Asistentes {myAssistantsCount} / {maxAssistants}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {actorRole === 'agent'
                  ? 'Puedes agregar hasta 4 asistentes a tu equipo.'
                  : 'Gestión canónica de usuarios y relaciones de equipo Agente ↔ Asistente.'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={isAgentMaxReached}
                onClick={() => {
                  setUserModalError(null);
                  setCreateRole(actorRole === 'agent' ? 'assistant' : 'agent');
                  setIsCreateModalOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={isAgentMaxReached ? 'Has alcanzado el máximo de 4 asistentes permitidos.' : undefined}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                <span>{actorRole === 'agent' ? '+ Crear Asistente' : 'Crear Nuevo Usuario'}</span>
              </button>
            </div>
          </div>

          {/* Max Assistants Banner for Agent */}
          {isAgentMaxReached && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Has alcanzado el máximo de 4 asistentes permitidos. Para agregar uno nuevo, remueve un asistente existente primero.</span>
              </div>
            </div>
          )}

          {/* Filter Bar (Admin Only) */}
          {actorRole === 'admin' && (
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-xs">
              <span className="font-semibold text-slate-600 mr-2">Filtrar por rol:</span>
              <button
                onClick={() => setRoleFilter('all')}
                className={`rounded-md px-3 py-1 font-medium transition-colors ${
                  roleFilter === 'all' ? 'bg-indigo-50 font-bold text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Todos ({users.length})
              </button>
              <button
                onClick={() => setRoleFilter('agent')}
                className={`rounded-md px-3 py-1 font-medium transition-colors ${
                  roleFilter === 'agent' ? 'bg-indigo-50 font-bold text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Agentes ({users.filter((u) => u.role === 'agent').length})
              </button>
              <button
                onClick={() => setRoleFilter('assistant')}
                className={`rounded-md px-3 py-1 font-medium transition-colors ${
                  roleFilter === 'assistant' ? 'bg-indigo-50 font-bold text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Asistentes ({users.filter((u) => u.role === 'assistant').length})
              </button>
              <button
                onClick={() => setRoleFilter('admin')}
                className={`rounded-md px-3 py-1 font-medium transition-colors ${
                  roleFilter === 'admin' ? 'bg-indigo-50 font-bold text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Administradores ({users.filter((u) => u.role === 'admin').length})
              </button>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* Loading State */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-xs text-slate-500">
              <svg className="h-6 w-6 animate-spin text-indigo-600 mb-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Cargando asistentes...</span>
            </div>
          ) : (
            /* Users Table */
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Correo Electrónico</th>
                    {actorRole === 'admin' && <th className="px-4 py-3">Rol Canónico</th>}
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={actorRole === 'admin' ? 4 : 3} className="px-4 py-8 text-center text-slate-400 italic">
                        {actorRole === 'agent'
                          ? 'Aún no tienes asistentes asignados. Haz clic en "+ Crear Asistente" para agregar uno.'
                          : 'No se encontraron usuarios con el rol seleccionado.'}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-semibold text-slate-900 block">{user.name}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                          {user.email}
                        </td>
                        {actorRole === 'admin' && (
                          <td className="px-4 py-3">
                            {getRoleBadge(user.role)}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right space-x-2">
                          {actorRole === 'admin' && (
                            <button
                              onClick={() => {
                                setUserModalError(null);
                                setEditingUser(user);
                                setEditRole(user.role);
                              }}
                              className="rounded px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                            >
                              Editar Rol
                            </button>
                          )}

                          {actorRole === 'admin' && (user.role === 'agent' || user.role === 'assistant') && (
                            <button
                              onClick={() => openManageAssistants(user)}
                              className="rounded px-2.5 py-1 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                            >
                              {user.role === 'agent' ? 'Gestionar Asistentes' : 'Ver Agentes Asistidos'}
                            </button>
                          )}

                          {actorRole === 'agent' && (
                            <button
                              disabled={isLinking}
                              onClick={() => handleRemoveAssistant(user.id, selfUser?.id)}
                              className="rounded bg-rose-50 border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-50"
                            >
                              Remover
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* MODAL 1: Create User / Assistant */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">
                  {actorRole === 'agent' ? 'Crear Nuevo Asistente' : 'Crear Nuevo Usuario SmarTrack'}
                </h3>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {userModalError && (
                <div className="mt-3 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                  {userModalError}
                </div>
              )}

              <form onSubmit={handleCreateUserSubmit} className="mt-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Nombre</label>
                    <input
                      type="text"
                      required
                      value={createFirstName}
                      onChange={(e) => setCreateFirstName(e.target.value)}
                      placeholder="Ej: Pedro"
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Apellido</label>
                    <input
                      type="text"
                      required
                      value={createLastName}
                      onChange={(e) => setCreateLastName(e.target.value)}
                      placeholder="Ej: Pérez"
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    required
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="pedrito@smartrack.com"
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Teléfono WhatsApp {actorRole === 'agent' ? <span className="text-rose-500">*</span> : null}
                  </label>
                  <input
                    type="tel"
                    required={actorRole === 'agent'}
                    value={createWhatsappPhone}
                    onChange={(e) => setCreateWhatsappPhone(e.target.value)}
                    placeholder="(305) 555-0123"
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Requerido para notificaciones de tickets por WhatsApp.
                  </span>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Idioma preferido</label>
                  <select
                    value={createPreferredLanguage}
                    onChange={(e) => setCreatePreferredLanguage(e.target.value as any)}
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                  >
                    <option value="es">Español</option>
                    <option value="en">English</option>
                    <option value="pt">Português</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Contraseña</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                  />
                </div>

                {actorRole === 'admin' && (
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Rol de Usuario</label>
                    <select
                      value={createRole}
                      onChange={(e) => setCreateRole(e.target.value as any)}
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                    >
                      <option value="agent">Agente</option>
                      <option value="assistant">Asistente</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingUser}
                    className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isSubmittingUser ? 'Creando...' : actorRole === 'agent' ? 'Crear Asistente' : 'Crear Usuario'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: Edit User Role (Admin only) */}
        {editingUser && actorRole === 'admin' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Editar Rol de {editingUser.name}
              </h3>

              {userModalError && (
                <div className="mt-3 rounded-md bg-rose-50 p-2 text-xs text-rose-700 border border-rose-200">
                  {userModalError}
                </div>
              )}

              <form onSubmit={handleUpdateRoleSubmit} className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Seleccionar Rol</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as any)}
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                  >
                    <option value="agent">Agente</option>
                    <option value="assistant">Asistente</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingRole}
                    className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isUpdatingRole ? 'Guardando...' : 'Guardar Cambio'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 3: Manage Assistants / Assists (Admin only) */}
        {managingUser && actorRole === 'admin' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {managingUser.role === 'agent'
                      ? `Asistentes de ${managingUser.name}`
                      : `Agentes Asistidos por ${managingUser.name}`}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Relación de equipo canónica en tabla <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">public.agent_assistant_relationships</code>.
                  </p>
                </div>
                <button
                  onClick={() => setManagingUser(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {relationshipError && (
                <div className="mt-3 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                  {relationshipError}
                </div>
              )}

              <div className="mt-4 space-y-4 text-xs">
                {/* Agent View: Managing Assistants */}
                {managingUser.role === 'agent' && (
                  <div>
                    <span className="block font-semibold text-slate-700 uppercase text-[11px] tracking-wider mb-2">
                      Asistentes Asignados Actuales ({currentAssistants.length} / 4)
                    </span>

                    {loadingRelationships ? (
                      <p className="text-xs text-slate-400 italic py-3 text-center">Cargando asistentes...</p>
                    ) : currentAssistants.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-3 border border-dashed border-slate-200 rounded-lg text-center">
                        No hay asistentes asignados a este agente.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {currentAssistants.map((ast) => (
                          <div
                            key={ast.id}
                            className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 p-2.5"
                          >
                            <div>
                              <span className="font-semibold text-slate-900 block">{ast.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono">{ast.email}</span>
                            </div>
                            <button
                              type="button"
                              disabled={isLinking}
                              onClick={() => handleRemoveAssistant(ast.id)}
                              className="rounded bg-rose-50 border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-50"
                            >
                              Remover
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add Assistant Section */}
                    <div className="border-t border-slate-100 pt-4 mt-4 space-y-2">
                      <label className="block font-semibold text-indigo-900 text-xs">
                        + Agregar Asistente
                      </label>

                      {currentAssistants.length >= 4 ? (
                        <div className="rounded-md bg-amber-50 p-2.5 text-xs text-amber-800 border border-amber-200 font-medium">
                          Has alcanzado el máximo de 4 asistentes permitidos.
                        </div>
                      ) : availableAssistants.length === 0 ? (
                        <div className="rounded-md bg-amber-50 p-2.5 text-xs text-amber-800 border border-amber-200">
                          No hay usuarios con rol Asistente disponibles para agregar. Cree o edite un usuario a rol Asistente para poder vincularlo.
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedAssistantToAdd}
                            onChange={(e) => setSelectedAssistantToAdd(e.target.value)}
                            className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="">-- Seleccionar Asistente --</option>
                            {availableAssistants.map((ast) => (
                              <option key={ast.id} value={ast.id}>
                                {ast.name} ({ast.email})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!selectedAssistantToAdd || isLinking}
                            onClick={handleAddAssistant}
                            className="rounded-md bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                          >
                            {isLinking ? 'Agregando...' : 'Agregar'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Assistant View: Viewing Assisted Agents */}
                {managingUser.role === 'assistant' && (
                  <div>
                    <span className="block font-semibold text-slate-700 uppercase text-[11px] tracking-wider mb-2">
                      Agentes a los que Asiste
                    </span>

                    {loadingRelationships ? (
                      <p className="text-xs text-slate-400 italic py-3 text-center">Cargando agentes...</p>
                    ) : currentAssists.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-3 border border-dashed border-slate-200 rounded-lg text-center">
                        Este asistente no está asignado a ningún agente actualmente.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {currentAssists.map((agent) => (
                          <div
                            key={agent.id}
                            className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 p-2.5"
                          >
                            <div>
                              <span className="font-semibold text-slate-900 block">{agent.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono">{agent.email}</span>
                            </div>
                            <span className="rounded bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                              Agente Titular
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end border-t border-slate-100 pt-3 mt-4">
                <button
                  type="button"
                  onClick={() => setManagingUser(null)}
                  className="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </CrmPageContainer>
    </DashboardLayout>
  );
}
