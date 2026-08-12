import React from 'react';

interface CrmPageContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Shared layout wrapper for all major SmarTrack CRM pages.
 * Ensures consistent 100% width, flexible max-width, and uniform vertical section spacing
 * across all top-level routes within DashboardLayout.
 */
export default function CrmPageContainer({ children, className = '' }: CrmPageContainerProps) {
  return (
    <div className={`w-full max-w-none space-y-6 font-sans ${className}`}>
      {children}
    </div>
  );
}
