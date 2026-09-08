'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [unsubscribedEmail, setUnsubscribedEmail] = useState('');

  const handleUnsubscribe = async () => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid or missing unsubscribe link.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/marketing/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setStatus('error');
        setMessage(data.error || 'Failed to process unsubscribe request.');
      } else {
        setStatus('success');
        setMessage('You have been successfully unsubscribed from marketing communications.');
        if (data.email) setUnsubscribedEmail(data.email);
      }
    } catch (err: any) {
      setStatus('error');
      setMessage('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-8 space-y-6 text-center">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
          ✉️
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-extrabold text-slate-900">Email Preferences</h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            Manage your subscription preferences for SmarTrack CRM marketing and policy update communications.
          </p>
        </div>

        {status === 'idle' && (
          <div className="space-y-4 pt-2">
            {!token ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-semibold">
                Invalid or incomplete unsubscribe link.
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-600 font-medium">
                  Click the button below to opt out of future marketing emails.
                </p>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleUnsubscribe}
                  className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-extrabold text-xs rounded-xl shadow-md transition-all disabled:opacity-50"
                >
                  {loading ? 'Processing Unsubscribe...' : 'Confirm Unsubscribe'}
                </button>
              </div>
            )}
          </div>
        )}

        {status === 'success' && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 text-emerald-900 text-xs">
            <span className="text-lg">✓</span>
            <p className="font-extrabold">{message}</p>
            {unsubscribedEmail && (
              <p className="text-[11px] text-emerald-700">
                Email address: <strong>{unsubscribedEmail}</strong>
              </p>
            )}
            <p className="text-[10px] text-emerald-600 pt-2">
              You will no longer receive marketing campaigns from this sender.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2 text-rose-900 text-xs">
            <span className="text-lg">⚠️</span>
            <p className="font-extrabold">{message}</p>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              className="mt-2 px-3 py-1 bg-white border border-rose-200 text-rose-700 text-[11px] font-bold rounded-lg"
            >
              Try Again
            </button>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 text-[10px] text-slate-400 font-medium">
          SmarTrack CRM • Compliant Email Marketing Delivery System
        </div>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-100 flex items-center justify-center font-sans text-xs text-slate-500">Loading...</div>}>
      <UnsubscribeContent />
    </Suspense>
  );
}
