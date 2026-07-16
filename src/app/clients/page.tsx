'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/lib/supabaseClient';

interface Client {
  id: string;
  agent_id: string;
  full_name: string;
  agency_name: string;
  address: string;
  email: string;
  phone: string;
  created_at: string;
  updated_at: string;
  policies?: { id: string }[];
}

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Add/Edit Client Modals State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const [formName, setFormName] = useState('');
  const [formAgency, setFormAgency] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load clients and current user
  const loadClients = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setCurrentUser(user);

      // Fetch clients with their policies (to calculate policy count)
      const { data, error } = await supabase
        .from('clients')
        .select('*, policies(id)')
        .eq('agent_id', user.id)
        .order('full_name', { ascending: true });

      if (error) throw error;
      setClients(data || []);
    } catch (err: any) {
      console.error('Error fetching clients:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  // Filter clients by search query
  const filteredClients = clients.filter((client) => {
    const query = searchQuery.toLowerCase();
    return (
      client.full_name?.toLowerCase().includes(query) ||
      client.email?.toLowerCase().includes(query) ||
      client.phone?.toLowerCase().includes(query)
    );
  });

  // Open modals
  const handleOpenAddModal = () => {
    setFormError(null);
    setFormName('');
    setFormAgency('');
    setFormAddress('');
    setFormEmail('');
    setFormPhone('');
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    setFormError(null);
    setSelectedClient(client);
    setFormName(client.full_name || '');
    setFormAgency(client.agency_name || '');
    setFormAddress(client.address || '');
    setFormEmail(client.email || '');
    setFormPhone(client.phone || '');
    setIsEditModalOpen(true);
  };

  // Add client submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!formName.trim()) {
      setFormError('Client name is required.');
      return;
    }

    setFormSaving(true);
    setFormError(null);

    try {
      const { data, error } = await supabase
        .from('clients')
        .insert({
          agent_id: currentUser.id,
          full_name: formName.trim(),
          agency_name: formAgency.trim() || null,
          address: formAddress.trim() || null,
          email: formEmail.trim() || null,
          phone: formPhone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      setIsAddModalOpen(false);
      loadClients(); // Reload list
    } catch (err: any) {
      setFormError(err?.message || 'Failed to add client.');
    } finally {
      setFormSaving(false);
    }
  };

  // Edit client submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedClient) return;
    if (!formName.trim()) {
      setFormError('Client name is required.');
      return;
    }

    setFormSaving(true);
    setFormError(null);

    try {
      const { error } = await supabase
        .from('clients')
        .update({
          full_name: formName.trim(),
          agency_name: formAgency.trim() || null,
          address: formAddress.trim() || null,
          email: formEmail.trim() || null,
          phone: formPhone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedClient.id);

      if (error) throw error;

      setIsEditModalOpen(false);
      loadClients(); // Reload list
    } catch (err: any) {
      setFormError(err?.message || 'Failed to update client.');
    } finally {
      setFormSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Clients</h1>
            <p className="text-slate-500 mt-1 text-sm">Manage your assigned insurance clients and policies.</p>
          </div>
          <div>
            <button
              onClick={handleOpenAddModal}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-sm font-semibold px-5 py-3 rounded-xl transition-all shadow-md shadow-blue-500/10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              Add Client
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center">
          <div className="relative w-full max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by client name, email or phone..."
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
            />
          </div>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="flex justify-center items-center py-20 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <svg className="w-12 h-12 text-slate-350 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h3 className="text-base font-semibold text-slate-800">No clients found</h3>
            <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">
              {searchQuery ? 'Adjust your search queries or clear the field.' : 'Add your first client to start configuring insurance policies.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4">Client Name</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Phone</th>
                    <th className="px-6 py-4 text-center">Policies</th>
                    <th className="px-6 py-4">Last Updated</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClients.map((client) => (
                    <tr
                      key={client.id}
                      onClick={() => router.push(`/clients/${client.id}`)}
                      className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 font-semibold text-slate-900">{client.full_name}</td>
                      <td className="px-6 py-4 text-slate-600">{client.email || '-'}</td>
                      <td className="px-6 py-4 text-slate-600">{client.phone || '-'}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full text-xs font-bold border border-blue-100">
                          {client.policies?.length || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {new Date(client.updated_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-6 py-4 text-right space-x-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleOpenEditModal(client, e)}
                          className="text-blue-600 hover:text-blue-800 font-semibold transition-colors"
                        >
                          Edit
                        </button>
                        <Link
                          href={`/clients/${client.id}`}
                          className="text-slate-600 hover:text-slate-900 font-semibold transition-colors"
                        >
                          Profile →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Client Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white border border-slate-100 rounded-2xl shadow-2xl p-6 md:p-8 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <h3 className="text-xl font-bold text-slate-900">Add New Client</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Full Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  placeholder="e.g. Robert Smith"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Agency Name</label>
                <input
                  type="text"
                  value={formAgency}
                  onChange={(e) => setFormAgency(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  placeholder="e.g. Summit Insurance"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Email Address</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  placeholder="e.g. robert@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  placeholder="e.g. (305) 555-0199"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Street Address</label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  placeholder="e.g. 742 Evergreen Terrace, Miami, FL"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl px-5 py-2.5 text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-all shadow-md disabled:opacity-50"
                >
                  {formSaving ? 'Saving...' : 'Add Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white border border-slate-100 rounded-2xl shadow-2xl p-6 md:p-8 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <h3 className="text-xl font-bold text-slate-900">Edit Client Details</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-sm">
                {formError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Full Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  placeholder="e.g. Robert Smith"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Agency Name</label>
                <input
                  type="text"
                  value={formAgency}
                  onChange={(e) => setFormAgency(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  placeholder="e.g. Summit Insurance"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Email Address</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  placeholder="e.g. robert@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  placeholder="e.g. (305) 555-0199"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Street Address</label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm outline-none transition-all"
                  placeholder="e.g. 742 Evergreen Terrace, Miami, FL"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl px-5 py-2.5 text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-all shadow-md disabled:opacity-50"
                >
                  {formSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
