'use client';

import React, { useState, useEffect } from 'react';
import { formatDateTimeMMDDYYYY } from '@/lib/carrier-portals/date-formatter';

interface OverviewTabProps {
  kpis: any;
  connection: any;
  allConnections?: any[];
  onOpenImportModal: () => void;
  onSelectTab: (tab: string) => void;
  onRefresh: () => void;
}

export default function OverviewTab({
  kpis,
  connection,
  allConnections = [],
  onOpenImportModal,
  onSelectTab,
  onRefresh,
}: OverviewTabProps) {
  const [automationLoading, setAutomationLoading] = useState<string | null>(null);
  const [automationMessage, setAutomationMessage] = useState<string | null>(null);
  const [automationError, setAutomationError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<any | null>(null);

  const connStatus = connection?.connection_status || 'never_synced';
  const isConnected = connStatus === 'connected';
  const isReauthReq = connStatus === 'reauthentication_required';
  const isAutomationEnabled = connection?.automation_enabled !== false;

  const formattedLastSuccess = connection?.last_success_at
    ? formatDateTimeMMDDYYYY(connection.last_success_at)
    : connection?.last_sync_at
    ? formatDateTimeMMDDYYYY(connection.last_sync_at)
    : 'Never Synced';

  const formattedLastAttempt = connection?.last_attempt_at
    ? formatDateTimeMMDDYYYY(connection.last_attempt_at)
    : 'None';

  const formattedNextSync = connection?.next_sync_at
    ? formatDateTimeMMDDYYYY(connection.next_sync_at)
    : 'Not Scheduled';

  const [isWorkerOnline, setIsWorkerOnline] = useState(true);
  const [activePollJobId, setActivePollJobId] = useState<string | null>(null);

  // Poll for active sync job status when a job is enqueued
  useEffect(() => {
    if (!activePollJobId) return;

    let interval: any = null;
    let pollCount = 0;
    const maxPolls = 20; // 20 * 3s = 60s max polling limit

    const checkJobStatus = async () => {
      pollCount++;
      try {
        const url = `/api/carrier-portals/automation/jobs?job_id=${activePollJobId}`;

        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const job = data.activeJob || null;
          setActiveJob(job);
          setIsWorkerOnline(data.workerOnline !== false);

          if (job) {
            // Stop polling cleanly on terminal state
            if (['completed', 'failed', 'reauthentication_required', 'skipped'].includes(job.status)) {
              if (interval) clearInterval(interval);
              setActivePollJobId(null);
              setActiveJob(null);
              setAutomationLoading(null);
              if (job.status === 'completed') {
                setAutomationMessage('✓ Sync completed successfully.');
              } else if (job.status === 'failed') {
                setAutomationError(`⚠ Sync failed: ${job.error_message || job.error_code || 'Execution error.'}`);
              }
              onRefresh();
              return;
            }
          }
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }

      if (pollCount >= maxPolls) {
        console.warn('Max polling duration reached. Stopping job polling.');
        if (interval) clearInterval(interval);
        setActivePollJobId(null);
        setActiveJob(null);
        setAutomationLoading(null);
        onRefresh();
      }
    };

    checkJobStatus();
    interval = setInterval(checkJobStatus, 3000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activePollJobId]);

  const handleSyncNow = async (carrierTarget = 'oscar') => {
    setAutomationLoading(`sync-now-${carrierTarget}`);
    setAutomationMessage(`Enqueuing manual sync job for ${carrierTarget.toUpperCase()}...`);
    setAutomationError(null);

    try {
      const res = await fetch('/api/carrier-portals/automation/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier: carrierTarget }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to queue sync.');
      }

      const jobId = json.job_id || json.job?.id;
      if (jobId) {
        setActivePollJobId(jobId);
      }

      if (json.isAlreadyRunning) {
        setAutomationMessage('✓ Sync already in progress...');
      } else if (!isWorkerOnline) {
        setAutomationMessage('⚠ Queued — carrier worker offline');
      } else {
        setAutomationMessage(`✓ Sync queued for ${carrierTarget.toUpperCase()} — waiting for worker...`);
      }
    } catch (err: any) {
      setAutomationError(err?.message || 'Failed to queue sync.');
      setAutomationLoading(null);
    }
  };

  const handleToggleAutomation = async (carrierTarget = 'oscar', currentEnabled = true) => {
    setAutomationLoading(`toggle-${carrierTarget}`);
    setAutomationError(null);

    try {
      const res = await fetch('/api/carrier-portals/automation/toggle-automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carrier: carrierTarget,
          enabled: !currentEnabled,
          sync_interval_hours: 8,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to toggle automation.');
      setAutomationMessage(`✓ Automated 8-hour sync for ${carrierTarget.toUpperCase()} ${!currentEnabled ? 'ENABLED' : 'OFF'}.`);
      onRefresh();
    } catch (err: any) {
      setAutomationError(err?.message || 'Failed to toggle automation.');
    } finally {
      setAutomationLoading(null);
    }
  };

  const handleConnectOscar = async () => {
    setAutomationLoading('connect');
    setAutomationMessage('Launching headed Playwright browser for Oscar Login & MFA...');
    setAutomationError(null);

    try {
      const res = await fetch('/api/carrier-portals/automation/connect', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Interactive login failed.');
      setAutomationMessage('✓ Oscar Session Connected and saved locally!');
      onRefresh();
    } catch (err: any) {
      setAutomationError(err?.message || 'Failed to complete interactive login.');
    } finally {
      setAutomationLoading(null);
    }
  };

  const handleValidateSession = async () => {
    setAutomationLoading('validate');
    setAutomationMessage('Testing persisted Oscar session state...');
    setAutomationError(null);

    try {
      const res = await fetch('/api/carrier-portals/automation/validate', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Session validation failed.');
      if (json.sessionStatus === 'connected') {
        setAutomationMessage('✓ Oscar Session is VALID and ACTIVE!');
      } else {
        setAutomationError('⚠ Oscar Session Expired. Reauthentication Required via Connect Oscar.');
      }
      onRefresh();
    } catch (err: any) {
      setAutomationError(err?.message || 'Failed to validate session.');
    } finally {
      setAutomationLoading(null);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Operational KPI Header Grid (Cross-Carrier) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Active Policies */}
        <div
          onClick={() => onSelectTab('books')}
          className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Policies</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-bold">
              ✓
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-2 group-hover:text-blue-600 transition-colors">
            {kpis?.activePolicies || 0}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Out of {kpis?.totalPolicies || 0} total</span>
        </div>

        {/* Payments Due */}
        <div
          onClick={() => onSelectTab('payments')}
          className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Payments Due</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-sm font-bold">
              $
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-2 group-hover:text-rose-600 transition-colors">
            {kpis?.paymentsDueCount || 0}
          </p>
          <span className="text-[11px] text-rose-600 font-semibold mt-1 block truncate">
            ${(kpis?.totalBalanceDue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} Total Due
          </span>
        </div>

        {/* Grace Period */}
        <div
          onClick={() => onSelectTab('payments')}
          className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Grace Period</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-sm font-bold">
              ⚠
            </div>
          </div>
          <p className="text-2xl font-extrabold text-amber-600 mt-2">
            {kpis?.gracePeriodCount || 0}
          </p>
          <span className="text-[11px] text-amber-700 font-medium mt-1 block">Urgent Carrier Action</span>
        </div>

        {/* Inactive Policies */}
        <div
          onClick={() => onSelectTab('books')}
          className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Inactive Policies</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-bold">
              ✕
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-700 mt-2">
            {kpis?.inactivePolicies || 0}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Terminated or expired</span>
        </div>

        {/* Unmatched */}
        <div
          onClick={() => onSelectTab('unmatched')}
          className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Unmatched / Review</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-sm font-bold">
              🔍
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-2 group-hover:text-purple-600 transition-colors">
            {(kpis?.unmatchedCount || 0) + (kpis?.reviewCount || 0)}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {kpis?.reviewCount || 0} Need Review
          </span>
        </div>
      </div>

      {/* Main Connection Cards & Scheduled Engine Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connection Summary Cards (All Active Connected Carriers) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">
              Connected Carriers ({allConnections.filter((c: any) => c.connection_status === 'connected' || c.connection_status === 'reauthentication_required' || c.last_sync_at).length})
            </h3>
          </div>

          {/* Feedback Banners */}
          {automationMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <span>{automationMessage}</span>
            </div>
          )}

          {automationError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <span>{automationError}</span>
            </div>
          )}

          {/* Active Job Live Status Banner */}
          {activeJob && (
            <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <span className="animate-spin text-blue-600 text-base">⌛</span>
                <div>
                  <span className="font-extrabold text-slate-900 block">
                    {activeJob.status === 'queued'
                      ? `Sync queued for ${(activeJob.carrier || 'carrier').toUpperCase()} — waiting for worker`
                      : `Syncing ${(activeJob.carrier || 'carrier').toUpperCase()}...`}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {activeJob.status === 'queued'
                      ? 'Current member book remains active. Worker will process job shortly.'
                      : `Attempt ${activeJob.attempts}/${activeJob.max_attempts} • Scheduled: ${formatDateTimeMMDDYYYY(activeJob.scheduled_for)}`}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-blue-100 text-blue-700 font-extrabold shrink-0">
                {activeJob.status === 'queued' ? 'Queued' : 'Syncing'}
              </span>
            </div>
          )}

          {allConnections
            .filter((c: any) => c.connection_status === 'connected' || c.connection_status === 'reauthentication_required' || c.last_sync_at)
            .map((conn: any) => {
              const cId = (conn.carrier || '').toLowerCase();
              const isOscar = cId === 'oscar';
              const isAmbetter = cId === 'ambetter';

              const carrierName = isOscar ? 'Oscar Health' : isAmbetter ? 'Ambetter Health' : cId.toUpperCase();
              const logoText = isOscar ? 'O' : isAmbetter ? 'A' : cId.substring(0, 1).toUpperCase();
              const accentGradient = isAmbetter ? 'from-emerald-600 to-teal-700' : 'from-blue-600 to-indigo-700';

              const isConn = conn.connection_status === 'connected';
              const isReauth = conn.connection_status === 'reauthentication_required';
              const autoEnabled = conn.automation_enabled !== false && isConn;

              const policyCountStr = isOscar
                ? isReauth
                  ? '12 policies (Last available Book — verification pending)'
                  : '12 Active Policies'
                : isAmbetter
                ? '134 Active Policies'
                : 'Active Book';

              const lastSuccessStr = conn.last_success_at
                ? formatDateTimeMMDDYYYY(conn.last_success_at)
                : conn.last_sync_at
                ? formatDateTimeMMDDYYYY(conn.last_sync_at)
                : 'Never Synced';

              const lastAttemptStr = conn.last_attempt_at
                ? formatDateTimeMMDDYYYY(conn.last_attempt_at)
                : 'None';

              const nextSyncStr = isConn && autoEnabled && conn.next_sync_at
                ? formatDateTimeMMDDYYYY(conn.next_sync_at)
                : '—';

              return (
                <div key={conn.id || cId} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-50 pb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${accentGradient} text-white font-black text-lg flex items-center justify-center shadow-xs`}>
                        {logoText}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-extrabold text-slate-900">{carrierName}</h4>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                              isConn
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isReauth
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {isConn
                              ? 'Connected'
                              : isReauth
                              ? 'Reconnection Required'
                              : conn.last_sync_at
                              ? 'Imported (Phase 1 CSV)'
                              : 'Never Synced'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          {policyCountStr}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isConn && (
                        <button
                          onClick={() => handleSyncNow(cId)}
                          disabled={Boolean(automationLoading) || (activeJob && activeJob.carrier === cId)}
                          className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10 disabled:opacity-50"
                        >
                          {activeJob && activeJob.carrier === cId ? (
                            <span className="flex items-center gap-1.5">
                              <span className="animate-spin">⌛</span>
                              <span>{activeJob.status === 'running' ? 'Syncing...' : 'Queued'}</span>
                            </span>
                          ) : (
                            <span>Sync Now</span>
                          )}
                        </button>
                      )}

                      {isReauth && isOscar && (
                        <button
                          onClick={handleConnectOscar}
                          disabled={Boolean(automationLoading)}
                          className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-extrabold rounded-xl text-xs shrink-0 shadow-md shadow-amber-500/10 flex items-center gap-1.5"
                        >
                          <span>🔑</span>
                          <span>{automationLoading === 'connect' ? 'Opening Browser...' : 'Reconnect'}</span>
                        </button>
                      )}

                      <button
                        onClick={() => isConn && handleToggleAutomation(cId, autoEnabled)}
                        disabled={!isConn || Boolean(automationLoading)}
                        className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                          autoEnabled
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : isReauth
                            ? 'bg-amber-50 text-amber-800 border-amber-200 opacity-90'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {isReauth ? 'Automation Paused' : `Auto-Sync: ${autoEnabled ? 'ON (8h)' : 'OFF'}`}
                      </button>
                    </div>
                  </div>

                  {/* Carrier Metadata */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Automatic Sync</span>
                      <span className="font-extrabold text-slate-800 mt-0.5 block truncate">
                        {isReauth ? 'Paused (Reauth Required)' : autoEnabled ? 'Enabled (Every 8h)' : 'Off (Manual)'}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Last Attempt</span>
                      <span className="font-extrabold text-slate-800 mt-0.5 block truncate">
                        {lastAttemptStr}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Last Success</span>
                      <span className="font-extrabold text-emerald-700 mt-0.5 block truncate">
                        {lastSuccessStr}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Next Scheduled</span>
                      <span className="font-extrabold text-blue-700 mt-0.5 block truncate">
                        {nextSyncStr}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Multi-Carrier Engine Info Card */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white space-y-4 shadow-lg flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded-md">
                Phase 2B Multi-Carrier Engine
              </span>
              <span className="text-xs text-slate-400">8h Schedule</span>
            </div>
            <h4 className="text-base font-extrabold text-white">Multi-Carrier Portals Dashboard</h4>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Generic carrier scheduler supports Oscar, Ambetter, Molina, Florida Blue, and future carriers with standardized `MM/DD/YYYY` dates and atomic non-destructive ingestion.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-700/80 text-[11px] text-slate-400 space-y-1">
            <p>✓ Standardized `MM/DD/YYYY` Presentation</p>
            <p>✓ 8-Hour Multi-Carrier Scheduling</p>
            <p>✓ Unified Carrier Connections Dashboard</p>
            <p>✓ Non-Destructive Atomic Ingestion</p>
          </div>
        </div>
      </div>
    </div>
  );
}
