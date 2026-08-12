'use client';

import React, { useState, useEffect } from 'react';
import { MedicationEntry } from '@/types/medicare';

interface Props {
  isOpen: boolean;
  initialData?: MedicationEntry | null;
  onClose: () => void;
  onSave: (data: Partial<MedicationEntry>) => Promise<void>;
}

export default function MedicationEntryModal({
  isOpen,
  initialData,
  onClose,
  onSave,
}: Props) {
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setDosage(initialData.dosage || '');
      setFrequency(initialData.frequency || '');
      setInstructions(initialData.instructions || '');
    } else {
      setName('');
      setDosage('');
      setFrequency('');
      setInstructions('');
    }
    setError(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const isEdit = Boolean(initialData && initialData.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Medication Name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: Partial<MedicationEntry> = {
        name: name.trim(),
        dosage: dosage.trim() || null,
        frequency: frequency.trim() || null,
        instructions: instructions.trim() || null,
      };
      if (initialData?.id) payload.id = initialData.id;

      await onSave(payload);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save medication.');
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
            {isEdit ? 'Edit Medication' : 'Add Medication'}
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

          {/* Medication Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Medication Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Metformin, Lisinopril, Atorvastatin"
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition-all"
            />
          </div>

          {/* Dosage */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Dosage
            </label>
            <input
              type="text"
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              placeholder="e.g. 500 mg, 10 mg, 20 mg"
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition-all"
            />
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Frequency
            </label>
            <input
              type="text"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              placeholder="e.g. 2 times daily, Once at bedtime"
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition-all"
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Instructions
            </label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Take with meals, Avoid grapefruit"
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition-all"
            />
          </div>

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
