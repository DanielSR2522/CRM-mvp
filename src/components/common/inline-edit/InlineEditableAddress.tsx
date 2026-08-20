'use client';

import React, { useState, useEffect } from 'react';
import InlineEditActions from './InlineEditActions';
import GoogleAddressAutocomplete, { NormalizedAddress } from '@/components/address/GoogleAddressAutocomplete';

export interface AddressGroupData {
  address: string;
  city: string;
  state: string;
  zip_code: string;
  country?: string;
  county?: string;
}

export interface InlineEditableAddressProps {
  data: AddressGroupData;
  onSave: (newData: AddressGroupData) => Promise<void> | void;
  label?: string;
  disabled?: boolean;
  emptyDisplay?: string;
  className?: string;
}

export default function InlineEditableAddress({
  data,
  onSave,
  label = 'Business Address',
  disabled = false,
  emptyDisplay = 'No address set',
  className = '',
}: InlineEditableAddressProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftAddress, setDraftAddress] = useState(data.address || '');
  const [draftCity, setDraftCity] = useState(data.city || '');
  const [draftState, setDraftState] = useState(data.state || '');
  const [draftZip, setDraftZip] = useState(data.zip_code || '');
  const [draftCountry, setDraftCountry] = useState(data.country || 'United States');
  const [draftCounty, setDraftCounty] = useState(data.county || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftAddress(data.address || '');
    setDraftCity(data.city || '');
    setDraftState(data.state || '');
    setDraftZip(data.zip_code || '');
    setDraftCountry(data.country || 'United States');
    setDraftCounty(data.county || '');
  }, [data]);

  const handleStartEdit = () => {
    if (disabled) return;
    setDraftAddress(data.address || '');
    setDraftCity(data.city || '');
    setDraftState(data.state || '');
    setDraftZip(data.zip_code || '');
    setDraftCountry(data.country || 'United States');
    setDraftCounty(data.county || '');
    setError(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraftAddress(data.address || '');
    setDraftCity(data.city || '');
    setDraftState(data.state || '');
    setDraftZip(data.zip_code || '');
    setDraftCountry(data.country || 'United States');
    setDraftCounty(data.county || '');
    setError(null);
    setIsEditing(false);
  };

  const handleGoogleAddressSelected = (normalized: NormalizedAddress) => {
    setDraftAddress(normalized.streetAddress || draftAddress);
    setDraftCity(normalized.city || draftCity);
    setDraftState(normalized.state || draftState);
    setDraftZip(normalized.postalCode || draftZip);
    setDraftCountry(normalized.country || draftCountry || 'United States');
    if (normalized.county) {
      setDraftCounty(normalized.county);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        address: draftAddress.trim(),
        city: draftCity.trim(),
        state: draftState.trim(),
        zip_code: draftZip.trim(),
        country: draftCountry.trim(),
        county: draftCounty.trim(),
      });
      setIsEditing(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const formattedDisplay = [
    data.address,
    [data.city, data.state, data.zip_code].filter(Boolean).join(', '),
    data.country,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <div className={`w-full font-sans ${className}`}>
      {label && <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</span>}

      {isEditing ? (
        <div className="space-y-3 p-3 bg-white border border-blue-500 ring-2 ring-blue-100 rounded-xl transition-all" onKeyDown={handleKeyDown}>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Street Address</label>
            <GoogleAddressAutocomplete
              value={draftAddress}
              onChange={val => setDraftAddress(val)}
              onAddressSelected={handleGoogleAddressSelected}
              placeholder="Search or enter street address..."
              disabled={saving}
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg px-3 py-1.5 text-xs text-slate-900 font-semibold outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">City</label>
              <input
                type="text"
                value={draftCity}
                onChange={e => setDraftCity(e.target.value)}
                disabled={saving}
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg px-2.5 py-1 text-xs text-slate-900 font-semibold outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">State</label>
              <input
                type="text"
                value={draftState}
                onChange={e => setDraftState(e.target.value)}
                disabled={saving}
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg px-2.5 py-1 text-xs text-slate-900 font-semibold outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">ZIP Code</label>
              <input
                type="text"
                value={draftZip}
                onChange={e => setDraftZip(e.target.value)}
                disabled={saving}
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg px-2.5 py-1 text-xs text-slate-900 font-semibold outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-slate-400 font-medium">Ctrl+Enter to save, Esc to cancel</span>
            <InlineEditActions onSave={handleSave} onCancel={handleCancel} saving={saving} error={error} />
          </div>
        </div>
      ) : (
        <div
          onClick={handleStartEdit}
          title={disabled ? undefined : 'Click to edit address group'}
          className={`group flex items-start justify-between py-1.5 px-2 -mx-2 rounded-lg transition-all ${
            disabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-100/80 hover:text-blue-600'
          }`}
        >
          <div className="space-y-0.5">
            <div className="text-[15px] font-semibold text-slate-950">
              {data.address || <span className="text-slate-400 font-normal italic">{emptyDisplay}</span>}
            </div>
            {(data.city || data.state || data.zip_code) && (
              <div className="text-[14px] text-slate-600 font-medium">
                {[data.city, data.state, data.zip_code].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
          {!disabled && (
            <svg
              className="w-3.5 h-3.5 text-slate-350 opacity-0 group-hover:opacity-100 transition-opacity ml-1.5 shrink-0 mt-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}
