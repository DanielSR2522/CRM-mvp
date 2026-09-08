'use client';

import React, { useState, useEffect } from 'react';
import { MarketingSegment, AudienceFilters } from '@/types/marketing';
import { evaluateSegmentCandidates } from '@/lib/marketing/segment-evaluator';
import { evaluateRecipientSafety } from '@/lib/marketing/safety-engine';

interface SegmentsViewProps {
  segments: MarketingSegment[];
  onCreateSegment: (segmentData: Partial<MarketingSegment>) => Promise<MarketingSegment>;
}

export default function SegmentsView({ segments, onCreateSegment }: SegmentsViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [segmentName, setSegmentName] = useState('');
  const [description, setDescription] = useState('');

  // Audience Filter State
  const [filters, setFilters] = useState<AudienceFilters>({
    client: { state: '', category: '', status: '' },
    policy: { carrier: '', policyStatus: 'all', renewalWithinDays: null },
    emailMarketing: { hasEmail: true, validEmailOnly: true },
  });

  const [calculating, setCalculating] = useState(false);
  const [liveCount, setLiveCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isModalOpen) return;
    setCalculating(true);
    evaluateSegmentCandidates(filters)
      .then(({ candidates, suppressedEmails, hardBouncedEmails }) => {
        const summary = evaluateRecipientSafety(candidates, suppressedEmails, hardBouncedEmails);
        setLiveCount(summary.validRecipients);
      })
      .finally(() => setCalculating(false));
  }, [isModalOpen, filters]);

  const handleSave = async () => {
    if (!segmentName.trim()) {
      alert('Please enter a segment name.');
      return;
    }
    await onCreateSegment({
      name: segmentName.trim(),
      description: description.trim(),
      filters,
    });
    setIsModalOpen(false);
    setSegmentName('');
    setDescription('');
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">Saved Audience Segments</h3>
          <p className="text-xs text-slate-500">
            Dynamic audience filters recalculated automatically from current CRM data
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-600/10 flex items-center gap-1.5"
        >
          <span>+</span> Build New Segment
        </button>
      </div>

      {/* Segments Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {segments.map((seg) => (
          <div key={seg.id} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">{seg.name}</span>
                {seg.is_system && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[10px] font-bold border border-blue-200">
                    System Pre-set
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{seg.description || 'No description'}</p>
            </div>

            <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Recalculated dynamically</span>
              <span className="text-blue-600 font-bold hover:underline cursor-pointer">Use in Campaign →</span>
            </div>
          </div>
        ))}
      </div>

      {/* New Segment Builder Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden max-w-2xl w-full p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Build Saved Segment</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 font-bold text-sm">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Segment Name</label>
                <input
                  type="text"
                  value={segmentName}
                  onChange={(e) => setSegmentName(e.target.value)}
                  placeholder="e.g. Ambetter FL Renewals — 30 Days"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Active policyholders in Florida due for renewal next month"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
                />
              </div>

              {/* Filter Controls */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <span className="block text-xs font-bold text-slate-900">Criteria Rules (AND Logic)</span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">State</label>
                    <input
                      type="text"
                      value={filters.client?.state || ''}
                      onChange={(e) => setFilters({ ...filters, client: { ...filters.client, state: e.target.value } })}
                      placeholder="e.g. FL"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Carrier</label>
                    <input
                      type="text"
                      value={filters.policy?.carrier || ''}
                      onChange={(e) => setFilters({ ...filters, policy: { ...filters.policy, carrier: e.target.value } })}
                      placeholder="e.g. Ambetter"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Live Count Preview */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between text-xs text-blue-900">
                <span className="font-bold">Estimated Live Recipients</span>
                <span className="text-sm font-extrabold">{calculating ? 'Calculating...' : `${liveCount || 0} Clients`}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md"
              >
                Save Segment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
