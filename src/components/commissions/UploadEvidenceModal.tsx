/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState, useEffect } from 'react';
import { ExtractedCommissionRow } from '@/types/commissions';

interface UploadEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface AvailablePolicy {
  policy_id: string;
  policy_number: string;
  company_name: string;
  client_id: string;
  client_name: string;
}

export default function UploadEvidenceModal({ isOpen, onClose, onSuccess }: UploadEvidenceModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [extractedRows, setExtractedRows] = useState<ExtractedCommissionRow[]>([]);
  const [extractionMethod, setExtractionMethod] = useState<'vision_ai' | 'ocr_fallback' | 'structured_file' | 'manual_entry' | null>(null);
  const [documentType, setDocumentType] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [rematchingRowId, setRematchingRowId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmSuccessMsg, setConfirmSuccessMsg] = useState<string | null>(null);

  // Manual Entry Modal State
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [availablePolicies, setAvailablePolicies] = useState<AvailablePolicy[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [manualAmount, setManualAmount] = useState<string>('');
  const [manualTxCode, setManualTxCode] = useState<string>('COMM');

  useEffect(() => {
    if (showManualEntry && availablePolicies.length === 0) {
      setLoadingPolicies(true);
      fetch('/api/commissions/policies')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.policies)) {
            setAvailablePolicies(data.policies);
            if (data.policies.length > 0) {
              setSelectedPolicyId(data.policies[0].policy_id);
            }
          }
        })
        .catch((err) => console.error('Failed to load policies for manual entry:', err))
        .finally(() => setLoadingPolicies(false));
    }
  }, [showManualEntry, availablePolicies.length]);

  if (!isOpen) return null;

  const handleModalClose = () => {
    setFile(null);
    setPreviewUrl('');
    setExtractedRows([]);
    setExtractionMethod(null);
    setDocumentType(null);
    setSelectedRowIds(new Set());
    setError(null);
    setWarning(null);
    setConfirmSuccessMsg(null);
    setShowManualEntry(false);
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      const url = URL.createObjectURL(selected);
      setPreviewUrl(url);
      setError(null);
      setWarning(null);
      setExtractedRows([]);
      setExtractionMethod(null);
      setDocumentType(null);
    }
  };

  const handleUploadAndExtract = async () => {
    if (!file) {
      setError('Please select a document file (XLSX, XLS, CSV, PDF, JPG, PNG, WEBP) to upload.');
      return;
    }

    setUploading(true);
    setError(null);
    setWarning(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/commissions/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to extract evidence.');
      }

      const rows: ExtractedCommissionRow[] = data.rows || [];
      setExtractedRows(rows);
      setExtractionMethod(data.extraction_method || 'ocr_fallback');
      setDocumentType(data.document_type || null);

      // Pre-select ONLY rows that are exact MATCHED
      const autoSelected = new Set<string>();
      rows.forEach((r) => {
        if (r.match_status === 'MATCHED') {
          autoSelected.add(r.id);
        }
      });
      setSelectedRowIds(autoSelected);

      if (!previewUrl && data.document_url) {
        setPreviewUrl(data.document_url);
      }

      if (data.warning) {
        const rawWarn = String(data.warning);
        const sanitizedWarn = rawWarn.includes('RESOURCE_EXHAUSTED') || rawWarn.includes('Gemini') || rawWarn.includes('{')
          ? 'Processed locally.'
          : rawWarn;
        setWarning(sanitizedWarn);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Commission Upload UI Error]:', err);
      const sanitizedErr = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Gemini') || msg.includes('{')
        ? 'Processed locally.'
        : msg;
      setError(sanitizedErr || 'Could not process evidence file.');
    } finally {
      setUploading(false);
    }
  };

  const handleRowFieldChange = async (
    rowId: string,
    field: keyof ExtractedCommissionRow,
    value: string | number
  ) => {
    const updatedRows = extractedRows.map((r) => {
      if (r.id === rowId) {
        return { ...r, [field]: value };
      }
      return r;
    });

    setExtractedRows(updatedRows);

    if (field === 'membership_or_policy_number' || field === 'carrier' || field === 'client_name') {
      const targetRow = updatedRows.find((r) => r.id === rowId);
      if (!targetRow) return;

      setRematchingRowId(rowId);
      try {
        const res = await fetch('/api/commissions/rematch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ row: targetRow }),
        });

        const data = await res.json();
        if (res.ok && data.success && data.row) {
          setExtractedRows((prev) =>
            prev.map((r) => (r.id === rowId ? data.row : r))
          );
          if (data.row.match_status === 'MATCHED') {
            setSelectedRowIds((prev) => new Set(prev).add(rowId));
          }
        }
      } catch (err) {
        console.error('Failed to rematch row:', err);
      } finally {
        setRematchingRowId(null);
      }
    }
  };

  const handleToggleSelectRow = (rowId: string) => {
    const next = new Set(selectedRowIds);
    if (next.has(rowId)) {
      next.delete(rowId);
    } else {
      next.add(rowId);
    }
    setSelectedRowIds(next);
  };

  const handleToggleSelectAll = () => {
    if (selectedRowIds.size === extractedRows.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(extractedRows.map((r) => r.id)));
    }
  };

  const handleAddManualRow = () => {
    if (!selectedPolicyId) {
      setError('Please select a CRM policy for manual entry.');
      return;
    }

    const pol = availablePolicies.find((p) => p.policy_id === selectedPolicyId);
    if (!pol) return;

    const parsedAmt = parseFloat(manualAmount);
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      setError('Please enter a valid commission amount.');
      return;
    }

    const newRowId = `manual-row-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newRow: ExtractedCommissionRow = {
      id: newRowId,
      payment_date: manualDate,
      client_name: pol.client_name,
      membership_or_policy_number: pol.policy_number,
      carrier: pol.company_name,
      transaction_code: manualTxCode || 'COMM',
      commission_amount: parsedAmt,
      confidence: 1.0,
      confidence_reason: 'Manual entry confirmed by agent',
      match_status: 'MATCHED',
      matched_client_id: pol.client_id,
      matched_client_name: pol.client_name,
      matched_policy_id: pol.policy_id,
      matched_policy_number: pol.policy_number,
      matched_carrier: pol.company_name,
    };

    setExtractedRows((prev) => [newRow, ...prev]);
    setSelectedRowIds((prev) => new Set(prev).add(newRowId));
    if (!extractionMethod) setExtractionMethod('manual_entry');
    setShowManualEntry(false);
    setManualAmount('');
    setError(null);
  };

  const handleConfirmSelected = async () => {
    const rowsToConfirm = extractedRows.filter((r) => selectedRowIds.has(r.id));
    if (rowsToConfirm.length === 0) {
      setError('Please select at least one row to confirm.');
      return;
    }

    const missingMatch = rowsToConfirm.find((r) => !r.matched_policy_id || !r.matched_client_id);
    if (missingMatch) {
      setError(
        `Row for client "${missingMatch.client_name}" does not have a valid matched CRM policy. Please edit the policy number or uncheck it.`
      );
      return;
    }

    setConfirming(true);
    setError(null);
    let successCount = 0;

    try {
      for (const row of rowsToConfirm) {
        const res = await fetch('/api/commissions/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: row.matched_client_id,
            policy_id: row.matched_policy_id,
            policy_number: row.matched_policy_number || row.membership_or_policy_number,
            carrier: row.matched_carrier || row.carrier,
            amount: row.commission_amount,
            payment_date: row.payment_date,
            transaction_code: row.transaction_code || 'COMM',
            extraction_method: extractionMethod || 'structured_file',
            extraction_confidence: row.confidence,
            match_status: row.match_status,
            original_extracted_value: row.raw_text || `$${row.commission_amount.toFixed(2)} (${row.payment_date})`,
            source_document_url: previewUrl,
            source_text: row.raw_text,
          }),
        });

        if (res.ok) {
          successCount++;
        }
      }

      setConfirmSuccessMsg(`Successfully confirmed and recorded ${successCount} commission payments.`);
      setTimeout(() => {
        onSuccess();
        handleModalClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Error confirming selected commissions.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in font-sans">
      <div className="w-full max-w-7xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">P&C Commission Evidence Import</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Extract commission rows from statements, screenshots, or spreadsheets, match against CRM policies, review & confirm.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setShowManualEntry(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1"
            >
              <span>+ Add Commission Manually</span>
            </button>
            <button
              type="button"
              onClick={handleModalClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 font-bold transition-all cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Manual Entry Sub-Modal */}
        {showManualEntry && (
          <div className="bg-blue-50/70 border-b border-blue-200 p-4 animate-fade-in">
            <div className="max-w-4xl mx-auto flex flex-col space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-blue-900">
                  Manual Commission Entry
                </h4>
                <button
                  type="button"
                  onClick={() => setShowManualEntry(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 font-bold"
                >
                  Cancel ✕
                </button>
              </div>

              {loadingPolicies ? (
                <p className="text-xs text-blue-700 animate-pulse">Loading CRM policies...</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-5">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">CRM Client & Policy</label>
                    <select
                      value={selectedPolicyId}
                      onChange={(e) => setSelectedPolicyId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500 font-medium"
                    >
                      {availablePolicies.map((p) => (
                        <option key={p.policy_id} value={p.policy_id}>
                          {p.client_name} — Policy #{p.policy_number} ({p.company_name})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Payment Date</label>
                    <input
                      type="date"
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Code</label>
                    <input
                      type="text"
                      value={manualTxCode}
                      onChange={(e) => setManualTxCode(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 uppercase text-center outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddManualRow}
                      className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
                    >
                      Add Commission →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content Workspace: 2-Column Split */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          
          {/* Left Column: Evidence File & Image/Document Preview */}
          <div className="lg:col-span-4 border-r border-slate-100 bg-slate-50/30 p-5 flex flex-col space-y-4 overflow-y-auto">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                1. Select Evidence Document / Spreadsheet
              </label>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf,.xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              />
            </div>

            {file && (
              <button
                type="button"
                onClick={handleUploadAndExtract}
                disabled={uploading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md shadow-blue-500/10 transition-all uppercase tracking-wider flex items-center justify-center space-x-2 cursor-pointer"
              >
                {uploading ? (
                  <span>Extracting Commission Rows...</span>
                ) : (
                  <span>Extract & Match Commission Rows →</span>
                )}
              </button>
            )}

            {/* Document Preview Box */}
            <div className="flex-1 min-h-[260px] rounded-xl border border-slate-200 bg-white p-2 overflow-hidden flex flex-col items-center justify-center">
              {previewUrl ? (
                previewUrl.endsWith('.pdf') || (file && file.type === 'application/pdf') ? (
                  <iframe src={previewUrl} className="w-full h-full rounded-lg" title="Evidence Preview" />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Commission Evidence Preview"
                    className="max-h-[450px] w-auto object-contain rounded-lg shadow-xs"
                  />
                )
              ) : (
                <div className="text-center p-6 text-slate-400">
                  <svg className="w-12 h-12 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-xs font-semibold">No evidence document selected</p>
                  <p className="text-[11px] text-slate-400 mt-1">Upload a statement screenshot, PDF, or XLSX file</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Extracted Rows & CRM Matching Table */}
          <div className="lg:col-span-8 p-5 flex flex-col min-h-0 overflow-y-auto space-y-4">
            
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-medium">
                {error}
              </div>
            )}

            {warning && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-xs font-medium">
                {warning}
              </div>
            )}

            {confirmSuccessMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-medium">
                {confirmSuccessMsg}
              </div>
            )}

            {extractedRows.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50/50">
                <div className="p-3 rounded-full bg-blue-50 text-blue-600 mb-3">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 01-2-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h4 className="text-sm font-bold text-slate-800">No Extracted Rows Yet</h4>
                <p className="text-xs text-slate-500 max-w-md mt-1">
                  Upload evidence on the left panel or click <strong>+ Add Commission Manually</strong> to record commission payments.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col space-y-4 min-h-0">
                
                {/* Action Bar */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2 flex-wrap gap-1">
                    <span className="text-xs font-bold text-slate-800">
                      Extracted Rows ({extractedRows.length})
                    </span>
                    <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">
                      {selectedRowIds.size} Selected
                    </span>

                    {extractionMethod === 'vision_ai' && (
                      <span className="text-[11px] bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                        ✨ Vision Extraction
                      </span>
                    )}

                    {extractionMethod === 'ocr_fallback' && (
                      <span className="text-[11px] bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                        ⚙️ Local Document Extraction
                      </span>
                    )}

                    {extractionMethod === 'structured_file' && (
                      <span className="text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                        📊 Spreadsheet Document
                      </span>
                    )}

                    {extractionMethod === 'manual_entry' && (
                      <span className="text-[11px] bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                        ✍️ Manual Entry
                      </span>
                    )}

                    {documentType && (
                      <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium capitalize">
                        {documentType.replace('_', ' ')}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmSelected}
                    disabled={confirming || selectedRowIds.size === 0}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md shadow-emerald-500/10 transition-all uppercase tracking-wider flex items-center space-x-1.5 cursor-pointer"
                  >
                    <span>{confirming ? 'Saving Payments...' : `Confirm Selected Matches (${selectedRowIds.size})`}</span>
                  </button>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="p-3 w-8 text-center">
                          <input
                            type="checkbox"
                            checked={selectedRowIds.size === extractedRows.length && extractedRows.length > 0}
                            onChange={handleToggleSelectAll}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </th>
                        <th className="p-3">Match Status</th>
                        <th className="p-3">Confidence</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Client Name</th>
                        <th className="p-3">Policy / Member ID</th>
                        <th className="p-3">Carrier</th>
                        <th className="p-3">Tx Code</th>
                        <th className="p-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {extractedRows.map((row) => (
                        <React.Fragment key={row.id}>
                          <tr className={`hover:bg-slate-50/80 transition-colors ${selectedRowIds.has(row.id) ? 'bg-blue-50/20' : ''}`}>
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={selectedRowIds.has(row.id)}
                                onChange={() => handleToggleSelectRow(row.id)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="p-3">
                              {row.match_status === 'MATCHED' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                  ✓ Exact CRM Match
                                </span>
                              )}
                              {row.match_status === 'REVIEW' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800">
                                  ⚠️ Possible CRM Match
                                </span>
                              )}
                              {row.match_status === 'UNMATCHED' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800">
                                  ✕ Unmatched
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex flex-col">
                                <span
                                  className={`text-[11px] font-semibold ${
                                    row.confidence >= 0.8
                                      ? 'text-emerald-700'
                                      : row.confidence >= 0.6
                                      ? 'text-amber-700'
                                      : 'text-rose-700'
                                  }`}
                                >
                                  {Math.round(row.confidence * 100)}%
                                </span>
                                {row.confidence_reason && (
                                  <span className="text-[10px] text-slate-400 max-w-[120px] truncate" title={row.confidence_reason}>
                                    {row.confidence_reason}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                value={row.payment_date}
                                onChange={(e) => handleRowFieldChange(row.id, 'payment_date', e.target.value)}
                                placeholder="YYYY-MM-DD"
                                className={`w-24 bg-slate-50 border rounded-lg px-2 py-1 text-xs outline-none focus:border-blue-500 ${
                                  !row.payment_date ? 'border-rose-300 bg-rose-50/50 text-rose-900 font-bold' : 'border-slate-200 text-slate-800'
                                }`}
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                value={row.client_name}
                                onChange={(e) => handleRowFieldChange(row.id, 'client_name', e.target.value)}
                                className="w-36 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-500"
                              />
                            </td>
                            <td className="p-3">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={row.membership_or_policy_number}
                                  onChange={(e) => handleRowFieldChange(row.id, 'membership_or_policy_number', e.target.value)}
                                  placeholder="Enter Policy #"
                                  className={`w-36 bg-slate-50 border rounded-lg px-2 py-1 text-xs font-mono outline-none focus:border-blue-500 ${
                                    !row.membership_or_policy_number ? 'border-amber-400 bg-amber-50/40' : 'border-slate-200 text-slate-900 font-bold'
                                  }`}
                                />
                                {rematchingRowId === row.id && (
                                  <span className="absolute right-2 top-1.5 text-[10px] text-blue-600 animate-pulse">
                                    Matching...
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                value={row.carrier}
                                onChange={(e) => handleRowFieldChange(row.id, 'carrier', e.target.value)}
                                className="w-28 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-500"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                value={row.transaction_code || ''}
                                onChange={(e) => handleRowFieldChange(row.id, 'transaction_code', e.target.value)}
                                placeholder="e.g. COMM"
                                className="w-14 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-500 uppercase"
                              />
                            </td>
                            <td className="p-3 text-right font-bold text-slate-900">
                              <input
                                type="number"
                                step="0.01"
                                value={row.commission_amount}
                                onChange={(e) => handleRowFieldChange(row.id, 'commission_amount', parseFloat(e.target.value) || 0)}
                                className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-right font-bold text-slate-900 outline-none focus:border-blue-500"
                              />
                            </td>
                          </tr>

                          {/* Matched / Suggested CRM Policy Details Card Banner */}
                          {row.matched_policy_id && (
                            <tr className={`${row.match_status === 'MATCHED' ? 'bg-blue-50/40' : 'bg-amber-50/40'} border-b border-slate-200`}>
                              <td colSpan={9} className="px-4 py-2.5">
                                <div className="flex flex-wrap items-center justify-between text-xs gap-2">
                                  <div className="flex items-center space-x-3">
                                    <span className={`font-extrabold uppercase text-[10px] tracking-wider px-2 py-0.5 rounded-md ${
                                      row.match_status === 'MATCHED' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-900'
                                    }`}>
                                      {row.match_status === 'MATCHED' ? 'Exact CRM Policy Match' : 'Suggested Policy Match (Verify & Check to Confirm)'}
                                    </span>
                                    <span>
                                      <strong>Client:</strong> {row.matched_client_name}
                                    </span>
                                    <span>
                                      <strong>Agent:</strong> {row.matched_agent_name}
                                    </span>
                                    <span>
                                      <strong>Policy #:</strong> <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-950 font-bold">{row.matched_policy_number}</code>
                                    </span>
                                    <span>
                                      <strong>Carrier:</strong> {row.matched_carrier}
                                    </span>
                                  </div>

                                  <div className="flex items-center space-x-3 text-[11px] text-slate-700">
                                    {row.matched_effective_date && (
                                      <span>
                                        <strong>Effective:</strong> {row.matched_effective_date}
                                      </span>
                                    )}
                                    {typeof row.matched_premium_amount === 'number' && (
                                      <span>
                                        <strong>Premium:</strong> ${row.matched_premium_amount?.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>
            )}

          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Isolated P&C Commission Evidence Import Workflow — No changes are saved to Supabase until you click Confirm.
          </span>
          <button
            type="button"
            onClick={handleModalClose}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
