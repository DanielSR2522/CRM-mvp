'use client';

import React, { useState } from 'react';
import { MarketingTemplate, TemplateCategory } from '@/types/marketing';
import { replacePersonalizationTokens, ALLOWED_PERSONALIZATION_VARIABLES } from '@/lib/marketing/personalization';

interface TemplatesViewProps {
  templates: MarketingTemplate[];
  onCreateTemplate: (tplData: Partial<MarketingTemplate>) => Promise<MarketingTemplate>;
}

export default function TemplatesView({ templates, onCreateTemplate }: TemplatesViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<MarketingTemplate | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Editor Modal
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('Custom');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('<p>Hello {{first_name}},</p><p>Insert message content here...</p>');

  const categories: TemplateCategory[] = [
    'Renewal', 'Payment Reminder', 'Welcome', 'Lead Follow-up', 
    'Reactivation', 'Referral Request', 'Birthday', 'Promotion', 
    'Announcement', 'Custom'
  ];

  const filteredTemplates = templates.filter((t) => {
    const matchesCategory = selectedCategory === 'ALL' || t.category === selectedCategory;
    const matchesSearch = !searchTerm.trim() || t.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleDuplicate = async (tpl: MarketingTemplate) => {
    await onCreateTemplate({
      name: `${tpl.name} (Copy)`,
      category: tpl.category,
      subject: tpl.subject,
      body_html: tpl.body_html,
      is_favorite: false,
    });
  };

  const handleSaveNewTemplate = async () => {
    if (!templateName.trim()) {
      alert('Please enter a template name.');
      return;
    }
    await onCreateTemplate({
      name: templateName.trim(),
      category,
      subject: subject.trim(),
      body_html: bodyHtml,
    });
    setIsEditorOpen(false);
    setTemplateName('');
    setSubject('');
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header Actions & Filter Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="w-64">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search templates..."
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-3.5 py-1.5 text-xs text-slate-800 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsEditorOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-600/10 flex items-center gap-1.5"
          >
            <span>+</span> Create Template
          </button>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
              selectedCategory === 'ALL' ? 'bg-blue-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                selectedCategory === cat ? 'bg-blue-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Templates Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((tpl) => (
          <div key={tpl.id} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-md">
                  {tpl.category}
                </span>
                {tpl.is_system && (
                  <span className="text-[10px] font-bold text-slate-400">Predefined</span>
                )}
              </div>
              <h4 className="text-sm font-bold text-slate-900 leading-snug">{tpl.name}</h4>
              <p className="text-xs text-slate-500 truncate">{tpl.subject || 'No subject'}</p>
            </div>

            <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPreviewTemplate(tpl)}
                className="text-xs font-bold text-slate-700 hover:text-blue-600 transition-colors"
              >
                👁️ Preview
              </button>
              <button
                type="button"
                onClick={() => handleDuplicate(tpl)}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                Duplicate →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">{previewTemplate.name}</h3>
                <span className="text-xs text-slate-400">Category: {previewTemplate.category}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('desktop')}
                    className={`px-2 py-0.5 text-xs font-bold rounded-lg ${previewDevice === 'desktop' ? 'bg-white text-blue-600' : 'text-slate-600'}`}
                  >
                    Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('mobile')}
                    className={`px-2 py-0.5 text-xs font-bold rounded-lg ${previewDevice === 'mobile' ? 'bg-white text-blue-600' : 'text-slate-600'}`}
                  >
                    Mobile
                  </button>
                </div>
                <button type="button" onClick={() => setPreviewTemplate(null)} className="text-slate-400 font-bold text-sm">✕</button>
              </div>
            </div>

            <div className={`border border-slate-200 rounded-2xl bg-white p-4 max-h-96 overflow-y-auto ${
              previewDevice === 'mobile' ? 'max-w-xs mx-auto border-4 border-slate-800 rounded-3xl' : 'w-full'
            }`}>
              <div dangerouslySetInnerHTML={{
                __html: replacePersonalizationTokens(previewTemplate.body_html, {
                  first_name: 'Client',
                  last_name: 'Name',
                  agent_name: 'Agent',
                  carrier: 'Ambetter Health',
                  policy_number: 'POL-102938'
                })
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Editor Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">Create Email Template</h3>
              <button type="button" onClick={() => setIsEditorOpen(false)} className="text-slate-400 font-bold text-sm">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Template Name</label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g. Florida Renewal Notice"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Subject Line</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Action Required: Your {{carrier}} Policy Renewal"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900"
                />
              </div>

              <div>
                <span className="block font-bold text-slate-500 uppercase tracking-wider mb-1">Insert Tokens</span>
                <div className="flex flex-wrap gap-1.5">
                  {ALLOWED_PERSONALIZATION_VARIABLES.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => setBodyHtml((prev) => prev + ` ${v.token} `)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 text-slate-700 text-[11px] font-mono rounded-lg border"
                    >
                      + {v.token}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">HTML Content</label>
                <textarea
                  rows={8}
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  className="w-full bg-slate-900 text-slate-100 font-mono p-3 rounded-2xl border"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button type="button" onClick={() => setIsEditorOpen(false)} className="px-4 py-2 font-bold text-slate-600">Cancel</button>
              <button type="button" onClick={handleSaveNewTemplate} className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl">Save Template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
