'use client';

import React, { useState, useEffect } from 'react';
import { formatDateTimeMMDDYYYY } from '@/lib/carrier-portals/date-formatter';

interface SyncHistoryTabProps {
  syncRuns: any[];
}

export default function SyncHistoryTab({ syncRuns }: SyncHistoryTabProps) {
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await fetch('/api/carrier-portals/automation/jobs?carrier=oscar');
        if (res.ok) {
          const data = await res.json();
          setJobs(data.jobs || []);
        }
      } catch (err) {
        console.error('Error fetching carrier sync jobs:', err);
      }
    };

    fetchJobs();
  }, []);

  return (
    <div className="space-y-8 font-sans">
      {/* 1. Scheduled Carrier Jobs Queue Audit Table */}
      <div className="space-y-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Carrier Scheduled Sync Queue &amp; Worker Jobs</h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Multi-carrier sync queue history showing trigger type, status, attempts, and scheduling timestamps (MM/DD/YYYY)
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
          {jobs.length === 0 ? (
            <div className="p-8 text-center space-y-1">
              <p className="text-sm font-bold text-slate-700">No scheduled sync jobs recorded yet.</p>
              <p className="text-xs text-slate-400">Click &quot;Sync Now&quot; or enable 8-hour automatic sync to generate worker jobs.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Scheduled / Requested</th>
                    <th className="py-3.5 px-4">Carrier</th>
                    <th className="py-3.5 px-4">Trigger</th>
                    <th className="py-3.5 px-4">Job Status</th>
                    <th className="py-3.5 px-4">Attempts</th>
                    <th className="py-3.5 px-4">Started</th>
                    <th className="py-3.5 px-4">Completed</th>
                    <th className="py-3.5 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {jobs.map((job) => {
                    const isCompleted = job.status === 'completed';
                    const isRunning = job.status === 'running';
                    const isReauth = job.status === 'reauthentication_required';
                    const isQueued = job.status === 'queued';

                    return (
                      <tr key={job.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Scheduled For formatted MM/DD/YYYY hh:mm A */}
                        <td className="py-3.5 px-4 font-extrabold text-slate-900 whitespace-nowrap">
                          {formatDateTimeMMDDYYYY(job.scheduled_for)}
                        </td>

                        {/* Carrier */}
                        <td className="py-3.5 px-4 font-extrabold text-slate-800 uppercase">
                          {job.carrier}
                        </td>

                        {/* Trigger Type */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                              job.trigger_type === 'scheduled'
                                ? 'bg-indigo-50 text-indigo-700'
                                : job.trigger_type === 'manual'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {job.trigger_type}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                              isCompleted
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isRunning
                                ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
                                : isQueued
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : isReauth
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {job.status === 'reauthentication_required' ? 'Reauth Required' : job.status}
                          </span>
                        </td>

                        {/* Attempts */}
                        <td className="py-3.5 px-4 font-semibold text-slate-700">
                          {job.attempts} / {job.max_attempts}
                        </td>

                        {/* Started */}
                        <td className="py-3.5 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                          {job.started_at ? formatDateTimeMMDDYYYY(job.started_at) : 'Pending'}
                        </td>

                        {/* Completed */}
                        <td className="py-3.5 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                          {job.completed_at ? formatDateTimeMMDDYYYY(job.completed_at) : 'In Progress'}
                        </td>

                        {/* Error / Notes */}
                        <td className="py-3.5 px-4 text-[11px] text-slate-600 truncate max-w-xs" title={job.error_message || ''}>
                          {job.error_message || 'Clean execution'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 2. Ingested Carrier Sync Runs Table */}
      <div className="space-y-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Ingested Carrier Sync History</h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Completed carrier import executions and records metrics
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
          {syncRuns.length === 0 ? (
            <div className="p-8 text-center space-y-1">
              <p className="text-sm font-bold text-slate-700">No sync runs recorded yet.</p>
              <p className="text-xs text-slate-400 font-sans">Import a carrier CSV file or execute automated sync to record runs.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Started At</th>
                    <th className="py-3.5 px-4">Carrier &amp; Source</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Records Found</th>
                    <th className="py-3.5 px-4">Matched</th>
                    <th className="py-3.5 px-4">Review</th>
                    <th className="py-3.5 px-4">Unmatched</th>
                    <th className="py-3.5 px-4">Policy Changes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 font-sans">
                  {syncRuns.map((run) => {
                    const isSuccess = run.status === 'completed';

                    return (
                      <tr key={run.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Started At formatted MM/DD/YYYY hh:mm A */}
                        <td className="py-3.5 px-4 font-extrabold text-slate-900 whitespace-nowrap">
                          {formatDateTimeMMDDYYYY(run.started_at)}
                        </td>

                        {/* Carrier & Source */}
                        <td className="py-3.5 px-4">
                          <span className="font-extrabold text-slate-800 uppercase block">{run.carrier}</span>
                          <span className="text-[10px] text-slate-500 font-mono block">Source: {run.source}</span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                              isSuccess
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {run.status}
                          </span>
                        </td>

                        {/* Records Found */}
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          {run.records_found}
                        </td>

                        {/* Matched */}
                        <td className="py-3.5 px-4 text-emerald-700 font-extrabold">
                          {run.matched_count}
                        </td>

                        {/* Review */}
                        <td className="py-3.5 px-4 text-amber-700 font-extrabold">
                          {run.review_count}
                        </td>

                        {/* Unmatched */}
                        <td className="py-3.5 px-4 text-slate-500 font-bold">
                          {run.unmatched_count}
                        </td>

                        {/* Policy Changes */}
                        <td className="py-3.5 px-4 text-blue-600 font-extrabold">
                          {run.changed_count}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
