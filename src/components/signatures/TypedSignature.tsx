'use client';

import React from 'react';

/**
 * Type-to-sign.
 *
 * The preview renders in a script face so the signer sees a signature rather
 * than a form field — that recognition is what makes the act feel deliberate.
 * The stored value is the plain text; the font is presentation, and the PDF
 * renders it in its own italic face.
 */

interface TypedSignatureProps {
  value: string;
  onChange: (value: string) => void;
  /** The name on the request. Offered as a starting point, never forced. */
  suggestedName: string;
  disabled?: boolean;
}

export default function TypedSignature({
  value,
  onChange,
  suggestedName,
  disabled = false,
}: TypedSignatureProps) {
  const trimmed = value.trim();

  return (
    <div>
      <label htmlFor="typed-signature" className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
        Type your full name
      </label>
      <input
        id="typed-signature"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={200}
        autoComplete="name"
        placeholder={suggestedName}
        className="w-full text-sm text-slate-800 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50"
      />

      <div className="mt-3 rounded-xl border-2 border-dashed border-slate-200 bg-white p-4">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-300 mb-2">Preview</p>
        <div className="min-h-[52px] flex items-end border-b border-slate-200 pb-1">
          {trimmed ? (
            <span
              className="text-3xl text-slate-900 leading-tight"
              // Cursive stack: whatever the device has. A missing font degrades
              // to italic rather than breaking, and the stored value is the text
              // either way.
              style={{ fontFamily: '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive', fontStyle: 'italic' }}
            >
              {trimmed}
            </span>
          ) : (
            <span className="text-xs text-slate-300">Your typed signature appears here</span>
          )}
        </div>
      </div>

      {trimmed && trimmed.toLowerCase() !== suggestedName.trim().toLowerCase() && (
        <p className="text-[10px] text-amber-600 mt-2">
          This does not match the name on the document ({suggestedName}). That is allowed — just make
          sure it is what you intend.
        </p>
      )}
    </div>
  );
}
