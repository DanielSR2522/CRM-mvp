export type InlineFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'ssn'
  | 'secret'
  | 'credential'
  | 'number'
  | 'currency'
  | 'select'
  | 'state'
  | 'short_id'
  | 'policy_number'
  | 'date'
  | 'yes_no'
  | 'zip'
  | 'long_text'
  | 'security_question'
  | 'notes'
  | 'textarea';

export function getInlineEditorWidthClass(fieldType?: InlineFieldType | string): string {
  return 'w-full flex-1 min-w-0';
}

export const BASE_INLINE_INPUT_CLASSES =
  'h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] font-normal leading-[20px] text-[#253247] outline-none focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-colors font-sans';

export const BASE_INLINE_SELECT_CLASSES =
  'h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] font-normal leading-[20px] text-[#253247] outline-none focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-colors font-sans cursor-pointer';
