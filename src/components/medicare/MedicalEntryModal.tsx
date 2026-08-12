'use client';

import React, { useState, useEffect } from 'react';
import { MedicalCategory } from '@/types/medicare';

interface Props {
  isOpen: boolean;
  category: MedicalCategory | null;
  initialData?: any;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}

export default function MedicalEntryModal({
  isOpen,
  category,
  initialData,
  onClose,
  onSave,
}: Props) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setAddress(initialData.address || '');
      setPhone(initialData.phone || '');
      setSpecialty(initialData.specialty || '');
      setNotes(initialData.notes || '');
    } else {
      setName('');
      setAddress('');
      setPhone('');
      setSpecialty('');
      setNotes('');
    }
    setError(null);
  }, [initialData, isOpen]);

  if (!isOpen || !category || category === 'medications') return null;

  const isEdit = Boolean(initialData && initialData.id);

  const getCategoryTitle = () => {
    switch (category) {
      case 'doctors': return 'Primary Doctor';
      case 'hospitals': return 'Hospital';
      case 'urgent_cares': return 'Urgent Care Center';
      case 'pharmacies': return 'Pharmacy';
      case 'conditions': return 'Medical Condition';
      case 'specialists': return 'Specialist';
      default: return 'Entry';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: any = {
        name: name.trim(),
      };
      if (initialData?.id) payload.id = initialData.id;

      if (['doctors', 'hospitals', 'urgent_cares', 'pharmacies', 'specialists'].includes(category)) {
        payload.address = address.trim() || null;
        payload.phone = phone.trim() || null;
      }
      if (['doctors', 'specialists'].includes(category)) {
        payload.specialty = specialty.trim() || null;
      }
      if (category === 'conditions') {
        payload.notes = notes.trim() || null;
      }

      await onSave(payload);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="text-base font-bold text-slate-800">
            {isEdit ? `Edit ${getCategoryTitle()}` : `Add ${getCategoryTitle()}`}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {category === 'conditions' ? 'Condition Name' : `${getCategoryTitle()} Name`} *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={category === 'conditions' ? 'e.g. Diabetes Type 2, Hypertension' : `e.g. Dr. Luis Perez, Baptist Hospital`}
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition-all"
            />
          </div>

          {/* Specialty (for Doctors / Specialists) */}
          {['doctors', 'specialists'].includes(category) && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Specialty
              </label>
              <input
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="e.g. Cardiology, Internal Medicine, Primary Care"
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition-all"
              />
            </div>
          )}

          {/* Address */}
          {['doctors', 'hospitals', 'urgent_cares', 'pharmacies', 'specialists'].includes(category) && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address, City, State, Zip"
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition-all"
              />
            </div>
          )}

          {/* Phone */}
          {['doctors', 'hospitals', 'urgent_cares', 'pharmacies', 'specialists'].includes(category) && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 305-555-0199"
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition-all"
              />
            </div>
          )}

          {/* Notes (for conditions) */}
          {category === 'conditions' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notes / Details
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes regarding diagnosis or history..."
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition-all"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
