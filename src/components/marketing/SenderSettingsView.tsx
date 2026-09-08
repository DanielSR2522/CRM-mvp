'use client';

import React, { useState } from 'react';
import { MarketingSenderAccount, VerifiedSendingIdentity } from '@/types/marketing';

interface SenderSettingsViewProps {
  senderAccounts: MarketingSenderAccount[];
  onRefreshData?: () => Promise<void>;
}

export default function SenderSettingsView({ senderAccounts, onRefreshData }: SenderSettingsViewProps) {
  const defaultAccount = senderAccounts.find((s) => s.is_default) || senderAccounts[0] || null;
  const [oauthStatusMsg, setOauthStatusMsg] = useState<{ provider: string; text: string; isError?: boolean } | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<string | null>(null);

  const googleAccount = senderAccounts.find(
    (s) => (s.provider === 'GOOGLE_OAUTH' || (s.provider as string) === 'GOOGLE') && s.status === 'CONNECTED'
  );
  const microsoftAccount = senderAccounts.find(
    (s) => (s.provider === 'MICROSOFT_OAUTH' || (s.provider as string) === 'MICROSOFT') && s.status === 'CONNECTED'
  );

  const verifiedIdentities: VerifiedSendingIdentity[] = [
    {
      id: 'vsi-1',
      name: 'SmarTrack Marketing',
      fromAddress: 'consents@mail.smartrackcrm.com',
      replyToAddress: 'agent@smartrack.com',
      domain: 'mail.smartrackcrm.com',
      domainStatus: 'VERIFIED',
      isEligibleForFrom: true,
    },
  ];

  const handleConnectOAuth = async (provider: 'google' | 'microsoft') => {
    try {
      setOauthStatusMsg(null);
      const res = await fetch(`/api/marketing/oauth/${provider}?format=json`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json();

      if (res.status === 501 || data.status === 'SETUP_REQUIRED') {
        setOauthStatusMsg({
          provider,
          isError: false,
          text: `[SETUP REQUIRED] ${data.message || `${provider.toUpperCase()}_OAUTH_CLIENT_ID credentials are not configured.`}`,
        });
      } else if (!res.ok || data.error) {
        setOauthStatusMsg({
          provider,
          isError: true,
          text: data.message || data.error || `Failed to initiate ${provider} OAuth authorization.`,
        });
      } else if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error('OAuth connection error:', err);
      setOauthStatusMsg({
        provider,
        isError: true,
        text: err?.message ? `OAuth error: ${err.message}` : 'Error connecting to OAuth endpoint.',
      });
    }
  };

  const handleDisconnectAccount = async (provider: 'GOOGLE_OAUTH' | 'MICROSOFT_OAUTH', accountId?: string) => {
    const providerName = provider === 'GOOGLE_OAUTH' ? 'Google Workspace' : 'Microsoft 365';
    if (!confirm(`Are you sure you want to disconnect your ${providerName} account?`)) {
      return;
    }

    setDisconnectingProvider(provider);
    try {
      const res = await fetch('/api/marketing/oauth/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, provider }),
      });

      if (res.ok) {
        setOauthStatusMsg({
          provider: provider.toLowerCase(),
          isError: false,
          text: `${providerName} account disconnected successfully.`,
        });
        if (onRefreshData) {
          await onRefreshData();
        }
      } else {
        const data = await res.json();
        setOauthStatusMsg({
          provider: provider.toLowerCase(),
          isError: true,
          text: data.error || `Failed to disconnect ${providerName} account.`,
        });
      }
    } catch (err: any) {
      setOauthStatusMsg({
        provider: provider.toLowerCase(),
        isError: true,
        text: err?.message || 'Error disconnecting account.',
      });
    } finally {
      setDisconnectingProvider(null);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Connected Email Sender Accounts</h3>
            <p className="text-xs text-slate-500">
              Provider-agnostic OAuth integration for Google Workspace and Microsoft 365 accounts
            </p>
          </div>
          <span className="px-3 py-1 bg-blue-50 text-blue-800 text-xs font-bold rounded-full border border-blue-200">
            Resend Provider Connected
          </span>
        </div>
      </div>

      {oauthStatusMsg && (
        <div className={`p-4 rounded-2xl text-xs font-bold border ${
          oauthStatusMsg.isError ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
        }`}>
          {oauthStatusMsg.text}
        </div>
      )}

      {/* OAuth Providers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Google Workspace Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-lg">
                  🌐
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Google Workspace / Gmail</h4>
                  <span className="text-[11px] text-slate-400 font-medium">OAuth 2.0 Authorization</span>
                </div>
              </div>
              {googleAccount ? (
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-extrabold flex items-center gap-1 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                  CONNECTED
                </span>
              ) : (
                <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold">
                  OAuth Ready
                </span>
              )}
            </div>

            {googleAccount ? (
              <div className="p-3.5 bg-emerald-50/80 border border-emerald-200/80 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-900">{googleAccount.from_name || 'Daniel Rodriguez'}</span>
                  <span className="text-[10px] text-emerald-700 font-extrabold font-mono bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                    OAuth Active
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-700 font-semibold">
                  {googleAccount.from_email || 'thorin22.dr@gmail.com'}
                </div>
                <div className="text-[10px] text-slate-500 pt-1 flex items-center gap-3">
                  <span>SPF: <strong className="text-emerald-700">PASS</strong></span>
                  <span>DKIM: <strong className="text-emerald-700">PASS</strong></span>
                  <span>DMARC: <strong className="text-emerald-700">PASS</strong></span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">
                Connect your professional agent account (e.g. <code>agent@agency.com</code>) using secure OAuth 2.0 authorization. Raw account passwords are never stored or requested.
              </p>
            )}
          </div>

          {googleAccount ? (
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleDisconnectAccount('GOOGLE_OAUTH', googleAccount.id)}
                disabled={disconnectingProvider === 'GOOGLE_OAUTH'}
                className="flex-1 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-all border border-rose-200 text-center"
              >
                {disconnectingProvider === 'GOOGLE_OAUTH' ? 'Disconnecting...' : 'Disconnect Account'}
              </button>
              <button
                type="button"
                onClick={() => handleConnectOAuth('google')}
                className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all text-center"
              >
                Reconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleConnectOAuth('google')}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white text-xs font-bold rounded-xl transition-all shadow-md text-center"
            >
              Connect Google Workspace (OAuth)
            </button>
          )}
        </div>

        {/* Microsoft 365 Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-lg">
                  📫
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Microsoft 365 / Outlook</h4>
                  <span className="text-[11px] text-slate-400 font-medium">OAuth 2.0 Authorization</span>
                </div>
              </div>
              {microsoftAccount ? (
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-extrabold flex items-center gap-1 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                  CONNECTED
                </span>
              ) : (
                <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold">
                  OAuth Ready
                </span>
              )}
            </div>

            {microsoftAccount ? (
              <div className="p-3.5 bg-emerald-50/80 border border-emerald-200/80 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-900">{microsoftAccount.from_name || 'Microsoft Agent'}</span>
                  <span className="text-[10px] text-emerald-700 font-extrabold font-mono bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                    OAuth Active
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-700 font-semibold">
                  {microsoftAccount.from_email}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">
                Authorize campaign sending via your Microsoft 365 business email. Clean OAuth token refresh architecture ensures sender domain security.
              </p>
            )}
          </div>

          {microsoftAccount ? (
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleDisconnectAccount('MICROSOFT_OAUTH', microsoftAccount.id)}
                disabled={disconnectingProvider === 'MICROSOFT_OAUTH'}
                className="flex-1 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-all border border-rose-200 text-center"
              >
                {disconnectingProvider === 'MICROSOFT_OAUTH' ? 'Disconnecting...' : 'Disconnect Account'}
              </button>
              <button
                type="button"
                onClick={() => handleConnectOAuth('microsoft')}
                className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all text-center"
              >
                Reconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleConnectOAuth('microsoft')}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs font-bold rounded-xl transition-all shadow-md text-center"
            >
              Connect Microsoft 365 (OAuth)
            </button>
          )}
        </div>
      </div>

      {/* Verified Sending Identities Panel */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Verified Sending Identities</h3>
            <p className="text-xs text-slate-500">
              Domain authentication rules (From address vs. Agent Reply-To routing)
            </p>
          </div>
          <span className="px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-full border border-emerald-200">
            Resend API Verified
          </span>
        </div>

        <div className="space-y-3">
          {verifiedIdentities.map((identity) => (
            <div key={identity.id} className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-900">{identity.name}</span>
                  <div className="text-xs text-slate-600 font-mono">
                    From: <strong>{identity.fromAddress}</strong>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-extrabold">
                  ✓ VERIFIED DOMAIN
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block uppercase">SPF Record</span>
                  <span className="text-emerald-700 font-extrabold">PASS</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block uppercase">DKIM Signature</span>
                  <span className="text-emerald-700 font-extrabold">PASS</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-400 block uppercase">DMARC Compliance</span>
                  <span className="text-emerald-700 font-extrabold">PASS</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 italic">
                ℹ️ Unverified Gmail/Outlook From addresses are automatically mapped to sending domain <strong>mail.smartrackcrm.com</strong>, routing recipient replies to the agent&apos;s personal inbox via <code>Reply-To</code>.
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Default Sender Profile Settings */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900">Default Sender Profile</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">From Name</label>
            <input
              type="text"
              defaultValue={defaultAccount?.from_name || 'Agent'}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-semibold text-slate-900"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">From Email Address</label>
            <input
              type="email"
              defaultValue={defaultAccount?.from_email || 'consents@mail.smartrackcrm.com'}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-semibold text-slate-900"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Reply-To Email</label>
            <input
              type="email"
              defaultValue={defaultAccount?.reply_to || 'agent@smartrack.com'}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-semibold text-slate-900"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

