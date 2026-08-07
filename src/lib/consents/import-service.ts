export interface ImportResult {
  html: string;
  imported: {
    source_type: 'docx' | 'txt' | 'pdf';
    source_filename: string;
    warning?: string;
    is_scanned_pdf?: boolean;
    imported_at: string;
  };
}

/**
 * Client-side helper that posts uploaded file to secure server-side API endpoint `/api/consents/import`.
 */
export async function uploadAndParseDocument(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/consents/import', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Failed to import document.');
  }

  return result;
}
