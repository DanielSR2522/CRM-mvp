'use client';

import React from 'react';
import UnifiedConsentTemplateEditor from '@/components/consents/UnifiedConsentTemplateEditor';

export default function NewConsentTemplatePage() {
  return (
    <UnifiedConsentTemplateEditor isNew={true} />
  );
}
