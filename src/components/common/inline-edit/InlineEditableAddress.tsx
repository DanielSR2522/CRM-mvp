'use client';

import React, { useState, useEffect } from 'react';
import InlineEditActions from './InlineEditActions';
import GoogleAddressAutocomplete, { NormalizedAddress } from '@/components/address/GoogleAddressAutocomplete';
import { US_STATES_52, normalizeStateToCode, getStateDisplayLabel } from '@/utils/usStates';
import { BASE_INLINE_INPUT_CLASSES, BASE_INLINE_SELECT_CLASSES } from './editorStyles';

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
  const [draftState, setDraftState] = useState(normalizeStateToCode(data.state));
  const [draftZip, setDraftZip] = useState(data.zip_code || '');
  const [draftCountry, setDraftCountry] = useState(data.country || 'United States');
  const [draftCounty, setDraftCounty] = useState(data.county || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftAddress(data.address || '');
    setDraftCity(data.city || '');
    setDraftState(normalizeStateToCode(data.state));
    setDraftZip(data.zip_code || '');
    setDraftCountry(data.country || 'United States');
    setDraftCounty(data.county || '');
  }, [data]);

  const handleStartEdit = () => {
    if (disabled) return;
    setDraftAddress(data.address || '');
    setDraftCity(data.city || '');
    setDraftState(normalizeStateToCode(data.state));
    setDraftZip(data.zip_code || '');
    setDraftCountry(data.country || 'United States');
    setDraftCounty(data.county || '');
    setError(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraftAddress(data.address || '');
    setDraftCity(data.city || '');
    setDraftState(normalizeStateToCode(data.state));
    setDraftZip(data.zip_code || '');
    setDraftCountry(data.country || 'United States');
    setDraftCounty(data.county || '');
    setError(null);
    setIsEditing(false);
  };

  const handleGoogleAddressSelected = (normalized: NormalizedAddress) => {
    setDraftAddress(normalized.streetAddress || draftAddress);
    setDraftCity(normalized.city || draftCity);
    const code = normalizeStateToCode(normalized.state || draftState);
    setDraftState(code);
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
        state: normalizeStateToCode(draftState),
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

  const stateLabel = getStateDisplayLabel(data.state);

  return (
    <div className={`w-full font-sans ${className}`}>
      {label && <span className="block text-[15px] font-normal text-[#52627A] leading-snug mb-1">{label}</span>}

      {isEditing ? (
        <div className="space-y-3 p-3 bg-white border border-slate-300 rounded-md transition-all" onKeyDown={handleKeyDown}>
          <div>
            <label className="block text-[13px] font-normal text-[#52627A] mb-1">Street Address</label>
            <GoogleAddressAutocomplete
              value={draftAddress}
              onChange={val => setDraftAddress(val)}
              onAddressSelected={handleGoogleAddressSelected}
              placeholder="Search or enter street address..."
              disabled={saving}
              className={`${BASE_INLINE_INPUT_CLASSES} w-full max-w-[320px]`}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[13px] font-normal text-[#52627A] mb-1">City</label>
              <input
                type="text"
                value={draftCity}
                onChange={e => setDraftCity(e.target.value)}
                disabled={saving}
                className={`${BASE_INLINE_INPUT_CLASSES} w-full max-w-[260px]`}
              />
            </div>
            <div>
              <label className="block text-[13px] font-normal text-[#52627A] mb-1">State</label>
              <select
                value={normalizeStateToCode(draftState)}
                onChange={e => setDraftState(e.target.value)}
                disabled={saving}
                className={`${BASE_INLINE_SELECT_CLASSES} w-full max-w-[260px]`}
              >
                <option value="">Select State...</option>
                {US_STATES_52.map(s => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-normal text-[#52627A] mb-1">ZIP Code</label>
              <input
                type="text"
                value={draftZip}
                onChange={e => setDraftZip(e.target.value)}
                disabled={saving}
                className={`${BASE_INLINE_INPUT_CLASSES} w-full max-w-[180px]`}
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-normal text-[#52627A] mb-1">County</label>
            <input
              type="text"
              value={draftCounty}
              onChange={e => setDraftCounty(e.target.value)}
              disabled={saving}
              placeholder="County..."
              className={`${BASE_INLINE_INPUT_CLASSES} w-full max-w-[260px]`}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400 font-normal">Ctrl+Enter to save, Esc to cancel</span>
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
            <div className="text-[15px] font-normal text-[#253247]">
              {data.address || <span className="text-slate-400 font-normal italic">{emptyDisplay}</span>}
            </div>
            {(data.city || data.state || data.zip_code || data.county) && (
              <div className="text-[14px] text-[#52627A] font-normal">
                {[data.city, stateLabel !== '—' ? stateLabel : data.state, data.zip_code, data.county ? `${data.county} County` : ''].filter(Boolean).join(', ')}
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
