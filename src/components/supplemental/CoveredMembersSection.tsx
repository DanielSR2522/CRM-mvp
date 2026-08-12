'use client';

import React from 'react';
import { SupplementalCoveredMember } from '@/types/supplemental';
import { formatIsoToUsDate } from '@/utils/dateUtils';

interface Props {
  members: SupplementalCoveredMember[];
  onOpenAddMember: () => void;
  onOpenEditMember: (member: SupplementalCoveredMember) => void;
  onOpenDeleteMember: (member: SupplementalCoveredMember) => void;
}

export default function CoveredMembersSection({
  members,
  onOpenAddMember,
  onOpenEditMember,
  onOpenDeleteMember,
}: Props) {
  return (
    <div className="crm-card p-5 space-y-4 font-sans">
      <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-3">
        <div>
          <h3 className="text-base font-extrabold text-[#172033] flex items-center gap-2">
            Covered Members
            <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#2563EB]/10 text-[#2563EB]">
              {members.length}
            </span>
          </h3>
          <p className="text-xs text-[#7C8799] mt-0.5">
            Individuals covered under this supplemental policy.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenAddMember}
          className="inline-flex items-center gap-1.5 bg-[#EEF4FF] hover:bg-[#DCE6FF] text-[#2563EB] text-xs font-bold px-3.5 py-2 rounded-xl transition-all active:scale-[0.98]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          + Add Covered Person
        </button>
      </div>

      {members.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-[#DCE2EA] rounded-2xl bg-[#F8FAFC]">
          <p className="text-xs text-[#7C8799] font-medium">No covered members added yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {members.map((m) => (
            <div
              key={m.id}
              className="p-3.5 bg-[#F8FAFC] border border-[#E8ECF2] rounded-xl flex items-start justify-between gap-3 group hover:border-[#CBD5E1] transition-all"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-extrabold text-[#172033] truncate">{m.full_name}</p>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#EEF4FF] text-[#2563EB]">
                    {m.relationship}
                  </span>
                </div>

                {m.birth_date && (
                  <p className="text-[11px] text-[#556176] font-medium truncate">
                    🎂 Birth Date: <strong className="text-[#172033]">{formatIsoToUsDate(m.birth_date)}</strong>
                  </p>
                )}

                {m.phone && (
                  <p className="text-[11px] text-[#556176] font-medium truncate">
                    📞 {m.phone}
                  </p>
                )}

                {m.member_id && (
                  <p className="text-[11px] text-[#7C8799] font-medium truncate">
                    ID: {m.member_id}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenEditMember(m)}
                  className="p-1 text-[#556176] hover:text-[#2563EB] hover:bg-white rounded transition-all"
                  title="Edit Covered Member"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenDeleteMember(m)}
                  className="p-1 text-[#556176] hover:text-rose-600 hover:bg-white rounded transition-all"
                  title="Delete Covered Member"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
