'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { EmailBlock, EmailBlockType, MarketingTemplate, MarketingSenderAccount } from '@/types/marketing';
import { compileBlocksToEmailHtml, GlobalEmailStyles } from '@/lib/marketing/email-block-compiler';
import { replacePersonalizationTokens, ALLOWED_PERSONALIZATION_VARIABLES } from '@/lib/marketing/personalization';
import MarketingMediaPickerModal from './MarketingMediaPickerModal';

export interface RecipientPreviewContext {
  id: string;
  name: string;
  email: string;
  carrier?: string;
  policyNumber?: string;
  agentName?: string;
}

interface VisualEmailBuilderProps {
  initialHtml?: string;
  templates: MarketingTemplate[];
  senderAccounts: MarketingSenderAccount[];
  selectedRecipients?: RecipientPreviewContext[];
  subject: string;
  setSubject: (val: string) => void;
  previewText: string;
  setPreviewText: (val: string) => void;
  fromName: string;
  setFromName: (val: string) => void;
  fromEmail: string;
  setFromEmail: (val: string) => void;
  replyTo: string;
  setReplyTo: (val: string) => void;
  onChangeHtml: (html: string) => void;
  onSaveAsTemplate?: (name: string, category: string, html: string) => Promise<void>;
  onSaveDraft?: () => Promise<void>;
}

