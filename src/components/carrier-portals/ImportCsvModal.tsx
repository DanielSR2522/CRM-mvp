'use client';

import React, { useState, useRef } from 'react';

interface ImportCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  carrier?: string;
}

export default function ImportCsvModal({
  isOpen,
  onClose,
  onSuccess,
  carrier = 'Oscar',
}: ImportCsvModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{
    totalRows: number;
    activeCount: number;
    inactiveCount: number;
    gracePeriodCount: number;
    balanceDueCount: number;
    sampleRecords: any[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a valid .csv file.');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setPreviewing(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('mode', 'preview');
      formData.append('carrier', carrier.toLowerCase());

      const res = await fetch('/api/carrier-portals/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse CSV preview.');
      }

      setPreviewData(data.preview);
    } catch (err: any) {
      console.error('Error generating CSV preview:', err);
      setError(err?.message || 'Failed to parse CSV file.');
      setFile(null);
      setPreviewData(null);
    } finally {
      setPreviewing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!file) return;

    setImporting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'import');
      formData.append('carrier', carrier.toLowerCase());

      const res = await fetch('/api/carrier-portals/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Import failed.');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error during carrier import:', err);
      setError(err?.message || 'Failed to complete import.');
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreviewData(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden font-sans">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center font-bold text-lg shadow-2xs">
              ☁
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Import {carrier} Book CSV</h3>
              <p className="text-xs text-slate-500 font-medium">Phase 1 Manual CSV Sync • Carrier Data Isolation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold flex items-start gap-2">
              <span className="text-base">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/50 hover:bg-blue-50/20 rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 mx-auto flex items-center justify-center text-xl font-bold mb-3 group-hover:scale-105 transition-transform">
                ⬆
              </div>
              <h4 className="text-sm font-bold text-slate-800">Select {carrier} Individual Book CSV</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Drag & drop or click to browse. Validates required columns (Member ID, Name, DOB, Status, Balance, etc.).
              </p>
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-blue-600 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-2xs">
                Browse CSV File
              </div>
            </div>
          ) : previewing ? (
            <div className="py-12 text-center space-y-3">
              <div className="inline-block animate-spin text-3xl text-blue-600">⌛</div>
              <p className="text-sm font-bold text-slate-800">Parsing and validating CSV structure...</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* File Info Bar */}
              <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100/80 flex items-center justify-between">
                <div className="flex items-center gap-3 truncate">
                  <span className="text-xl">📄</span>
                  <div className="truncate">
                    <p className="text-xs font-bold text-slate-900 truncate">{file.name}</p>
                    <p className="text-[11px] text-slate-500 font-medium">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button
                  onClick={handleReset}
                  disabled={importing}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-all shadow-2xs"
                >
                  Change File
                </button>
              </div>

              {/* Import Preview Breakdown */}
              {previewData && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Import Preview Breakdown
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">Rows Found</span>
                      <span className="text-base font-extrabold text-slate-900 mt-0.5 block">
                        {previewData.totalRows}
                      </span>
                    </div>

                    <div className="p-3 bg-emerald-50/50 border border-emerald-100/80 rounded-xl">
                      <span className="block text-[10px] font-bold text-emerald-600 uppercase">Active</span>
                      <span className="text-base font-extrabold text-emerald-700 mt-0.5 block">
                        {previewData.activeCount}
                      </span>
                    </div>

                    <div className="p-3 bg-amber-50/50 border border-amber-100/80 rounded-xl">
                      <span className="block text-[10px] font-bold text-amber-600 uppercase">Grace Period</span>
                      <span className="text-base font-extrabold text-amber-700 mt-0.5 block">
                        {previewData.gracePeriodCount}
                      </span>
                    </div>

                    <div className="p-3 bg-rose-50/50 border border-rose-100/80 rounded-xl">
                      <span className="block text-[10px] font-bold text-rose-600 uppercase">Balance Due &gt; $0</span>
                      <span className="text-base font-extrabold text-rose-700 mt-0.5 block">
                        {previewData.balanceDueCount}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-800">⚡ Automated Processing Steps on Confirmation:</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                      <li>Normalize statuses (`active`, `inactive`, `grace_period`), numeric balances, and dates.</li>
                      <li>Run deterministic CRM matching against agent&apos;s clients (DOB +40, Email +30, Phone +20, Name +10).</li>
                      <li>Write current records, store historical snapshot, and run change detection logs.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-2xs"
          >
            Cancel
          </button>
          {file && previewData && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/10 flex items-center gap-2 disabled:opacity-50"
            >
              {importing ? (
                <>
                  <span className="animate-spin">⌛</span>
                  <span>Syncing & Normalizing...</span>
                </>
              ) : (
                <>
                  <span>Confirm & Run Carrier Sync</span>
                  <span>➔</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
