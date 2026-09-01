'use client';

import React from 'react';

interface PolicyChangesTabProps {
  events: any[];
}

export default function PolicyChangesTab({ events }: PolicyChangesTabProps) {
  return (
    <div className="space-y-5 font-sans">
      {/* Header Notice */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900">Carrier Policy Changes Log</h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Real-time change detection log comparing newest sync run against previous run
          </p>
        </div>

        <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 font-semibold max-w-sm">
          💡 A policy missing from the newest CSV generates a <span className="font-bold">POLICY_MISSING</span> event and does NOT automatically cancel the CRM policy.
        </div>
      </div>

      {/* Events Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
        {events.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-bold text-slate-700">No policy change events logged yet.</p>
            <p className="text-xs text-slate-400">
              The first successful import establishes your baseline. Diff detection operates from sync #2 onward.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4">Member ID</th>
                  <th className="py-3.5 px-4">Event Type</th>
                  <th className="py-3.5 px-4">Severity</th>
                  <th className="py-3.5 px-4">Previous Value</th>
                  <th className="py-3.5 px-4">Current Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {events.map((ev) => {
                  const isWarning = ev.severity === 'warning' || ev.severity === 'critical';

                  return (
                    <tr key={ev.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Date */}
                      <td className="py-3.5 px-4 text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(ev.created_at).toLocaleString()}
                      </td>

                      {/* Member ID */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                        {ev.external_member_id}
                      </td>

                      {/* Event Type */}
                      <td className="py-3.5 px-4">
                        <span className="font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {ev.event_type}
                        </span>
                      </td>

                      {/* Severity */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            isWarning ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {ev.severity}
                        </span>
                      </td>

                      {/* Previous Value */}
                      <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                        {ev.previous_value ? JSON.stringify(ev.previous_value) : 'None'}
                      </td>

                      {/* Current Value */}
                      <td className="py-3.5 px-4 text-slate-900 font-mono text-[11px] font-semibold">
                        {ev.current_value ? JSON.stringify(ev.current_value) : 'None'}
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
  );
}
