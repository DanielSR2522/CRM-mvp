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
  switch (fieldType) {
    case 'date':
      return 'w-full max-w-[220px]';
    case 'yes_no':
    case 'zip':
      return 'w-full max-w-[180px]';
    case 'long_text':
    case 'security_question':
    case 'notes':
      return 'w-full max-w-[320px]';
    case 'textarea':
      return 'w-full max-w-[320px] sm:max-w-[420px]';
    case 'text':
    case 'email':
    case 'phone':
    case 'ssn':
    case 'secret':
    case 'credential':
    case 'number':
    case 'currency':
    case 'select':
    case 'state':
    case 'short_id':
    case 'policy_number':
    default:
      return 'w-full max-w-[260px]';
  }
}

export const BASE_INLINE_INPUT_CLASSES =
  'h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] font-normal leading-[20px] text-[#253247] outline-none focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-colors font-sans';

export const BASE_INLINE_SELECT_CLASSES =
  'h-[34px] bg-white border border-slate-300 rounded-md px-3 text-[15px] font-normal leading-[20px] text-[#253247] outline-none focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 transition-colors font-sans cursor-pointer';
