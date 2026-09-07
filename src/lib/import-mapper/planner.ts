import { findDuplicateCandidates } from './duplicates';
import {
  ColumnMapping,
  ExistingClientForDuplicate,
  ImportPlan,
  ImportPlanRow,
  ImportSourceRow,
} from './types';
import { normalizeMappedRows } from './mapper';

export function buildImportPlan(
  rows: ImportSourceRow[],
  mapping: ColumnMapping,
  existingClients: ExistingClientForDuplicate[]
): ImportPlan {
  const normalized = normalizeMappedRows(rows, mapping);
  const planRows: ImportPlanRow[] = normalized.map((record) => {
    const duplicateCandidates = findDuplicateCandidates(record, existingClients);
    const hasErrors = record.issues.some((issue) => issue.severity === 'error');
    const hasPolicyData = Object.values(record.healthPolicy).some((value) => value !== null && value !== '');

    return {
      ...record,
      duplicateCandidates,
      duplicateAction: duplicateCandidates.length > 0 ? 'review' : 'create_new',
      ready: !hasErrors && duplicateCandidates.length === 0,
      healthPolicy: {
        ...record.healthPolicy,
        pendingAction: record.healthPolicy.pendingAction ?? record.pendingAction,
      },
      issues: hasPolicyData || record.client.fullName
        ? record.issues
        : [
            ...record.issues,
            { field: 'row', severity: 'warning', message: 'Row has very little mapped data.' },
          ],
    };
  });

  return {
    rows: planRows,
    summary: {
      totalRows: planRows.length,
      rowsReady: planRows.filter((row) => row.ready).length,
      rowsWithWarnings: planRows.filter((row) => row.issues.some((issue) => issue.severity === 'warning')).length,
      rowsWithErrors: planRows.filter((row) => row.issues.some((issue) => issue.severity === 'error')).length,
      probableDuplicates: planRows.filter((row) => row.duplicateCandidates.length > 0).length,
      clientsToCreate: planRows.filter((row) => row.duplicateCandidates.length === 0 && !row.issues.some((issue) => issue.severity === 'error')).length,
      existingClientsMatched: planRows.filter((row) => row.duplicateCandidates.length > 0).length,
      recordsSkipped: planRows.filter((row) => row.issues.some((issue) => issue.severity === 'error')).length,
      policyRecordsToCreate: planRows.filter((row) => Object.values(row.healthPolicy).some((value) => value !== null && value !== '')).length,
    },
  };
}
