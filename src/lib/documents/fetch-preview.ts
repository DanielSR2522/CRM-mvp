import type { OfficePreviewResult } from './office-preview';

/**
 * Safely fetches an Office document preview payload from /api/documents/preview.
 * Guarantees defensive handling against non-JSON (HTML) responses, preventing SyntaxError: Unexpected token '<'.
 */
export async function fetchOfficeDocumentPreview(
  source: string,
  docId: string
): Promise<OfficePreviewResult> {
  const res = await fetch('/api/documents/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, docId }),
  });

  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    let errorMessage = 'Unable to generate a preview for this document.';
    if (contentType.includes('application/json')) {
      try {
        const errData = await res.json();
        if (errData.error && errData.code) {
          errorMessage = `${errData.error} Code: ${errData.code}`;
        } else if (errData.error) {
          errorMessage = errData.error;
        }
      } catch {}
    }
    throw new Error(errorMessage);
  }

  if (!contentType.includes('application/json')) {
    throw new Error('Unable to generate a preview for this document.');
  }

  return await res.json();
}