export default function VisualEmailBuilder({
  initialHtml,
  templates,
  senderAccounts,
  selectedRecipients = [],
  subject,
  setSubject,
  previewText,
  setPreviewText,
  fromName,
  fromEmail,
  onChangeHtml,
  onSaveAsTemplate,
  onSaveDraft,
}: VisualEmailBuilderProps) {
  // Main View Mode: Canvas Editor vs Live Recipient Preview (Eliminates Duplicated View)
  const [workspaceMode, setWorkspaceMode] = useState<'editor' | 'preview'>('editor');

  // Device & Sidebar State
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'content' | 'blocks' | 'body' | 'preview'>('content');

  // Media Picker Modal State
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);

  // Real Recipient Preview Selector State
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>(selectedRecipients[0]?.id || '');

  useEffect(() => {
    if (selectedRecipients.length > 0 && (!selectedRecipientId || !selectedRecipients.some((r) => r.id === selectedRecipientId))) {
      setSelectedRecipientId(selectedRecipients[0].id);
    }
  }, [selectedRecipients, selectedRecipientId]);

  // Global Body Styling State
  const [bodyStyles, setBodyStyles] = useState<GlobalEmailStyles>({
    canvasBg: '#f8fafc',
    contentBg: '#ffffff',
    maxWidth: '600px',
    bodyFont: 'Arial, Helvetica, sans-serif',
    bodyColor: '#0f172a',
    linkColor: '#2563eb',
    outerPadding: '20px',
    borderRadius: '16px',
  });

  // Default Canvas Blocks
  const defaultBlocks: EmailBlock[] = [
    {
      id: 'b-heading',
      type: 'heading',
      headingText: 'Policy Renewal Notice',
      headingLevel: 'h2',
      align: 'center',
      paddingTop: 16,
      paddingBottom: 8,
    },
    {
      id: 'b-text',
      type: 'text',
      text: 'Hello {{first_name}},\n\nYour {{carrier}} policy (Policy #{{policy_number}}) is approaching its annual renewal date. Please review your coverage options below.',
      align: 'left',
      paddingTop: 8,
      paddingBottom: 16,
    },
    {
      id: 'b-cta',
      type: 'button',
      buttonText: 'View Renewal Options',
      buttonUrl: 'https://smartrackcrm.com/renew',
      buttonBgColor: '#2563eb',
      buttonTextColor: '#ffffff',
      buttonAlign: 'center',
      paddingTop: 12,
      paddingBottom: 16,
    },
    {
      id: 'b-signature',
      type: 'signature',
      agentName: '{{agent_name}}',
      agentTitle: 'Licensed Health Specialist',
      agentEmail: 'agent@smartrack.com',
      agentPhone: '(800) 555-0199',
      paddingTop: 16,
      paddingBottom: 16,
    },
  ];

  const [blocks, setBlocks] = useState<EmailBlock[]>(defaultBlocks);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(defaultBlocks[0].id);

  // Undo / Redo History Stack
  const [history, setHistory] = useState<EmailBlock[][]>([defaultBlocks]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const pushHistory = (newBlocks: EmailBlock[]) => {
    const nextHist = history.slice(0, historyIndex + 1);
    nextHist.push(newBlocks);
    setHistory(nextHist);
    setHistoryIndex(nextHist.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex((prev) => prev - 1);
      setBlocks(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex((prev) => prev + 1);
      setBlocks(history[historyIndex + 1]);
    }
  };

  // Save Template Modal State
  const [isSaveTplModalOpen, setIsSaveTplModalOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState<string>('Renewal');

  // Sync Compiled HTML to parent
  useEffect(() => {
    const html = compileBlocksToEmailHtml(blocks, bodyStyles);
    onChangeHtml(html);
  }, [blocks, bodyStyles, onChangeHtml]);

  // Current Selected Recipient Context for Real Preview
  const currentPreviewRecipient = useMemo(() => {
    if (!selectedRecipients || selectedRecipients.length === 0) return null;
    return selectedRecipients.find((r) => r.id === selectedRecipientId) || selectedRecipients[0];
  }, [selectedRecipients, selectedRecipientId]);

  const activeSampleContext = useMemo(() => {
    if (currentPreviewRecipient) {
      return {
        first_name: currentPreviewRecipient.name.split(' ')[0] || currentPreviewRecipient.name,
        last_name: currentPreviewRecipient.name.split(' ').slice(1).join(' ') || '',
        agent_name: currentPreviewRecipient.agentName || fromName || 'Licensed Agent',
        carrier: currentPreviewRecipient.carrier || 'Ambetter',
        policy_number: currentPreviewRecipient.policyNumber || 'POL-FL-98210',
      };
    }
    return null;
  }, [currentPreviewRecipient, fromName]);

  // Interpolated Live Preview Render
  const renderedLiveHtml = useMemo(() => {
    const raw = compileBlocksToEmailHtml(blocks, bodyStyles);
    if (!activeSampleContext) return raw;
    return replacePersonalizationTokens(raw, activeSampleContext);
  }, [blocks, bodyStyles, activeSampleContext]);

  // Currently Selected Block
  const selectedBlock = useMemo(() => {
    return blocks.find((b) => b.id === selectedBlockId) || null;
  }, [blocks, selectedBlockId]);

  // Add Block Handler
  const handleAddBlock = (type: EmailBlockType) => {
    const newId = `b-${Date.now()}`;
    let newBlock: EmailBlock = { id: newId, type, paddingTop: 12, paddingBottom: 12 };

    switch (type) {
      case 'heading':
        newBlock.headingText = 'New Heading Title';
        newBlock.headingLevel = 'h2';
        break;
      case 'text':
        newBlock.text = 'Enter paragraph content here...';
        break;
      case 'image':
        newBlock.imageUrl = 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&q=80';
        newBlock.imageAlt = 'Policy Banner';
        newBlock.imageWidth = '100%';
        newBlock.imageAlign = 'center';
        break;
      case 'button':
        newBlock.buttonText = 'Click Here to Learn More';
        newBlock.buttonUrl = 'https://smartrackcrm.com';
        newBlock.buttonBgColor = '#2563eb';
        newBlock.buttonTextColor = '#ffffff';
        break;
      case 'columns':
        newBlock.col1Text = 'Left column details and updates.';
        newBlock.col2Text = 'Right column details and updates.';
        break;
      case 'divider':
        newBlock.lineColor = '#e2e8f0';
        newBlock.lineThickness = '1px';
        break;
      case 'spacer':
        newBlock.spaceHeight = '24px';
        break;
      case 'social':
        newBlock.socialPlatforms = [
          { platform: 'Facebook', url: '#', icon: '🌐' },
          { platform: 'LinkedIn', url: '#', icon: '💼' },
          { platform: 'WhatsApp', url: '#', icon: '💬' },
        ];
        break;
      case 'menu':
        newBlock.menuLinks = [
          { label: 'Coverage Options', url: '#' },
          { label: 'Carrier Portal', url: '#' },
          { label: 'Contact Agent', url: '#' },
        ];
        break;
      case 'html':
        newBlock.htmlContent = '<div style="padding: 16px; background-color: #f1f5f9; border-radius: 8px; font-family: sans-serif; text-align: center;"><p style="margin: 0; color: #0f172a;">Custom HTML Block Content</p></div>';
        break;
      default:
        break;
    }

    const nextBlocks = [...blocks, newBlock];
    setBlocks(nextBlocks);
    pushHistory(nextBlocks);
    setSelectedBlockId(newId);
  };

  // Move Block Up / Down
  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === blocks.length - 1) return;

    const next = [...blocks];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setBlocks(next);
    pushHistory(next);
  };

  // Duplicate Block
  const handleDuplicateBlock = (block: EmailBlock) => {
    const dup: EmailBlock = { ...block, id: `b-${Date.now()}` };
    const idx = blocks.findIndex((b) => b.id === block.id);
    const next = [...blocks];
    next.splice(idx + 1, 0, dup);
    setBlocks(next);
    pushHistory(next);
    setSelectedBlockId(dup.id);
  };

  // Delete Block
  const handleDeleteBlock = (id: string) => {
    const next = blocks.filter((b) => b.id !== id);
    setBlocks(next);
    pushHistory(next);
    if (selectedBlockId === id) setSelectedBlockId(null);
  };

  // Update Selected Block Property
  const updateSelectedBlock = (updates: Partial<EmailBlock>) => {
    if (!selectedBlockId) return;
    const next = blocks.map((b) => (b.id === selectedBlockId ? { ...b, ...updates } : b));
    setBlocks(next);
  };

  // Insert Personalization Token into active text block field
  const handleInsertToken = (token: string) => {
    if (!selectedBlock) return;
    if (selectedBlock.type === 'heading') {
      updateSelectedBlock({ headingText: (selectedBlock.headingText || '') + ` ${token} ` });
    } else if (selectedBlock.type === 'callout') {
      updateSelectedBlock({ calloutText: (selectedBlock.calloutText || '') + ` ${token} ` });
    } else if (selectedBlock.type === 'html') {
      updateSelectedBlock({ htmlContent: (selectedBlock.htmlContent || '') + `${token}` });
    } else {
      updateSelectedBlock({ text: (selectedBlock.text || '') + ` ${token} ` });
    }
  };

  // Load Selected Template
  const handleLoadTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      if (tpl.subject) setSubject(tpl.subject);
      const tplBlock: EmailBlock = {
        id: `b-${Date.now()}`,
        type: 'html',
        htmlContent: tpl.body_html,
        paddingTop: 12,
        paddingBottom: 12,
      };
      setBlocks([tplBlock]);
      pushHistory([tplBlock]);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-3xl overflow-hidden shadow-sm font-sans flex flex-col">
      {/* TOP TOOLBAR: VIEW MODE SWITCHER (ELIMINATES DUPLICATED PREVIEW STACKING) */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          {/* Workspace View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setWorkspaceMode('editor');
                if (activeSidebarTab === 'preview') setActiveSidebarTab('content');
              }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                workspaceMode === 'editor' ? 'bg-white text-blue-600 shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ✏️ Canvas Editor
            </button>
            <button
              type="button"
              onClick={() => {
                setWorkspaceMode('preview');
                setActiveSidebarTab('preview');
              }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                workspaceMode === 'preview' ? 'bg-white text-blue-600 shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              👁️ Live Recipient Preview
            </button>
          </div>

          {/* Template Selector */}
          <select
            onChange={(e) => handleLoadTemplate(e.target.value)}
            defaultValue=""
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
          >
            <option value="" disabled>-- Load Template --</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                [{t.category}] {t.name}
              </option>
            ))}
          </select>

          {/* Undo / Redo */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="px-2.5 py-1 rounded-lg text-slate-700 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
              title="Undo"
            >
              ↩️ Undo
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="px-2.5 py-1 rounded-lg text-slate-700 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
              title="Redo"
            >
              ↪️ Redo
            </button>
          </div>
        </div>

        {/* Real Recipient Preview Controls */}
        <div className="flex items-center gap-3">
          {/* Device Preview Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setPreviewDevice('desktop')}
              className={`px-2.5 py-1 rounded-lg ${previewDevice === 'desktop' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'}`}
            >
              🖥️ Desktop
            </button>
            <button
              type="button"
              onClick={() => setPreviewDevice('mobile')}
              className={`px-2.5 py-1 rounded-lg ${previewDevice === 'mobile' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'}`}
            >
              📱 Mobile
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Preview As:</span>
            {selectedRecipients.length === 0 ? (
              <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold">
                No recipient selected
              </span>
            ) : (
              <select
                value={selectedRecipientId}
                onChange={(e) => setSelectedRecipientId(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
              >
                {selectedRecipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    👤 {r.name} ({r.email})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Save Actions */}
        <div className="flex items-center gap-2">
          {onSaveDraft && (
            <button
              type="button"
              onClick={() => onSaveDraft()}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all"
            >
              💾 Save Draft
            </button>
          )}
          {onSaveAsTemplate && (
            <button
              type="button"
              onClick={() => setIsSaveTplModalOpen(true)}
              className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold rounded-xl transition-all"
            >
              ⭐ Save as Template
            </button>
          )}
        </div>
      </div>

      {/* SUBJECT & PREVIEW TEXT HEADER BAR */}
      <div className="bg-white border-b border-slate-200 p-6 space-y-3 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Action Required: Your Policy Renewal Notice"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 font-bold text-slate-900 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Preview Text (Inbox Snippet)</label>
            <input
              type="text"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="e.g. Please review upcoming rate choices..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 focus:border-blue-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* THREE-AREA WORKSPACE BODY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 min-h-[650px]">
        {/* LEFT / CENTER: MAIN CANVAS (EDITOR OR PREVIEW MODE) */}
        <div className="lg:col-span-2 p-6 bg-slate-100 flex flex-col justify-start items-center space-y-6 overflow-y-auto">
          {workspaceMode === 'editor' ? (
            /* 1. VISUAL CANVAS EDITOR MODE ONLY (NO STACKED DUPLICATED PREVIEW) */
            <div className="w-full max-w-2xl space-y-4">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                <span>Visual Drag & Drop Canvas</span>
                <span>{blocks.length} Content Blocks</span>
              </div>

              <div className="space-y-3">
                {blocks.map((block, idx) => {
                  const isSelected = selectedBlockId === block.id;
                  return (
                    <div
                      key={block.id}
                      onClick={() => {
                        setSelectedBlockId(block.id);
                      }}
                      className={`relative bg-white rounded-2xl p-4 transition-all cursor-pointer border shadow-2xs group ${
                        isSelected ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md' : 'border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      {/* Quick Action Controls */}
                      <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-900 text-white rounded-xl p-1 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-20">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveBlock(idx, 'up');
                          }}
                          className="px-1.5 py-0.5 hover:bg-slate-700 rounded"
                          title="Move Up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveBlock(idx, 'down');
                          }}
                          className="px-1.5 py-0.5 hover:bg-slate-700 rounded"
                          title="Move Down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateBlock(block);
                          }}
                          className="px-1.5 py-0.5 hover:bg-slate-700 rounded"
                          title="Duplicate"
                        >
                          📋
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBlock(block.id);
                          }}
                          className="px-1.5 py-0.5 hover:bg-rose-600 rounded"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>

                      <span className="inline-block mb-2 px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-extrabold uppercase">
                        {block.type}
                      </span>

                      <div
                        className="prose prose-slate prose-sm text-xs leading-relaxed pointer-events-none"
                        dangerouslySetInnerHTML={{
                          __html: compileBlocksToEmailHtml([block], bodyStyles)
                            .replace(/<!DOCTYPE html>[\s\S]*?<td style="padding:24px;">/, '')
                            .replace(/<\/td>[\s\S]*/, ''),
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* 2. DEDICATED LIVE RECIPIENT PREVIEW MODE ONLY */
            <div className="w-full max-w-2xl space-y-4">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                <span>Live Recipient Personalized Preview ({previewDevice})</span>
                {currentPreviewRecipient ? (
                  <span className="text-emerald-700 font-bold">
                    ✓ Previewing: {currentPreviewRecipient.name} ({currentPreviewRecipient.email})
                  </span>
                ) : (
                  <span className="text-amber-700 font-bold">No recipient selected</span>
                )}
              </div>

              <div
                className={`bg-white border border-slate-200 mx-auto transition-all shadow-xl p-6 ${
                  previewDevice === 'mobile' ? 'w-[320px] rounded-3xl border-4 border-slate-800' : 'w-full rounded-2xl'
                }`}
              >
                <div className="border-b border-slate-100 pb-3 mb-4 text-xs text-slate-500 space-y-1">
                  <div><strong>From:</strong> {fromName} &lt;{fromEmail}&gt;</div>
                  <div><strong>To:</strong> {currentPreviewRecipient?.name || 'Recipient'} &lt;{currentPreviewRecipient?.email || 'email@example.com'}&gt;</div>
                  <div><strong>Subject:</strong> <span className="font-bold text-slate-900">{subject}</span></div>
                </div>

                <div className="prose prose-slate prose-sm text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: renderedLiveHtml }} />
              </div>
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR: CONTENT / BLOCKS / BODY / PREVIEW TABS */}
        <div className="bg-white border-l border-slate-200 p-6 space-y-6 flex flex-col justify-between">
          <div className="space-y-6">
            {/* Sidebar 4-Tab Header */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => { setActiveSidebarTab('content'); setWorkspaceMode('editor'); }}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  activeSidebarTab === 'content' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'
                }`}
              >
                CONTENT
              </button>
              <button
                type="button"
                onClick={() => { setActiveSidebarTab('blocks'); setWorkspaceMode('editor'); }}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  activeSidebarTab === 'blocks' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'
                }`}
              >
                BLOCKS
              </button>
              <button
                type="button"
                onClick={() => { setActiveSidebarTab('body'); setWorkspaceMode('editor'); }}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  activeSidebarTab === 'body' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'
                }`}
              >
                BODY
              </button>
              <button
                type="button"
                onClick={() => { setActiveSidebarTab('preview'); setWorkspaceMode('preview'); }}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  activeSidebarTab === 'preview' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'
                }`}
              >
                PREVIEW
              </button>
            </div>

            {/* TAB 1: CONTENT BLOCKS MENU */}
            {activeSidebarTab === 'content' && (
              <div className="space-y-4">
                <span className="block text-xs font-bold text-slate-700">Add Content Blocks</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { type: 'columns', label: 'Columns', icon: '📊' },
                    { type: 'button', label: 'Button', icon: '🔘' },
                    { type: 'divider', label: 'Divider', icon: '➖' },
                    { type: 'heading', label: 'Heading', icon: '🔤' },
                    { type: 'text', label: 'Paragraph', icon: '📝' },
                    { type: 'image', label: 'Image', icon: '🖼️' },
                    { type: 'social', label: 'Social', icon: '🌐' },
                    { type: 'menu', label: 'Menu', icon: '🔗' },
                    { type: 'html', label: 'HTML', icon: '💻' },
                    { type: 'spacer', label: 'Spacer', icon: '↕️' },
                  ].map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => handleAddBlock(item.type as any)}
                      className="p-3 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 rounded-xl text-left font-bold text-slate-800 transition-all flex items-center gap-2"
                    >
                      <span className="text-base">{item.icon}</span>
                      <span className="text-xs">{item.label}</span>
                    </button>
                  ))}
                </div>

                {/* Selected Block Inspector Controls */}
                {selectedBlock && (
                  <div className="pt-4 border-t border-slate-200 space-y-4 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-extrabold text-slate-900 uppercase">
                        Settings: {selectedBlock.type}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteBlock(selectedBlock.id)}
                        className="text-rose-600 font-bold hover:underline"
                      >
                        Delete
                      </button>
                    </div>

                    {/* Personalization Variable Token Inserter */}
                    <div className="space-y-1.5 bg-blue-50 border border-blue-100 p-3 rounded-xl">
                      <span className="block text-[10px] font-extrabold uppercase text-blue-700">
                        Insert Personalization Token
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {ALLOWED_PERSONALIZATION_VARIABLES.map((v) => (
                          <button
                            key={v.token}
                            type="button"
                            onClick={() => handleInsertToken(v.token)}
                            className="px-2 py-0.5 bg-white border border-blue-200 text-blue-700 rounded text-[10px] font-mono font-bold hover:bg-blue-600 hover:text-white transition-colors"
                          >
                            + {v.token}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Block Form Inputs */}
                    {selectedBlock.type === 'heading' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Heading Text</label>
                          <input
                            type="text"
                            value={selectedBlock.headingText || ''}
                            onChange={(e) => updateSelectedBlock({ headingText: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Heading Level</label>
                          <select
                            value={selectedBlock.headingLevel || 'h2'}
                            onChange={(e) => updateSelectedBlock({ headingLevel: e.target.value as any })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold"
                          >
                            <option value="h1">H1 - Large</option>
                            <option value="h2">H2 - Medium</option>
                            <option value="h3">H3 - Small</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {selectedBlock.type === 'text' && (
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Paragraph Text</label>
                        <textarea
                          rows={5}
                          value={selectedBlock.text || ''}
                          onChange={(e) => updateSelectedBlock({ text: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900"
                        />
                      </div>
                    )}

                    {/* ENHANCED IMAGE BLOCK WITH CRM FILE BROWSER & UPLOAD */}
                    {selectedBlock.type === 'image' && (
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="font-bold text-slate-700">Image Source URL</label>
                            <button
                              type="button"
                              onClick={() => setIsMediaPickerOpen(true)}
                              className="text-[11px] font-extrabold text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                            >
                              <span>📤</span> Upload / Browse Media
                            </button>
                          </div>
                          <input
                            type="text"
                            value={selectedBlock.imageUrl || ''}
                            onChange={(e) => updateSelectedBlock({ imageUrl: e.target.value })}
                            placeholder="https://..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-mono"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Alt Text</label>
                          <input
                            type="text"
                            value={selectedBlock.imageAlt || ''}
                            onChange={(e) => updateSelectedBlock({ imageAlt: e.target.value })}
                            placeholder="Image description"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block font-bold text-slate-700 mb-1">Image Width</label>
                            <select
                              value={selectedBlock.imageWidth || '100%'}
                              onChange={(e) => updateSelectedBlock({ imageWidth: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold text-xs"
                            >
                              <option value="100%">100% (Full Width)</option>
                              <option value="80%">80%</option>
                              <option value="60%">60%</option>
                              <option value="300px">300px Fixed</option>
                              <option value="200px">200px Small</option>
                            </select>
                          </div>

                          <div>
                            <label className="block font-bold text-slate-700 mb-1">Alignment</label>
                            <select
                              value={selectedBlock.imageAlign || 'center'}
                              onChange={(e) => updateSelectedBlock({ imageAlign: e.target.value as any })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold text-xs"
                            >
                              <option value="left">Left</option>
                              <option value="center">Center</option>
                              <option value="right">Right</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Destination Link URL (Optional)</label>
                          <input
                            type="text"
                            value={selectedBlock.buttonUrl || ''}
                            onChange={(e) => updateSelectedBlock({ buttonUrl: e.target.value })}
                            placeholder="https://..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {selectedBlock.type === 'html' && (
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Custom HTML Code</label>
                        <textarea
                          rows={8}
                          value={selectedBlock.htmlContent || ''}
                          onChange={(e) => updateSelectedBlock({ htmlContent: e.target.value })}
                          className="w-full bg-slate-900 text-slate-100 font-mono text-xs p-3 rounded-xl border border-slate-800 outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="<div>Write your HTML here...</div>"
                        />
                      </div>
                    )}

                    {selectedBlock.type === 'button' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Button Label</label>
                          <input
                            type="text"
                            value={selectedBlock.buttonText || ''}
                            onChange={(e) => updateSelectedBlock({ buttonText: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Destination URL</label>
                          <input
                            type="text"
                            value={selectedBlock.buttonUrl || ''}
                            onChange={(e) => updateSelectedBlock({ buttonUrl: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-mono text-[11px]"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="block font-bold text-slate-700 mb-1">Background</label>
                            <input
                              type="color"
                              value={selectedBlock.buttonBgColor || '#2563eb'}
                              onChange={(e) => updateSelectedBlock({ buttonBgColor: e.target.value })}
                              className="h-8 w-full cursor-pointer rounded-lg border border-slate-200 p-1"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block font-bold text-slate-700 mb-1">Text Color</label>
                            <input
                              type="color"
                              value={selectedBlock.buttonTextColor || '#ffffff'}
                              onChange={(e) => updateSelectedBlock({ buttonTextColor: e.target.value })}
                              className="h-8 w-full cursor-pointer rounded-lg border border-slate-200 p-1"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Alignment */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="block font-bold text-slate-700">Alignment</label>
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                        {(['left', 'center', 'right'] as const).map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => updateSelectedBlock({ align: a })}
                            className={`flex-1 py-1 text-xs font-bold rounded-lg uppercase ${
                              (selectedBlock.align || 'left') === a ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'
                            }`}
                          >
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: REUSABLE BLOCKS / TEMPLATES */}
            {activeSidebarTab === 'blocks' && (
              <div className="space-y-4">
                <span className="block text-xs font-bold text-slate-700">Saved Layout Blocks & Templates</span>
                <div className="space-y-2 text-xs">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      onClick={() => handleLoadTemplate(tpl.id)}
                      className="p-3 bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-xl cursor-pointer transition-all space-y-1"
                    >
                      <div className="font-bold text-slate-900">{tpl.name}</div>
                      <div className="text-[11px] text-slate-500">{tpl.category}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: GLOBAL EMAIL BODY SETTINGS */}
            {activeSidebarTab === 'body' && (
              <div className="space-y-4 text-xs">
                <span className="block font-extrabold text-slate-900 uppercase border-b border-slate-100 pb-2">
                  Global Email Body Settings
                </span>

                <div className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Canvas Background Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={bodyStyles.canvasBg || '#f8fafc'}
                        onChange={(e) => setBodyStyles({ ...bodyStyles, canvasBg: e.target.value })}
                        className="h-8 w-12 cursor-pointer rounded-lg border border-slate-200 p-1"
                      />
                      <input
                        type="text"
                        value={bodyStyles.canvasBg || '#f8fafc'}
                        onChange={(e) => setBodyStyles({ ...bodyStyles, canvasBg: e.target.value })}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-2 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Content Background Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={bodyStyles.contentBg || '#ffffff'}
                        onChange={(e) => setBodyStyles({ ...bodyStyles, contentBg: e.target.value })}
                        className="h-8 w-12 cursor-pointer rounded-lg border border-slate-200 p-1"
                      />
                      <input
                        type="text"
                        value={bodyStyles.contentBg || '#ffffff'}
                        onChange={(e) => setBodyStyles({ ...bodyStyles, contentBg: e.target.value })}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-2 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Content Width</label>
                    <select
                      value={bodyStyles.maxWidth || '600px'}
                      onChange={(e) => setBodyStyles({ ...bodyStyles, maxWidth: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold"
                    >
                      <option value="500px">500px - Narrow</option>
                      <option value="600px">600px - Standard Email</option>
                      <option value="680px">680px - Wide</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Font Family</label>
                    <select
                      value={bodyStyles.bodyFont || 'Arial, Helvetica, sans-serif'}
                      onChange={(e) => setBodyStyles({ ...bodyStyles, bodyFont: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-bold"
                    >
                      <option value="Arial, Helvetica, sans-serif">Arial / Sans-Serif</option>
                      <option value="'Helvetica Neue', Helvetica, Arial, sans-serif">Helvetica Neue</option>
                      <option value="Georgia, serif">Georgia / Serif</option>
                      <option value="'Courier New', Courier, monospace">Monospace</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Link Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={bodyStyles.linkColor || '#2563eb'}
                        onChange={(e) => setBodyStyles({ ...bodyStyles, linkColor: e.target.value })}
                        className="h-8 w-12 cursor-pointer rounded-lg border border-slate-200 p-1"
                      />
                      <input
                        type="text"
                        value={bodyStyles.linkColor || '#2563eb'}
                        onChange={(e) => setBodyStyles({ ...bodyStyles, linkColor: e.target.value })}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-2 font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: LIVE PREVIEW INFO */}
            {activeSidebarTab === 'preview' && (
              <div className="space-y-4 text-xs">
                <span className="block font-extrabold text-slate-900 uppercase border-b border-slate-100 pb-2">
                  Live Recipient Preview Info
                </span>

                <div className="space-y-3 bg-blue-50 border border-blue-200 p-4 rounded-2xl">
                  <span className="font-bold text-blue-900 block">Personalized Recipient Test</span>
                  <p className="text-slate-600">
                    You are previewing personalized dynamic tokens ({'{{first_name}}'}, {'{{carrier}}'}, etc.) as rendered for real database clients.
                  </p>
                  {currentPreviewRecipient ? (
                    <div className="space-y-1 font-semibold text-slate-800 bg-white p-3 rounded-xl border border-blue-100">
                      <div><strong>Client Name:</strong> {currentPreviewRecipient.name}</div>
                      <div><strong>Client Email:</strong> {currentPreviewRecipient.email}</div>
                      <div><strong>Carrier:</strong> {currentPreviewRecipient.carrier || 'Ambetter'}</div>
                      <div><strong>Policy #:</strong> {currentPreviewRecipient.policyNumber || 'POL-FL-98210'}</div>
                    </div>
                  ) : (
                    <span className="text-amber-700 font-bold">No real recipient selected in Step 1.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SAVE TEMPLATE DIALOG MODAL */}
      {isSaveTplModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 font-sans">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">Save as Custom Template</h3>
              <button type="button" onClick={() => setIsSaveTplModalOpen(false)} className="text-slate-400 font-bold text-sm">✕</button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Template Name</label>
                <input
                  type="text"
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  placeholder="e.g. My Custom Renewal Layout"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Category</label>
                <select
                  value={tplCategory}
                  onChange={(e) => setTplCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-bold"
                >
                  <option value="Renewal">Renewal</option>
                  <option value="Payment Reminder">Payment Reminder</option>
                  <option value="Welcome">Welcome</option>
                  <option value="Lead Follow-up">Lead Follow-up</option>
                  <option value="Reactivation">Reactivation</option>
                  <option value="Referral Request">Referral Request</option>
                  <option value="Birthday">Birthday</option>
                  <option value="Promotion">Promotion</option>
                  <option value="Announcement">Announcement</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setIsSaveTplModalOpen(false)} className="px-4 py-2 font-bold text-slate-600 text-xs">Cancel</button>
              <button
                type="button"
                onClick={async () => {
                  if (!tplName.trim()) {
                    alert('Please enter a template name.');
                    return;
                  }
                  if (onSaveAsTemplate) {
                    await onSaveAsTemplate(tplName.trim(), tplCategory, compileBlocksToEmailHtml(blocks, bodyStyles));
                  }
                  setIsSaveTplModalOpen(false);
                  setTplName('');
                }}
                className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl text-xs shadow-md"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CRM MEDIA & FILE PICKER MODAL */}
      <MarketingMediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelectImage={(url) => {
          updateSelectedBlock({ imageUrl: url });
        }}
      />
    </div>
  );
}
