'use client';

import React from 'react';

export interface ColumnDefinition {
  id: string;
  label: string;
  defaultVisible: boolean;
}

export const ALL_CLIENT_COLUMNS: ColumnDefinition[] = [
  { id: 'checkbox', label: 'Multi-Select Checkbox', defaultVisible: true },
  { id: 'name', label: 'Client Name', defaultVisible: true },
  { id: 'contact', label: 'Primary Contact (Email/Phone)', defaultVisible: true },
  { id: 'policy_types', label: 'Policy Types (Badges)', defaultVisible: true },
  { id: 'status', label: 'Client Type / Status', defaultVisible: true },
  { id: 'agent', label: 'Assigned Agent', defaultVisible: true },
  { id: 'updated_at', label: 'Last Modified Date', defaultVisible: true },
  { id: 'created_at', label: 'Created On Date', defaultVisible: true },
  { id: 'address', label: 'Address / City / State', defaultVisible: false },
  { id: 'agency', label: 'Agency Name', defaultVisible: false },
];

interface ClientsManageColumnsModalProps {
  isOpen: boolean;
  onClose: () => void;
  visibleColumns: string[];
  onChangeColumns: (columns: string[]) => void;
}

export default function ClientsManageColumnsModal({
  isOpen,
  onClose,
  visibleColumns,
  onChangeColumns,
}: ClientsManageColumnsModalProps) {
  if (!isOpen) return null;

  const toggleColumn = (colId: string) => {
    if (colId === 'name' || colId === 'checkbox') return; // Always keep name & checkbox
    if (visibleColumns.includes(colId)) {
      onChangeColumns(visibleColumns.filter((c) => c !== colId));
    } else {
      onChangeColumns([...visibleColumns, colId]);
    }
  };

  const handleReset = () => {
    const defaults = ALL_CLIENT_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);
    onChangeColumns(defaults);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-4 font-sans animate-scale-up">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-extrabold text-slate-900">Manage Visible Columns</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xs font-bold"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-500 font-medium">
          Choose which profile fields are displayed in the master table. Preferences are saved automatically.
        </p>

        <div className="space-y-2 max-h-60 overflow-y-auto py-1">
          {ALL_CLIENT_COLUMNS.map((col) => {
            const isChecked = visibleColumns.includes(col.id);
            const isRequired = col.id === 'name' || col.id === 'checkbox';

            return (
              <label
                key={col.id}
                className={`flex items-center justify-between p-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                  isChecked ? 'bg-blue-50/70 border-blue-200 text-slate-900' : 'bg-slate-50 border-slate-200 text-slate-600'
                } ${isRequired ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isRequired}
                    onChange={() => toggleColumn(col.id)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <span>{col.label}</span>
                </div>
                {isRequired && <span className="text-[10px] text-slate-400 font-bold uppercase">Required</span>}
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs font-bold text-slate-500 hover:text-slate-800"
          >
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
