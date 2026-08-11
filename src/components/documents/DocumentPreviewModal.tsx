'use client';

import React, { useEffect, useState } from 'react';
import { OfficePreviewResult, OfficeSlide } from '@/lib/documents/office-preview';

export interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  mimeType?: string | null;
  signedUrl?: string | null;
  officePreview?: OfficePreviewResult | null;
  loading?: boolean;
  error?: string | null;
  onDownload?: () => void;
}

export function detectFileType(fileName: string, mimeType?: string | null): 'pdf' | 'image' | 'text' | 'office' | 'unsupported' {
  const lowerMime = (mimeType || '').toLowerCase();
  const lowerName = fileName.toLowerCase();

  if (lowerMime.includes('application/pdf') || lowerName.endsWith('.pdf')) {
    return 'pdf';
  }

  if (
    lowerMime.startsWith('image/') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.webp') ||
    lowerName.endsWith('.gif') ||
    lowerName.endsWith('.svg')
  ) {
    return 'image';
  }

  if (lowerMime.startsWith('text/') || lowerName.endsWith('.txt')) {
    return 'text';
  }

  if (
    lowerMime.includes('wordprocessingml') ||
    lowerMime.includes('spreadsheetml') ||
    lowerMime.includes('presentationml') ||
    lowerMime.includes('ms-excel') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.pptx')
  ) {
    return 'office';
  }

  return 'unsupported';
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  fileName,
  mimeType,
  signedUrl,
  officePreview,
  loading = false,
  error = null,
  onDownload,
}) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);

  useEffect(() => {
    setCurrentSlideIndex(0);
  }, [fileName, officePreview]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fileType = detectFileType(fileName, mimeType);
  const slides = officePreview?.slides || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-sans animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-5xl w-full flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <div className="p-2 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-slate-900 truncate">{fileName}</h3>
              <p className="text-xs text-slate-400 font-sans">
                {fileType === 'office' ? 'Inline Office Viewer' : 'Inline Document Viewer'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all font-bold"
            title="Close Preview"
          >
            ✕
          </button>
        </div>

        {/* BODY CONTENT */}
        <div className="p-6 flex-1 overflow-auto bg-slate-50/30 flex flex-col items-center justify-center min-h-[350px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center space-y-3 py-16">
              <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-xs font-semibold text-slate-600 font-sans">
                {fileType === 'office' ? 'Preparing document preview...' : 'Generating secure preview...'}
              </p>
            </div>
          ) : error ? (
            <div className="max-w-md text-center p-6 bg-rose-50 border border-rose-100 rounded-2xl space-y-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h4 className="text-sm font-extrabold text-rose-800">
                {fileType === 'office' ? 'Unable to generate a preview for this document.' : 'Unable to preview this document.'}
              </h4>
              <p className="text-xs text-rose-600 font-sans">{error}</p>
              {onDownload && (
                <button
                  type="button"
                  onClick={onDownload}
                  className="mt-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md font-sans"
                >
                  Download Original File
                </button>
              )}
            </div>
          ) : fileType === 'office' && officePreview ? (
            officePreview.type === 'html' && officePreview.html ? (
              <div
                className="w-full max-h-[75vh] overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xs"
                dangerouslySetInnerHTML={{ __html: officePreview.html }}
              />
            ) : officePreview.type === 'slides' && slides.length > 0 ? (
              <div className="w-full flex flex-col items-center max-h-[75vh] space-y-4">
                <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-2xl p-8 shadow-md min-h-[350px] flex flex-col justify-between">
                  <div className="border-b border-slate-100 pb-3 mb-4">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
                      Slide {slides[currentSlideIndex].slideNumber} of {slides.length}
                    </span>
                    <h4 className="text-lg font-extrabold text-slate-900 mt-2 font-sans">
                      {slides[currentSlideIndex].title}
                    </h4>
                  </div>
                  <div className="flex-1 space-y-2 py-2 overflow-auto text-sm text-slate-700 font-sans">
                    {slides[currentSlideIndex].textContent.slice(1).map((text, idx) => (
                      <p key={idx} className="leading-relaxed flex items-start gap-2">
                        <span className="text-blue-500 font-bold">•</span>
                        <span>{text}</span>
                      </p>
                    ))}
                  </div>
                </div>

                {slides.length > 1 && (
                  <div className="flex items-center gap-4 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-xs">
                    <button
                      type="button"
                      disabled={currentSlideIndex === 0}
                      onClick={() => setCurrentSlideIndex((prev) => Math.max(0, prev - 1))}
                      className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 rounded-lg transition-all"
                    >
                      ← Previous Slide
                    </button>
                    <span className="text-xs text-slate-500 font-extrabold">
                      {currentSlideIndex + 1} / {slides.length}
                    </span>
                    <button
                      type="button"
                      disabled={currentSlideIndex === slides.length - 1}
                      onClick={() => setCurrentSlideIndex((prev) => Math.min(slides.length - 1, prev + 1))}
                      className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 rounded-lg transition-all"
                    >
                      Next Slide →
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-md text-center p-6 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
                <p className="text-xs font-semibold text-slate-500 font-sans">No preview content generated.</p>
              </div>
            )
          ) : !signedUrl ? (
            <div className="max-w-md text-center p-6 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
              <p className="text-xs font-semibold text-slate-500 font-sans">No document stream available.</p>
            </div>
          ) : fileType === 'pdf' ? (
            <iframe
              src={signedUrl}
              className="w-full h-[75vh] rounded-xl border border-slate-200 shadow-sm bg-white"
              title={fileName}
            />
          ) : fileType === 'image' ? (
            <div className="w-full flex items-center justify-center p-2">
              <img
                src={signedUrl}
                alt={fileName}
                className="max-h-[72vh] max-w-full object-contain rounded-xl shadow-md border border-slate-100"
              />
            </div>
          ) : fileType === 'text' ? (
            <iframe
              src={signedUrl}
              className="w-full h-[65vh] rounded-xl border border-slate-200 bg-white p-4 font-mono text-xs shadow-sm"
              title={fileName}
            />
          ) : (
            <div className="max-w-md text-center p-8 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-slate-800 font-sans">Preview is not available for this file type.</h4>
                <p className="text-xs text-slate-500 mt-1 font-sans">
                  You can download the file to view it on your device.
                </p>
              </div>
              {onDownload && (
                <button
                  type="button"
                  onClick={onDownload}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md font-sans"
                >
                  Download File
                </button>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/50">
          <span className="text-xs text-slate-400 font-mono truncate max-w-xs">{fileName}</span>
          <div className="flex items-center gap-3">
            {onDownload && !loading && (
              <button
                type="button"
                onClick={onDownload}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md font-sans"
              >
                Download Original File
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all font-sans"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
