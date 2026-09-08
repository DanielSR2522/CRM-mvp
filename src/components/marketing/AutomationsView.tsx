'use client';

import React, { useState } from 'react';
import { MarketingAutomation } from '@/types/marketing';

interface AutomationsViewProps {
  automations: MarketingAutomation[];
}

export default function AutomationsView({ automations }: AutomationsViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const triggers = [
    { type: 'NEW_LEAD', label: 'New Lead Registered', desc: 'Trigger campaign immediately when a new lead enters the system' },
    { type: 'NO_RESPONSE_X_DAYS', label: 'No Lead Response after X Days', desc: 'Send follow-up email if lead has no activity for 7 days' },
    { type: 'RENEWAL_APPROACHING', label: 'Policy Renewal Approaching', desc: 'Trigger 30 days before policy expiration date' },
    { type: 'POLICY_CANCELLED', label: 'Policy Cancelled', desc: 'Reactivation offer sent when policy status updates to cancelled' },
    { type: 'PAYMENT_PENDING', label: 'Payment Pending', desc: 'Payment reminder trigger when premium payment is overdue' },
    { type: 'BIRTHDAY', label: 'Client Birthday', desc: 'Automatic birthday message sent on client date of birth' },
    { type: 'CLIENT_INACTIVE', label: 'Client Inactive 90 Days', desc: 'Re-engagement message sent to inactive client accounts' },
    { type: 'SALE_COMPLETED', label: 'Sale Completed', desc: 'Send referral request & thank-you email 5 days after sale' },
  ];

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">Marketing Automations & Triggers</h3>
          <p className="text-xs text-slate-500">Event-driven campaign automation rules</p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md"
        >
          + Build Automation Rule
        </button>
      </div>

      {/* Triggers Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {triggers.map((tr) => (
          <div key={tr.type} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-3 flex flex-col justify-between hover:border-blue-300 transition-colors">
            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                Trigger Event
              </span>
              <h4 className="text-xs font-bold text-slate-900 leading-snug">{tr.label}</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">{tr.desc}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="text-xs font-bold text-blue-600 hover:underline pt-2 border-t border-slate-100 text-left"
            >
              Configure Rule →
            </button>
          </div>
        ))}
      </div>

      {/* Active Rules List */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900">Active Automation Rules</h3>
        {automations.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No active automation rules. Select a trigger above to configure automated workflows.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {automations.map((a) => (
              <div key={a.id} className="py-3 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-900">{a.name}</span>
                  <span className="text-xs text-slate-400 ml-2">({a.trigger_type})</span>
                </div>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md">
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Minimal Trigger Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">Configure Automation Trigger</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 font-bold text-sm">✕</button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Automation rules automatically dispatch email templates when CRM events trigger. Select your event and template bindings.
            </p>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Rule Name</label>
                <input type="text" defaultValue="Policy Renewal Automated Reminder" className="w-full bg-slate-50 border p-2 rounded-xl font-bold" />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Trigger Event</label>
                <select className="w-full bg-slate-50 border p-2 rounded-xl font-bold">
                  {triggers.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 font-bold text-slate-600 text-xs">Close</button>
              <button type="button" onClick={() => { setIsModalOpen(false); alert('Automation rule configured.'); }} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl text-xs">Save Automation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
