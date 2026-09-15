'use client';

import React, { useState, useEffect } from 'react';
import { ExtractedCommissionRow } from '@/types/commissions';

interface PolicyOption {
  policy_id: string;
  policy_number: string;
  company_name: string;
  client_id: string;
  client_name: string;
}

interface UploadEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadEvidenceModal({ isOpen, onClose, onSuccess }: UploadEvidenceModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [extractedRows, setExtractedRows] = useState<ExtractedCommissionRow[]>([]);
  const [documentUrl, setDocumentUrl] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [availablePolicies, setAvailablePolicies] = useState<PolicyOption[]>([]);

  const [confirmingRowId, setConfirmingRowId] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ row: ExtractedCommissionRow; msg: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/commissions/policies')
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setAvailablePolicies(data.policies || []);
          }
        })
        .catch((err) => console.error('Failed to load policies:', err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setWarning(null);
    }
  };

  const handleUploadAndExtract = async () => {
    if (!file) {
      setError('Please select a JPG, JPEG, PNG, or PDF file.');
      return;
    }

    setUploading(true);
    setError(null);
    setWarning(null);

    const formData = new FormData();
    formData.append('file', file);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s timeout

    try {
      const res = await fetch('/api/commissions/upload', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not process this evidence. Please try again.');
      }

      setDocumentUrl(data.document_url || '');
      setRawText(data.raw_text || '');
      setExtractedRows(data.rows || []);

      if (data.warning) {
        setWarning(data.warning);
      }

      if ((!data.rows || data.rows.length === 0) && !data.warning) {
        setWarning('No commission rows detected automatically. You can add policy details manually.');
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error('[Commission Upload Error]:', err);
      if (err.name === 'AbortError') {
        setError('Upload and processing timed out. Please verify your internet connection or upload a smaller file.');
      } else {
        setError(err.message || 'Could not process this evidence. Please try again.');
      }
    } fontFinally: {
      setUploading(false);
    }
  };

  const handleManualPolicySelect = (rowId: string, policyId: string) => {
    const policy = availablePolicies.find((p) => p.policy_id === policyId);
    setExtractedRows((prev) =>
      prev.map((r) => {
        if (r.id === rowId) {
          if (!policyId || !policy) {
            return {
              ...r,
              match_status: 'NOT_FOUND',
              matched_policy_id: undefined,
              matched_client_id: undefined,
            };
          }
          return {
            ...r,
            match_status: 'MATCHED',
            matched_policy_id: policy.policy_id,
            matched_policy_number: policy.policy_number,
            matched_carrier: policy.company_name,
            matched_client_id: policy.client_id,
            matched_client_name: policy.client_name,
          };
        }
        return r;
      })
    );
  };

  const handleAssociatePayment = async (row: ExtractedCommissionRow, forceDuplicate = false) => {
    if (!row.matched_policy_id || !row.matched_client_id) {
      setError('Please select a valid CRM policy for this row before marking paid.');
      return;
    }

    setConfirmingRowId(row.id);
    setError(null);

    try {
      const res = await fetch('/api/commissions/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: row.matched_client_id,
          policy_id: row.matched_policy_id,
          policy_number: row.matched_policy_number || row.policy_or_membership_number,
          carrier: row.matched_carrier || row.carrier,
          amount: row.commission_amount,
          payment_date: row.payment_date,
          source_document_url: documentUrl,
          source_text: row.raw_text,
          force_duplicate: forceDuplicate,
        }),
      });

      const data = await res.json();
      if (res.status === 409 && data.requires_confirmation) {
        setDuplicateWarning({ row, msg: data.error || 'Possible duplicate commission payment.' });
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to mark payment as paid.');
      }

      // Mark row as processed / confirmed
      setExtractedRows((prev) => prev.filter((r) => r.id !== row.id));
      setDuplicateWarning(null);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error marking payment paid.');
    } finally {
      setConfirmingRowId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <h2 className="text-xl font-bold text-slate-800">Upload Commission Evidence</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-lg">
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 font-medium border border-red-200">
            {error}
          </div>
        )}

        {warning && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 font-medium border border-amber-200">
            ⚠️ {warning}
          </div>
        )}

        {extractedRows.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-8 bg-slate-50">
            <svg
              className="h-12 w-12 text-slate-400 mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            <p className="text-sm font-semibold text-slate-700">Drag and drop evidence document or screenshot</p>
            <p className="text-xs text-slate-500 mt-1">Supports JPG, JPEG, PNG, PDF</p>

            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
              onChange={handleFileChange}
              className="mt-4 text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
            />

            {file && (
              <p className="mt-3 text-xs font-semibold text-emerald-600">Selected file: {file.name}</p>
            )}

            <button
              onClick={handleUploadAndExtract}
              disabled={!file || uploading}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Processing & Extracting...
                </>
              ) : (
                'Upload & Extract Commissions'
              )}
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {duplicateWarning && (
              <div className="rounded-lg bg-amber-50 p-4 border border-amber-200">
                <p className="text-sm font-bold text-amber-800">Duplicate Payment Warning</p>
                <p className="text-xs text-amber-700 mt-1">{duplicateWarning.msg}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleAssociatePayment(duplicateWarning.row, true)}
                    className="rounded bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                  >
                    Confirm & Force Create
                  </button>
                  <button
                    onClick={() => setDuplicateWarning(null)}
                    className="rounded bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-md font-bold text-slate-800">Extracted Commission Rows ({extractedRows.length})</h3>
              {documentUrl && (
                <a
                  href={documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  View Uploaded Source Document ↗
                </a>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Status</th>
                    <th className="p-3">Client Detected</th>
                    <th className="p-3">Policy / Member #</th>
                    <th className="p-3">Carrier</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">CRM Match Selection</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {extractedRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold">
                        {row.match_status === 'MATCHED' && (
                          <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            MATCHED ✓
                          </span>
                        )}
                        {row.match_status === 'NEEDS_REVIEW' && (
                          <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            Needs Review
                          </span>
                        )}
                        {row.match_status === 'NOT_FOUND' && (
                          <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            Not Found
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-medium text-slate-900">{row.client_name}</td>
                      <td className="p-3 font-mono text-slate-800">{row.policy_or_membership_number || 'N/A'}</td>
                      <td className="p-3 text-slate-700">{row.carrier}</td>
                      <td className="p-3 font-bold text-slate-900">${row.commission_amount.toFixed(2)}</td>
                      <td className="p-3 text-slate-600">{row.payment_date}</td>
                      <td className="p-3">
                        <select
                          value={row.matched_policy_id || ''}
                          onChange={(e) => handleManualPolicySelect(row.id, e.target.value)}
                          className="w-full rounded border border-slate-300 p-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
                        >
                          <option value="">-- Select Real CRM Policy --</option>
                          {availablePolicies.map((p) => (
                            <option key={p.policy_id} value={p.policy_id}>
                              {p.client_name} — {p.policy_number} ({p.company_name})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleAssociatePayment(row)}
                          disabled={!row.matched_policy_id || confirmingRowId === row.id}
                          className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-40"
                        >
                          {confirmingRowId === row.id ? 'Saving...' : 'Associate & Mark Paid'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={() => {
                  setExtractedRows([]);
                  setFile(null);
                  setWarning(null);
                }}
                className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                Upload Another File
              </button>
              <button
                onClick={onClose}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
