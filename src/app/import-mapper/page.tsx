'use client';

import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import { DESTINATION_FIELDS } from '@/lib/import-mapper/fields';
import {
  ColumnMapping,
  DestinationFieldId,
  ImportPlan,
  ImportSourceRow,
  ImportSourceType,
  ParsedImportFile,
} from '@/lib/import-mapper/types';

interface AgentOption {
  id: string;
  name: string;
  email: string | null;
}

interface TemplateOption {
  id: string;
  name: string;
  source_fingerprint: string | null;
  mapping: ColumnMapping;
}

export default function ImportMapperPage() {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentId, setAgentId] = useState('');
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [templateName, setTemplateName] = useState('Legacy CRM - Yolanda');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);

  useEffect(() => {
    fetch('/api/import-mapper/agents')
      .then((res) => res.json())
      .then((data) => {
        const nextAgents = Array.isArray(data.agents) ? data.agents : [];
        setAgents(nextAgents);
        setAgentId(nextAgents[0]?.id ?? '');
      })
      .catch(() => setError('Unable to load destination agents.'));
  }, []);

  useEffect(() => {
    if (!agentId) return;
    fetch(`/api/import-mapper/templates?agentId=${encodeURIComponent(agentId)}`)
      .then((res) => res.json())
      .then((data) => setTemplates(Array.isArray(data.templates) ? data.templates : []))
      .catch(() => setTemplates([]));
  }, [agentId]);

  const rowsForPreview = useMemo(() => plan?.rows.slice(0, 50) ?? [], [plan]);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    setPlan(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/import-mapper/preview', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed.');
      setParsed(data);
      setMapping(data.suggestedMapping || {});
      setMessage(`Detected ${data.columns.length} columns and ${data.rowCount} rows.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setLoading(false);
    }
  };

  const runDryRun = async () => {
    if (!parsed || !agentId) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/import-mapper/dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          filename: parsed.filename,
          sourceType: parsed.sourceType,
          rows: parsed.rows,
          mapping,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Dry run failed.');
      setPlan(data.plan);
      setMessage('Dry run completed. No production records were imported.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dry run failed.');
    } finally {
      setLoading(false);
    }
  };

  const saveTemplate = async () => {
    if (!parsed || !agentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/import-mapper/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          name: templateName,
          sourceFingerprint: parsed.sourceFingerprint,
          mapping,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Template save failed.');
      setTemplates((current) => [data.template, ...current.filter((template) => template.id !== data.template.id)]);
      setMessage(`Saved template "${data.template.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Template save failed.');
    } finally {
      setLoading(false);
    }
  };

  const runImport = async () => {
    if (!parsed || !plan || !agentId || !confirmImport) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/import-mapper/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          filename: parsed.filename,
          sourceType: parsed.sourceType,
          rows: parsed.rows,
          mapping,
          confirm: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed.');
      setMessage(`Import finished: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped, ${data.failed} failed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <CrmPageContainer>
        <div className="min-h-[calc(100vh-96px)] bg-[#F6F8FC] text-slate-900">
          <div className="border-b border-slate-200 bg-white px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-extrabold tracking-tight">Universal Import Mapper</h1>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Upload spreadsheet data, map columns, preview normalized rows, and dry run safely before import.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                />
                Upload File
              </label>
            </div>
          </div>

          <div className="grid gap-4 p-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="space-y-4">
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
                <h2 className="text-sm font-extrabold">Destination Agent</h2>
                <select
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                  className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-blue-500"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
                <h2 className="text-sm font-extrabold">Mapping Templates</h2>
                <div className="mt-3 space-y-2">
                  <input
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder="Template name"
                  />
                  <button
                    type="button"
                    disabled={!parsed || loading}
                    onClick={saveTemplate}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save Current Mapping
                  </button>
                  <div className="max-h-56 overflow-y-auto pt-2">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => {
                          setMapping(template.mapping);
                          setTemplateName(template.name);
                          setPlan(null);
                        }}
                        className="mb-1 w-full rounded-md px-2 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {parsed && (
                <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
                  <h2 className="text-sm font-extrabold">Source File</h2>
                  <dl className="mt-3 space-y-2 text-xs">
                    <Metric label="Filename" value={parsed.filename} />
                    <Metric label="Type" value={parsed.sourceType.toUpperCase()} />
                    <Metric label="Columns" value={String(parsed.columns.length)} />
                    <Metric label="Rows" value={String(parsed.rowCount)} />
                  </dl>
                </section>
              )}
            </aside>

            <main className="space-y-4">
              {(message || error) && (
                <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                  {error || message}
                </div>
              )}

              <section className="rounded-lg border border-slate-200 bg-white shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <h2 className="text-sm font-extrabold">Column Mapping</h2>
                  <button
                    type="button"
                    disabled={!parsed || loading}
                    onClick={runDryRun}
                    className="rounded-md bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Preview / Dry Run
                  </button>
                </div>
                {!parsed ? (
                  <div className="px-4 py-12 text-center text-sm font-semibold text-slate-500">
                    Upload Yolanda.xlsx or another Excel/CSV file to begin.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-xs">
                      <thead className="bg-slate-50 text-left font-bold text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Source Column</th>
                          <th className="px-4 py-3">Sample Values</th>
                          <th className="px-4 py-3">CRM Destination</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsed.columns.map((column) => (
                          <tr key={column}>
                            <td className="px-4 py-3 font-bold text-slate-800">{column}</td>
                            <td className="max-w-md px-4 py-3 text-slate-500">
                              {sampleValues(parsed.sampleRows, column).join(' | ') || '-'}
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={mapping[column] || 'ignore'}
                                onChange={(event) => {
                                  setMapping((current) => ({
                                    ...current,
                                    [column]: event.target.value as DestinationFieldId,
                                  }));
                                  setPlan(null);
                                }}
                                className="w-72 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold outline-none focus:border-blue-500"
                              >
                                {DESTINATION_FIELDS.map((field) => (
                                  <option key={field.id} value={field.id}>
                                    {field.group.toUpperCase()} - {field.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {plan && (
                <>
                  <section className="grid gap-3 md:grid-cols-4">
                    <SummaryCard label="Total Rows" value={plan.summary.totalRows} />
                    <SummaryCard label="Rows Ready" value={plan.summary.rowsReady} />
                    <SummaryCard label="Warnings" value={plan.summary.rowsWithWarnings} />
                    <SummaryCard label="Probable Duplicates" value={plan.summary.probableDuplicates} />
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white shadow-xs">
                    <div className="border-b border-slate-200 px-4 py-3">
                      <h2 className="text-sm font-extrabold">Normalized Preview</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-xs">
                        <thead className="bg-slate-50 text-left font-bold text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Row</th>
                            <th className="px-4 py-3">Client</th>
                            <th className="px-4 py-3">DOB</th>
                            <th className="px-4 py-3">Phone</th>
                            <th className="px-4 py-3">Email</th>
                            <th className="px-4 py-3">Policy</th>
                            <th className="px-4 py-3">Duplicate Action</th>
                            <th className="px-4 py-3">Issues</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rowsForPreview.map((row) => (
                            <tr key={row.rowNumber} className="align-top">
                              <td className="px-4 py-3 font-bold">{row.rowNumber}</td>
                              <td className="px-4 py-3">
                                <div className="font-bold text-slate-800">{row.client.fullName || '-'}</div>
                                <div className="text-slate-400">{row.client.externalLegacyId || ''}</div>
                              </td>
                              <td className="px-4 py-3">{row.client.dateOfBirth || '-'}</td>
                              <td className="px-4 py-3">{row.client.phone || '-'}</td>
                              <td className="px-4 py-3">{row.client.email || '-'}</td>
                              <td className="px-4 py-3">
                                {[row.healthPolicy.carrier, row.healthPolicy.policyNumber, row.healthPolicy.plan].filter(Boolean).join(' / ') || '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span className="rounded-md bg-slate-100 px-2 py-1 font-bold text-slate-700">
                                  {row.duplicateAction}
                                </span>
                                {row.duplicateCandidates.length > 0 && (
                                  <div className="mt-1 text-slate-500">
                                    {row.duplicateCandidates[0].fullName} ({row.duplicateCandidates[0].reasons.join(', ')})
                                  </div>
                                )}
                              </td>
                              <td className="max-w-xs px-4 py-3 text-slate-500">
                                {row.issues.map((issue) => issue.message).join(' ') || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-extrabold">Final Import</h2>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          Requires explicit confirmation. Duplicate rows remain review/skip by default and are not overwritten automatically.
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <input type="checkbox" checked={confirmImport} onChange={(event) => setConfirmImport(event.target.checked)} />
                        Confirm production import
                      </label>
                      <button
                        type="button"
                        disabled={!confirmImport || loading}
                        onClick={runImport}
                        className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Import Confirmed Rows
                      </button>
                    </div>
                  </section>
                </>
              )}
            </main>
          </div>
        </div>
      </CrmPageContainer>
    </DashboardLayout>
  );
}

function sampleValues(rows: ImportSourceRow[], column: string): string[] {
  return rows
    .map((row) => row[column])
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
    .slice(0, 3)
    .map((value) => String(value));
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="font-bold text-slate-500">{label}</dt>
      <dd className="text-right font-extrabold text-slate-800">{value}</dd>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
      <div className="text-xs font-bold uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-slate-900">{value}</div>
    </div>
  );
}
