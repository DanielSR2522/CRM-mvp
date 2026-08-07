'use client';

import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';

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

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm font-sans flex flex-col min-h-[500px]">
      {/* Editor Toolbar */}
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

        {/* Link & Tables */}
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
            title="Insert 3x3 Table"
          >
            + Table
          </button>

          {editor.isActive('table') && (
            <div className="flex items-center gap-1 bg-slate-200 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => editor.chain().focus().addRowAfter().run()}
                className="px-1.5 py-0.5 text-[10px] bg-white text-slate-700 rounded hover:bg-slate-100 font-bold"
              >
                +Row
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                className="px-1.5 py-0.5 text-[10px] bg-white text-slate-700 rounded hover:bg-slate-100 font-bold"
              >
                +Col
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteTable().run()}
                className="px-1.5 py-0.5 text-[10px] bg-rose-600 text-white rounded hover:bg-rose-700 font-bold"
              >
                Del Table
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor Content Box */}
      <div className="p-6 md:p-8 flex-1 prose prose-slate max-w-none focus:outline-none min-h-[400px]">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
