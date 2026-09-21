'use client';

import React, { Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import CrmPageContainer from '@/components/layout/CrmPageContainer';
import TicketWorkspaceShell from '@/components/tickets/TicketWorkspaceShell';

export default function TicketsPage() {
  return (
    <DashboardLayout>
      <CrmPageContainer>
        <Suspense fallback={<div className="p-6 text-slate-500 font-medium">Cargando módulo de tickets...</div>}>
          <TicketWorkspaceShell />
        </Suspense>
      </CrmPageContainer>
    </DashboardLayout>
  );
}
