'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessLines } from '@/contexts/BusinessLinesContext';
import { supabase } from '@/lib/supabaseClient';
import ClientConsentHeaderControl from '@/components/consents/ClientConsentHeaderControl';

interface HealthClientHeaderProps {
  clientId: string;
  clientName: string;
  photoUrl?: string | null;
  lastUpdated?: string | null;
  onSendEmail?: () => void;
  onConsent?: () => void;
  onDeleteProfile?: () => void;
  onPhotoUpdated?: (newPhotoUrl: string | null) => void;
  isCompanyClient?: boolean;
  activeSection?: 'overview' | 'personal-information' | 'health' | 'medicare' | 'supplemental' | 'life' | 'policies' | 'documents' | 'notes' | 'consents' | 'timeline';
}

export default function HealthClientHeader({
  clientId,
  clientName,
  photoUrl,
  lastUpdated,
  onSendEmail,
  onConsent,
  onDeleteProfile,
  onPhotoUpdated,
  isCompanyClient = false,
  activeSection = 'health',
}: HealthClientHeaderProps) {
  const router = useRouter();
  const { isLineEnabled } = useBusinessLines();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const [isViewPhotoModalOpen, setIsViewPhotoModalOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(photoUrl || null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCurrentPhoto(photoUrl || null);
  }, [photoUrl]);

  // Fallback to localStorage if photo was saved locally
  useEffect(() => {
    if (!photoUrl && typeof window !== 'undefined' && clientId) {
      try {
        const saved = localStorage.getItem(`smartrack:client-photo:${clientId}`);
        if (saved) setCurrentPhoto(saved);
      } catch {}
    }
  }, [clientId, photoUrl]);

  const getInitials = (name: string) => {
    if (!name) return 'C';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingPhoto(true);
      setShowPhotoMenu(false);

      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        setCurrentPhoto(dataUrl);

        try {
          // Attempt update on database
          await supabase.from('clients').update({ photo_url: dataUrl }).eq('id', clientId);
          localStorage.setItem(`smartrack:client-photo:${clientId}`, dataUrl);
        } catch (err) {
          console.warn('DB photo save warning:', err);
        }

        if (onPhotoUpdated) onPhotoUpdated(dataUrl);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Photo upload error:', err);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    try {
      setShowPhotoMenu(false);
      setCurrentPhoto(null);
      try {
        await supabase.from('clients').update({ photo_url: null }).eq('id', clientId);
        localStorage.removeItem(`smartrack:client-photo:${clientId}`);
      } catch {}
      if (onPhotoUpdated) onPhotoUpdated(null);
    } catch (err) {
      console.error('Remove photo error:', err);
    }
  };

  const navTab = (label: string, section: string, isActive: boolean) => (
    <button
      key={section}
      type="button"
      onClick={() => router.push(`/clients/${clientId}?section=${section}`)}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
        isActive
          ? 'bg-blue-50 text-blue-700 border border-blue-100 font-extrabold shadow-2xs'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );

  const activeBadgeLabel = activeSection === 'medicare'
    ? 'Medicare Active'
    : activeSection === 'supplemental'
    ? 'Supplemental Active'
    : activeSection === 'life'
    ? 'Life Active'
    : activeSection === 'policies'
    ? 'P&C Active'
    : activeSection === 'health'
    ? 'Health Active'
    : activeSection === 'consents'
    ? 'Consents Active'
    : 'Client Profile';

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 font-sans shadow-2xs">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhotoSelect}
        accept="image/*"
        className="hidden"
      />

      {/* Left side: Back arrow, Avatar, Name & Level 1 Client Profile Navigation */}
      <div className="flex flex-wrap items-center gap-4 min-w-0 flex-1">
        <div className="flex items-center gap-3.5 shrink-0">
          <button
            type="button"
            onClick={() => router.push('/clients')}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
            title="Back to Clients List"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Interactive Zoho-style Avatar/Photo Box */}
          <div className="relative">
            <div
              onClick={() => setShowPhotoMenu(!showPhotoMenu)}
              className="relative group cursor-pointer w-12 h-12 md:w-14 md:h-14 rounded-full overflow-hidden shrink-0 border-2 border-slate-200 hover:border-blue-500 transition-all shadow-xs"
              title="Click to edit profile picture"
            >
              {currentPhoto ? (
                <img
                  src={currentPhoto}
                  alt={clientName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-blue-600 text-white font-extrabold text-base md:text-lg flex items-center justify-center">
                  {getInitials(clientName)}
                </div>
              )}
              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold transition-opacity">
                📷 Edit
              </div>
            </div>

            {/* Compact Photo Interaction Menu Modal */}
            {showPhotoMenu && (
              <div className="absolute top-full left-0 mt-2 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 w-44 font-sans animate-fadeIn text-xs">
                {currentPhoto && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowPhotoMenu(false);
                      setIsViewPhotoModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-100 hover:text-blue-600 rounded-xl font-bold transition-colors flex items-center gap-2"
                  >
                    <span>👁️</span> View Photo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowPhotoMenu(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-100 hover:text-blue-600 rounded-xl font-bold transition-colors flex items-center gap-2"
                >
                  <span>📷</span> {currentPhoto ? 'Change Photo' : 'Upload Photo'}
                </button>
                {currentPhoto && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowPhotoMenu(false);
                      handleRemovePhoto();
                    }}
                    className="w-full text-left px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl font-bold transition-colors flex items-center gap-2 border-t border-slate-100 mt-1"
                  >
                    <span>🗑️</span> Remove Photo
                  </button>
                )}
              </div>
            )}
          </div>

          {/* View Client Profile Photo Preview Modal */}
          {isViewPhotoModalOpen && currentPhoto && (
            <div
              className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
              onClick={() => setIsViewPhotoModalOpen(false)}
            >
              <div
                className="bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden max-w-lg w-full font-sans animate-scaleIn"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">{clientName || 'Client Photo'}</h3>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Profile Photo Preview</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsViewPhotoModalOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center transition-colors text-sm"
                    title="Close preview"
                  >
                    ✕
                  </button>
                </div>

                {/* Body - Full image visible with object-fit: contain */}
                <div className="p-6 bg-slate-50/50 flex items-center justify-center min-h-[250px] max-h-[70vh]">
                  <img
                    src={currentPhoto}
                    alt={clientName || 'Client Photo'}
                    className="max-w-full max-h-[60vh] w-auto h-auto object-contain rounded-2xl shadow-sm border border-slate-200/80"
                    onError={() => {
                      setIsViewPhotoModalOpen(false);
                      alert('Could not load profile photo preview.');
                    }}
                  />
                </div>

                {/* Footer */}
                <div className="px-5 py-3.5 bg-white border-t border-slate-100 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setIsViewPhotoModalOpen(false)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] md:text-[24px] font-bold text-slate-950 tracking-tight leading-tight">
                {clientName || 'Client Profile'}
              </h1>
              <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-wider">
                {activeBadgeLabel}
              </span>
            </div>
            {lastUpdated && (
              <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
                Last updated: {lastUpdated}
              </span>
            )}
          </div>
        </div>

        {/* Level 1 Dynamic Navigation beside Client Profile identity */}
        <nav className="flex flex-wrap items-center gap-1 border-l border-slate-200 pl-4 py-0.5 font-sans">
          {navTab('Overview', 'overview', activeSection === 'overview')}
          {navTab(isCompanyClient ? 'Company Information' : 'Personal Info', 'personal-information', activeSection === 'personal-information')}
          {isLineEnabled('health') && navTab('Health', 'health', activeSection === 'health')}
          {isLineEnabled('medicare') && navTab('Medicare', 'medicare', activeSection === 'medicare')}
          {isLineEnabled('supplemental') && navTab('Supplemental', 'supplemental', activeSection === 'supplemental')}
          {!isCompanyClient && isLineEnabled('life') && navTab('Life', 'life', activeSection === 'life')}
          {isLineEnabled('property_casualty') && navTab('Property & Casualty', 'policies', activeSection === 'policies')}
          {navTab('Documents', 'documents', activeSection === 'documents')}
          {navTab('Notes', 'notes', activeSection === 'notes')}
          {navTab('Consents', 'consents', activeSection === 'consents')}
          {navTab('Timeline', 'timeline', activeSection === 'timeline')}
        </nav>
      </div>

      {/* Right side: Action Buttons */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onSendEmail}
          className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition-all shadow-2xs flex items-center gap-1.5"
        >
          <span>✉️</span> Send Email
        </button>

        <ClientConsentHeaderControl
          clientId={clientId}
          clientName={clientName}
          onSendConsent={onConsent || (() => {})}
        />

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className="p-1.5 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-2xs"
            title="More Options"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>

          {showMoreMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-50 animate-fadeIn">
              {onDeleteProfile && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onDeleteProfile();
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  Delete Client Profile
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
