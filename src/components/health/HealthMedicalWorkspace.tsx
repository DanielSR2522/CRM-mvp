'use client';

import React from 'react';
import HealthMedicalSection from './HealthMedicalSection';

interface HealthMedicalWorkspaceProps {
  healthPolicyId: string;
  clientId: string;
  addToast?: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
  onReturnToSummary?: () => void;
}

export default function HealthMedicalWorkspace({
  healthPolicyId,
  clientId,
  addToast,
  onReturnToSummary,
}: HealthMedicalWorkspaceProps) {
  return (
    <div className="space-y-6 font-sans text-xs w-full max-w-none">
      {/* HEADER BANNER */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>🩺</span> Health Medical Workspace
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Manage primary doctors, hospitals, urgent care, pharmacies, medical conditions, specialists, and medications.
          </p>
        </div>
        {onReturnToSummary && (
          <button
            type="button"
            onClick={onReturnToSummary}
            className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all self-start sm:self-auto flex items-center gap-1.5"
          >
            ← Back to Summary
          </button>
        )}
      </div>

      {/* MEDICAL SECTION CONTAINER (WIDE WORKSPACE) */}
      <HealthMedicalSection
        healthPolicyId={healthPolicyId}
        clientId={clientId}
        addToast={addToast}
      />
    </div>
  );
}
