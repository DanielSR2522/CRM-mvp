import React from 'react';
import UnifiedNotesManager from '@/components/notes/UnifiedNotesManager';

interface HealthNotesProps {
  clientId: string;
  healthPolicyId: string;
  currentUserId: string | null;
  addToast: (toast: { title: string; description: string; type: 'success' | 'error' | 'warning' }) => void;
}

export default function HealthNotes({
  clientId,
  healthPolicyId,
  currentUserId,
  addToast
}: HealthNotesProps) {
  return (
    <UnifiedNotesManager
      clientId={clientId}
      inferredCategory="health"
      policyId={healthPolicyId}
      currentUserId={currentUserId}
      addToast={addToast}
    />
  );
}
