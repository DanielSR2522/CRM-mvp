'use client';

import React, { useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import ImageExtension from '@tiptap/extension-image';

import { supabase } from '@/lib/supabaseClient';

interface TipTapConsentEditorProps {
  content: string;
  onChange: (html: string) => void;
  editorRef?: React.MutableRefObject<any>;
}

export default function TipTapConsentEditor({
  content,
  onChange,
  editorRef
}: TipTapConsentEditorProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Modal / Settings state for inserting/configuring interactive elements
  const [modalType, setModalType] = useState<'checkbox' | 'yes_no' | 'initials' | 'image_upload' | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Field Config States
  const [checkboxLabel, setCheckboxLabel] = useState('I agree to receive communications');
  const [checkboxDesc, setCheckboxDesc] = useState('');
  const [checkboxReq, setCheckboxReq] = useState(true);

  const [yesnoQuestion, setYesnoQuestion] = useState('Do you authorize us to send email notifications?');
  const [yesnoYesLabel, setYesnoYesLabel] = useState('Yes, I authorize');
  const [yesnoNoLabel, setYesnoNoLabel] = useState('No, I do not authorize');
  const [yesnoReq, setYesnoReq] = useState(true);

  const [initialsLabel, setInitialsLabel] = useState('Initials');
  const [initialsReq, setInitialsReq] = useState(true);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      ImageExtension.configure({
        inline: false,
        allowBase64: false,
      }),
    ],
    content: content || '<p></p>',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
    },
  });

  React.useEffect(() => {
    if (editorRef) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);

  // Keep content synced if external content changes drastically (e.g., imported file)
  React.useEffect(() => {
    if (editor && content !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(content || '<p></p>');
    }
  }, [content, editor]);

  if (!editor) {
    return (
      <div className="p-12 text-center text-slate-400 font-sans">
        Loading document editor...
      </div>
    );
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  // Image Upload Handler
  const handleImageFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setUploadingImage(true);
    setModalError(null);

    try {
      const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!allowedMimeTypes.includes(file.type.toLowerCase())) {
        throw new Error('Invalid file format. Please select a PNG, JPG, or WEBP image.');
      }

      if (file.size > 5 * 1024 * 1024) {
        throw new Error('File size exceeds the 5 MB limit. Please select a smaller image.');
      }

      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/consents/upload-asset', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        throw new Error(data.message || 'Your session has expired. Please sign in again.');
      }

      if (!res.ok || !data.url) {
        throw new Error(data.message || data.error || 'Unable to upload image. Please try again.');
      }

      const elemId = `elem-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const safeAlt = file.name.replace(/"/g, '&quot;');
      const storageAttr = data.path ? `data-storage-path="${data.path}"` : '';
      const imgHtml = `<p class="text-center my-4" data-element-type="image" data-element-id="${elemId}" data-alignment="center" data-size="medium"><img src="${data.url}" ${storageAttr} alt="${safeAlt}" style="max-width: 100%; height: auto; object-fit: contain; display: inline-block; border-radius: 8px;" /></p><p></p>`;

      editor.chain().focus().insertContent(imgHtml).run();
      setModalType(null);
    } catch (err: any) {
      console.error('Image upload failed:', err);
      setModalError(err?.message || 'Failed to upload image.');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Insert Checkbox Field
  const handleInsertCheckbox = () => {
    if (!checkboxLabel.trim()) return;
    const elemId = `elem-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const html = `<div data-element-type="checkbox" data-element-id="${elemId}" data-required="${checkboxReq}" data-label="${checkboxLabel.replace(/"/g, '&quot;')}" data-description="${checkboxDesc.replace(/"/g, '&quot;')}" class="consent-interactive-checkbox font-sans p-3.5 my-3 bg-slate-50 border border-slate-200 rounded-xl">
      <div class="flex items-start gap-2.5">
        <span class="text-slate-400 font-bold text-sm">☐</span>
        <div>
          <span class="text-xs font-bold text-slate-800">${checkboxLabel}</span>
          ${checkboxReq ? '<span class="text-[10px] text-rose-500 font-semibold ml-1.5">*Required</span>' : ''}
          ${checkboxDesc ? `<div class="text-[11px] text-slate-500 mt-0.5">${checkboxDesc}</div>` : ''}
        </div>
      </div>
    </div><p></p>`;

    editor.chain().focus().insertContent(html).run();
    setModalType(null);
  };

  // Insert Yes/No Field
  const handleInsertYesNo = () => {
    if (!yesnoQuestion.trim()) return;
    const elemId = `elem-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const html = `<div data-element-type="yes_no" data-element-id="${elemId}" data-required="${yesnoReq}" data-question="${yesnoQuestion.replace(/"/g, '&quot;')}" data-yes-label="${yesnoYesLabel.replace(/"/g, '&quot;')}" data-no-label="${yesnoNoLabel.replace(/"/g, '&quot;')}" class="consent-interactive-yesno font-sans p-3.5 my-3 bg-slate-50 border border-slate-200 rounded-xl">
      <div class="text-xs font-bold text-slate-800 mb-2">${yesnoQuestion} ${yesnoReq ? '<span class="text-[10px] text-rose-500 font-semibold">*Required</span>' : ''}</div>
      <div class="flex items-center gap-4 text-xs font-medium text-slate-700">
        <span class="inline-flex items-center gap-1.5"><span class="text-slate-400 font-bold">○</span> ${yesnoYesLabel}</span>
        <span class="inline-flex items-center gap-1.5"><span class="text-slate-400 font-bold">○</span> ${yesnoNoLabel}</span>
      </div>
    </div><p></p>`;

    editor.chain().focus().insertContent(html).run();
    setModalType(null);
  };

  // Insert Initials Field
  const handleInsertInitials = () => {
    if (!initialsLabel.trim()) return;
    const elemId = `elem-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const html = `<div data-element-type="initials" data-element-id="${elemId}" data-required="${initialsReq}" data-label="${initialsLabel.replace(/"/g, '&quot;')}" class="consent-interactive-initials font-sans p-3.5 my-3 bg-slate-50 border border-slate-200 rounded-xl">
      <div class="text-xs font-bold text-slate-800 mb-1.5">${initialsLabel} ${initialsReq ? '<span class="text-[10px] text-rose-500 font-semibold">*Required</span>' : ''}</div>
      <div class="w-32 h-9 border border-slate-300 rounded-lg bg-white flex items-center justify-center text-xs font-bold text-slate-400 border-dashed">
        [ Signer Initials ]
      </div>
    </div><p></p>`;

    editor.chain().focus().insertContent(html).run();
    setModalType(null);
  };

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm font-sans flex flex-col min-h-[500px]">
      {/* Top Editor Toolbar */}
      <div className="bg-slate-50 border-b border-slate-200 p-2 flex flex-wrap items-center gap-1.5 z-10 sticky top-0">
        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1.5">
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1.5 text-slate-600 hover:bg-slate-200 rounded-lg text-xs disabled:opacity-30"
            title="Undo"
          >
            ↩
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1.5 text-slate-600 hover:bg-slate-200 rounded-lg text-xs disabled:opacity-30"
            title="Redo"
          >
            ↪
          </button>
        </div>

        {/* Headings */}
        <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1.5">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`px-2 py-1 text-xs font-bold rounded-lg transition-colors ${
              editor.isActive('heading', { level: 1 }) ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            H1
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`px-2 py-1 text-xs font-bold rounded-lg transition-colors ${
              editor.isActive('heading', { level: 2 }) ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`px-2 py-1 text-xs font-bold rounded-lg transition-colors ${
              editor.isActive('heading', { level: 3 }) ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            H3
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setParagraph().run()}
            className={`px-2 py-1 text-xs font-medium rounded-lg transition-colors ${
              editor.isActive('paragraph') ? 'bg-blue-600 text-white font-bold' : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            Body
          </button>
        </div>

        {/* Formatting */}
        <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1.5">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 font-extrabold rounded-lg text-xs transition-colors ${
              editor.isActive('bold') ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`}
            title="Bold"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 italic font-serif font-bold rounded-lg text-xs transition-colors ${
              editor.isActive('italic') ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`}
            title="Italic"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 underline font-bold rounded-lg text-xs transition-colors ${
              editor.isActive('underline') ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`}
            title="Underline"
          >
            U
          </button>
        </div>

        {/* Lists */}
        <div className="flex items-center gap-0.5 border-r border-slate-200 pr-1.5">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${
              editor.isActive('bulletList') ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`}
            title="Bullet List"
          >
            • List
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${
              editor.isActive('orderedList') ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`}
            title="Numbered List"
          >
            1. List
          </button>
        </div>

        {/* Interactive Signer Elements & Image Toolbar Group */}
        <div className="flex items-center gap-1 border-r border-slate-200 pr-1.5">
          <button
            type="button"
            onClick={() => setModalType('image_upload')}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all flex items-center gap-1 shadow-2xs"
            title="Insert Image"
          >
            🖼️ Image
          </button>

          <button
            type="button"
            onClick={() => setModalType('checkbox')}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all flex items-center gap-1 shadow-2xs"
            title="Insert Checkbox Field"
          >
            ☑ Checkbox
          </button>

          <button
            type="button"
            onClick={() => setModalType('yes_no')}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all flex items-center gap-1 shadow-2xs"
            title="Insert Yes / No Field"
          >
            🔘 Yes / No
          </button>

          <button
            type="button"
            onClick={() => setModalType('initials')}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all flex items-center gap-1 shadow-2xs"
            title="Insert Initials Field"
          >
            ✍️ Initials
          </button>
        </div>

        {/* Link & Tables & Divider */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={setLink}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
              editor.isActive('link') ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            Link
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            className="px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
            title="Insert Table"
          >
            + Table
          </button>
        </div>
      </div>

      {/* Editor Content Canvas */}
      <div className="p-6 md:p-8 flex-1 prose prose-slate max-w-none focus:outline-none min-h-[400px]">
        <EditorContent editor={editor} />
      </div>

      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/png,image/jpeg,image/jpg,image/webp"
        onChange={handleImageFileSelected}
        className="hidden"
      />

      {/* MODAL CONFIGURATORS */}

      {/* 1. Image Upload Modal */}
      {modalType === 'image_upload' && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5 border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Insert Image</h3>
              <button type="button" onClick={() => setModalType(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">✕</button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold">
                {modalError}
              </div>
            )}

            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Upload a PNG, JPG, or WEBP image to embed into the consent template. Max file size: 5 MB.
              </p>

              <button
                type="button"
                disabled={uploadingImage}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/50 rounded-xl text-xs font-bold text-slate-600 hover:text-blue-600 transition-all flex flex-col items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <span className="text-xl">📁</span>
                <span>{uploadingImage ? 'Uploading Image...' : 'Select Image File'}</span>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Checkbox Config Modal */}
      {modalType === 'checkbox' && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Configure Checkbox Field</h3>
              <button type="button" onClick={() => setModalType(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Label / Statement *</label>
                <input
                  type="text"
                  value={checkboxLabel}
                  onChange={e => setCheckboxLabel(e.target.value)}
                  placeholder="e.g. I agree to receive phone calls."
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description / Helper Text (Optional)</label>
                <input
                  type="text"
                  value={checkboxDesc}
                  onChange={e => setCheckboxDesc(e.target.value)}
                  placeholder="e.g. Message rates may apply."
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chkReq"
                  checked={checkboxReq}
                  onChange={e => setCheckboxReq(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded"
                />
                <label htmlFor="chkReq" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Required field (signer must check to submit)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInsertCheckbox}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all"
              >
                Insert Checkbox
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Yes/No Config Modal */}
      {modalType === 'yes_no' && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Configure Yes / No Field</h3>
              <button type="button" onClick={() => setModalType(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Question / Statement *</label>
                <input
                  type="text"
                  value={yesnoQuestion}
                  onChange={e => setYesnoQuestion(e.target.value)}
                  placeholder="e.g. Do you authorize us to leave voicemail messages?"
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Yes Option Label</label>
                  <input
                    type="text"
                    value={yesnoYesLabel}
                    onChange={e => setYesnoYesLabel(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">No Option Label</label>
                  <input
                    type="text"
                    value={yesnoNoLabel}
                    onChange={e => setYesnoNoLabel(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="ynReq"
                  checked={yesnoReq}
                  onChange={e => setYesnoReq(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded"
                />
                <label htmlFor="ynReq" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Required field (signer must choose one)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInsertYesNo}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all"
              >
                Insert Yes / No Field
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Initials Config Modal */}
      {modalType === 'initials' && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Configure Initials Field</h3>
              <button type="button" onClick={() => setModalType(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Field Label *</label>
                <input
                  type="text"
                  value={initialsLabel}
                  onChange={e => setInitialsLabel(e.target.value)}
                  placeholder="e.g. Signer Initials"
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="initReq"
                  checked={initialsReq}
                  onChange={e => setInitialsReq(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded"
                />
                <label htmlFor="initReq" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Required field (signer must provide initials)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInsertInitials}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all"
              >
                Insert Initials Field
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
