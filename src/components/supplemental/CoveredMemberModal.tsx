'use client';

import React, { useState, useEffect } from 'react';
import DatePicker from '@/components/ui/DatePicker';
import { SupplementalCoveredMember, SupplementalRelationship } from '@/types/supplemental';

interface Props {
  isOpen: boolean;
  initialData?: SupplementalCoveredMember | null;
  onClose: () => void;
  onSave: (data: Partial<SupplementalCoveredMember>) => Promise<void>;
}

const RELATIONSHIP_OPTIONS: SupplementalRelationship[] = [
  'Self',
  'Spouse',
  'Child',
  'Dependent',
  'Other',
];

export default function CoveredMemberModal({
  isOpen,
  initialData,
  onClose,
  onSave,
}: Props) {
  const [fullName, setFullName] = useState<string>('');
  const [relationship, setRelationship] = useState<string>('Self');
  const [phone, setPhone] = useState<string>('');
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFullName(initialData.full_name || '');
      setRelationship(initialData.relationship || 'Self');
      setPhone(initialData.phone || '');
      setBirthDate(initialData.birth_date || null);
      setMemberId(initialData.member_id || '');
    } else {
      setFullName('');
      setRelationship('Self');
      setPhone('');
      setBirthDate(null);
      setMemberId('');
    }
    setError(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Full Name is required.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: initialData?.id,
        full_name: fullName.trim(),
        relationship: relationship || 'Self',
        phone: phone.trim() || null,
        birth_date: birthDate || null,
        member_id: memberId.trim() || null,
      });
      onClose();
    } catch (err: any) {
      console.error('Error saving Covered Person:', err);
      setError(err?.message || 'Failed to save covered person.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 font-sans">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="text-base font-extrabold text-slate-800">
              {initialData ? 'Edit Covered Person' : 'Add Covered Person'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Specify covered member name, relationship, and date of birth.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Jane Doe"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none placeholder:text-slate-400"
            />
          </div>

          {/* Relationship */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Relationship
            </label>
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            >
              {RELATIONSHIP_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Phone Number
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 305-555-0199"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none placeholder:text-slate-400"
            />
          </div>

          {/* Birth Date */}
          <div>
            <DatePicker
              label="Birth Date"
              value={birthDate}
              onChange={(isoDate) => setBirthDate(isoDate)}
              placeholder="MM/DD/YYYY"
              optional
            />
          </div>

          {/* Member ID Optional */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Member ID (Optional)
            </label>
            <input
              type="text"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="Unique member ID if applicable"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none placeholder:text-slate-400"
            />
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10 disabled:opacity-50"
            >
              {saving ? 'Saving...' : initialData ? 'Save Person' : 'Add Person'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
