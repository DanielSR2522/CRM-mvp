'use client';

import React, { useState } from 'react';

interface MarketingMediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectImage: (url: string) => void;
}

const STOCK_CARRIER_MEDIA = [
  { name: 'SmarTrack Brand Header', url: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?w=1200&q=80', category: 'Banner' },
  { name: 'Health Insurance Renewal', url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&q=80', category: 'Banner' },
  { name: 'Ambetter Health Logo', url: 'https://via.placeholder.com/240x80/0284c7/ffffff?text=Ambetter+Health', category: 'Carrier' },
  { name: 'Oscar Health Logo', url: 'https://via.placeholder.com/240x80/ff6b00/ffffff?text=Oscar+Health', category: 'Carrier' },
  { name: 'Florida Blue Logo', url: 'https://via.placeholder.com/240x80/1e40af/ffffff?text=Florida+Blue', category: 'Carrier' },
  { name: 'Aetna Health Logo', url: 'https://via.placeholder.com/240x80/7e22ce/ffffff?text=Aetna', category: 'Carrier' },
  { name: 'Molina Healthcare Logo', url: 'https://via.placeholder.com/240x80/047857/ffffff?text=Molina+Healthcare', category: 'Carrier' },
  { name: 'UnitedHealthcare Logo', url: 'https://via.placeholder.com/240x80/b91c1c/ffffff?text=UnitedHealthcare', category: 'Carrier' },
];

export default function MarketingMediaPickerModal({
  isOpen,
  onClose,
  onSelectImage,
}: MarketingMediaPickerModalProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'stock'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [customUrlInput, setCustomUrlInput] = useState('');

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrorMsg('File size exceeds 5MB limit.');
        setSelectedFile(null);
        return;
      }
      const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
      if (!allowed.includes(file.type.toLowerCase())) {
        setErrorMsg('Invalid image type. Only PNG, JPG, WEBP, and GIF are supported.');
        setSelectedFile(null);
        return;
      }
      setErrorMsg(null);
      setSelectedFile(file);
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile) {
      setErrorMsg('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/marketing/upload-asset', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Upload failed.');
      }

      onSelectImage(data.url);
      onClose();
    } catch (err: any) {
      console.error('Media upload error:', err);
      setErrorMsg(err.message || 'Error uploading file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCustomUrlSubmit = () => {
    if (!customUrlInput.trim() || !customUrlInput.startsWith('http')) {
      setErrorMsg('Please enter a valid HTTP/HTTPS image URL.');
      return;
    }
    onSelectImage(customUrlInput.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 font-sans">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-xl w-full p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">CRM Media & File Browser</h3>
            <p className="text-xs text-slate-500">Select or upload authorized images for your campaign email</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 font-bold hover:text-slate-700 text-sm">✕</button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => { setActiveTab('upload'); setErrorMsg(null); }}
            className={`flex-1 py-1.5 rounded-lg transition-all ${activeTab === 'upload' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'}`}
          >
            📤 Upload New File
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('stock'); setErrorMsg(null); }}
            className={`flex-1 py-1.5 rounded-lg transition-all ${activeTab === 'stock' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'}`}
          >
            🛡️ Brand & Carrier Library
          </button>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* TAB 1: UPLOAD NEW FILE */}
        {activeTab === 'upload' && (
          <div className="space-y-4 text-xs">
            <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50 rounded-2xl p-6 text-center space-y-2 transition-colors">
              <span className="text-3xl block">🖼️</span>
              <span className="block font-bold text-slate-800">Drag & Drop Image or Click to Browse</span>
              <span className="block text-[11px] text-slate-400">PNG, JPG, WEBP, GIF up to 5MB</span>
              <input
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/webp, image/gif"
                onChange={handleFileChange}
                className="block mx-auto text-xs text-slate-500 cursor-pointer pt-2"
              />
            </div>

            {selectedFile && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-blue-900">{selectedFile.name}</span>
                  <span className="text-[11px] text-blue-600 ml-2">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                </div>
                <button
                  type="button"
                  onClick={handleUploadSubmit}
                  disabled={isUploading}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all shadow-sm disabled:opacity-50"
                >
                  {isUploading ? 'Uploading...' : 'Confirm Upload'}
                </button>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 space-y-2">
              <label className="block font-bold text-slate-700">Or Paste Direct Image Web URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  placeholder="https://example.com/image.png"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-semibold"
                />
                <button
                  type="button"
                  onClick={handleCustomUrlSubmit}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl"
                >
                  Use URL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BRAND & CARRIER LIBRARY */}
        {activeTab === 'stock' && (
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            <span className="block text-xs font-bold text-slate-700">Select an Approved CRM Asset</span>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {STOCK_CARRIER_MEDIA.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    onSelectImage(item.url);
                    onClose();
                  }}
                  className="p-3 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl cursor-pointer transition-all space-y-2 group"
                >
                  <div className="h-16 bg-white border border-slate-100 rounded-lg flex items-center justify-center overflow-hidden">
                    <img src={item.url} alt={item.name} className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-[11px] truncate">{item.name}</span>
                    <span className="text-[10px] text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-100">{item.category}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
