'use client';

import React, { useState, useRef, useCallback } from 'react';

export interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  maxSizeBytes?: number; // Default 15MB
  multiple?: boolean;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  selectedFiles?: File[];
  onRemoveFile?: (index: number) => void;
  error?: string | null;
}

const DEFAULT_MAX_SIZE = 15 * 1024 * 1024; // 15MB
const DEFAULT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt';

export default function FileDropzone({
  onFilesSelected,
  accept = DEFAULT_ACCEPT,
  maxSizeBytes = DEFAULT_MAX_SIZE,
  multiple = true,
  disabled = false,
  loading = false,
  label = 'Drag files here or click to select',
  selectedFiles = [],
  onRemoveFile,
  error: externalError,
}: FileDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayError = externalError || internalError;

  const validateAndFilterFiles = useCallback(
    (files: FileList | File[]): File[] => {
      setInternalError(null);
      const validFiles: File[] = [];
      const errMsgs: string[] = [];

      Array.from(files).forEach((file) => {
        if (file.size === 0) {
          errMsgs.push(`"${file.name}" is empty (0 bytes).`);
          return;
        }
        if (file.size > maxSizeBytes) {
          const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
          errMsgs.push(`"${file.name}" exceeds maximum size of ${maxMb}MB.`);
          return;
        }

        // Extension validation check if accept string is provided
        if (accept) {
          const allowedExts = accept.split(',').map((ext) => ext.trim().toLowerCase());
          const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
          const mimeType = file.type.toLowerCase();

          const matchesExt = allowedExts.some((ext) => ext === fileExt);
          const matchesMime = allowedExts.some((ext) => {
            if (ext === '.pdf') return mimeType === 'application/pdf';
            if (ext.startsWith('.jpg') || ext === '.jpeg') return mimeType.startsWith('image/jpeg');
            if (ext === '.png') return mimeType === 'image/png';
            if (ext === '.webp') return mimeType === 'image/webp';
            if (ext === '.txt') return mimeType.startsWith('text/');
            return true;
          });

          if (!matchesExt && !matchesMime) {
            errMsgs.push(`"${file.name}" is not a supported file type (${accept}).`);
            return;
          }
        }

        validFiles.push(file);
      });

      if (errMsgs.length > 0) {
        setInternalError(errMsgs[0]);
      }

      return validFiles;
    },
    [accept, maxSizeBytes]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || loading) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled || loading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const validFiles = validateAndFilterFiles(e.dataTransfer.files);
      if (validFiles.length > 0) {
        onFilesSelected(multiple ? validFiles : [validFiles[0]]);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const validFiles = validateAndFilterFiles(e.target.files);
      if (validFiles.length > 0) {
        onFilesSelected(multiple ? validFiles : [validFiles[0]]);
      }
    }
  };

  const handleClick = () => {
    if (disabled || loading) return;
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3 w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={disabled || loading ? -1 : 0}
        role="button"
        aria-label={label}
        aria-disabled={disabled || loading}
        className={`min-h-[120px] border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex flex-col items-center justify-center ${
          isDragOver
            ? 'border-blue-500 bg-blue-100/80 dark:bg-blue-900/50 scale-[1.01] shadow-md'
            : 'border-blue-400/50 hover:border-blue-500 bg-slate-100/80 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800/90'
        } ${disabled || loading ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileChange}
          disabled={disabled || loading}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{label}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Supports PDF, Word, Excel, Images, and TXT (Max 15MB)
            </p>
          </div>
        </div>
      </div>

      {displayError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{displayError}</span>
        </div>
      )}

      {/* Selected File Previews */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Selected Files ({selectedFiles.length})</p>
          <div className="space-y-2">
            {selectedFiles.map((file, idx) => {
              const isImage = file.type.startsWith('image/');
              return (
                <div
                  key={`${file.name}-${idx}`}
                  className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isImage ? (
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                        {/* Memory safe thumbnail preview URL */}
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="w-full h-full object-cover"
                          onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center flex-shrink-0 text-xs font-bold uppercase">
                        {file.name.split('.').pop() || 'FILE'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{file.name}</p>
                      <p className="text-[11px] text-slate-500 font-medium">{formatFileSize(file.size)}</p>
                    </div>
                  </div>

                  {onRemoveFile && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFile(idx);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Remove file"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
