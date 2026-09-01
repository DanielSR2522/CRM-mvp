'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import OverviewTab from '@/components/carrier-portals/OverviewTab';
import CarrierBookTab from '@/components/carrier-portals/CarrierBookTab';
import PaymentsTab from '@/components/carrier-portals/PaymentsTab';
import UnmatchedTab from '@/components/carrier-portals/UnmatchedTab';
import SyncHistoryTab from '@/components/carrier-portals/SyncHistoryTab';
import ConnectionsTab from '@/components/carrier-portals/ConnectionsTab';
import ImportCsvModal from '@/components/carrier-portals/ImportCsvModal';
import ManualMatchModal from '@/components/carrier-portals/ManualMatchModal';
import AddCarrierModal from '@/components/carrier-portals/AddCarrierModal';

function CarrierPortalsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get('tab') || 'overview';
  // Map legacy 'oscar' tab parameter to 'books'
  const activeTab = rawTab === 'oscar' ? 'books' : rawTab;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    connection: any;
    allConnections: any[];
    kpis: any;
    records: any[];
    matches: any[];
    events: any[];
    syncRuns: any[];
  }>({
    connection: null,
    allConnections: [],
    kpis: null,
    records: [],
    matches: [],
    events: [],
    syncRuns: [],
  });

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddCarrierModalOpen, setIsAddCarrierModalOpen] = useState(false);
  const [matchModalRecord, setMatchModalRecord] = useState<any | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/carrier-portals/data?carrier=all');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to load carrier portal data.');
      }
      setData({
        connection: json.connection,
        allConnections: json.allConnections || [],
        kpis: json.kpis,
        records: json.records || [],
        matches: json.matches || [],
        events: json.events || [],
        syncRuns: json.syncRuns || [],
      });
    } catch (err: any) {
      console.error('Error fetching carrier portals data:', err);
      setError(err?.message || 'Error loading carrier portal data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectTab = (tabKey: string) => {
    router.push(`/carrier-portals?tab=${tabKey}`);
  };

  const handleSyncNow = async (carrier = 'oscar') => {
    try {
      const res = await fetch('/api/carrier-portals/automation/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Sync now error:', err);
    }
  };

  const handleToggleAutomation = async (carrier = 'oscar') => {
    try {
      const conn = (data.allConnections || []).find((c: any) => c.carrier === carrier.toLowerCase());
      const isEnabled = conn?.automation_enabled !== false;

      const res = await fetch('/api/carrier-portals/automation/toggle-automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carrier,
          enabled: !isEnabled,
          sync_interval_hours: 8,
        }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Toggle automation error:', err);
    }
  };

  const handleConnectCarrier = async (carrier = 'oscar') => {
    try {
      const res = await fetch('/api/carrier-portals/automation/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Connect carrier error:', err);
    }
  };

  const handleValidateSession = async (carrier = 'oscar') => {
    try {
      const res = await fetch('/api/carrier-portals/automation/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Validate session error:', err);
    }
  };

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'books', label: 'Books', count: data.records.length },
    { key: 'payments', label: 'Payments', count: data.kpis?.paymentsDueCount || 0, highlight: data.kpis?.gracePeriodCount > 0 },
    { key: 'unmatched', label: 'Unmatched / Review', count: (data.kpis?.unmatchedCount || 0) + (data.kpis?.reviewCount || 0) },
    { key: 'sync-history', label: 'Sync History', count: data.syncRuns.length },
    { key: 'connections', label: 'Connections', count: data.allConnections.length },
  ];

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto font-sans">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">☁</span>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Carrier Portals</h1>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Multi-Carrier Intelligence Engine • Oscar, Ambetter, Molina &amp; Automated Portal Sync
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAddCarrierModalOpen(true)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10"
            >
              <span>+ Add Carrier</span>
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-2xs"
            >
              <span>⬆</span>
              <span>Import Carrier CSV</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-slate-200/80 flex items-center gap-2 overflow-x-auto pb-px font-sans">
          {tabs.map((t) => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => handleSelectTab(t.key)}
                className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border-b-2 ${
                  isActive
                    ? 'border-blue-600 text-blue-600 bg-blue-50/40 rounded-t-xl'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-xl'
                }`}
              >
                <span>{t.label}</span>
                {t.count !== undefined && t.count > 0 && (
                  <span
                    className={`ml-2 px-2 py-0.5 rounded-full text-[10px] ${
                      t.highlight
                        ? 'bg-amber-100 text-amber-800 font-extrabold'
                        : isActive
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Main Content Area */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="inline-block animate-spin text-3xl text-blue-600">⌛</div>
            <p className="text-xs font-bold text-slate-600">Loading Carrier Portals Intelligence...</p>
          </div>
        ) : error ? (
          <div className="p-6 rounded-2xl bg-rose-50 border border-rose-100 text-rose-800 text-xs font-semibold space-y-3">
            <p className="font-extrabold text-sm">⚠ Error Loading Carrier Data</p>
            <p>{error}</p>
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-rose-700 transition-all"
            >
              Retry Load
            </button>
          </div>
        ) : (
          <div>
            {activeTab === 'overview' && (
              <OverviewTab
                kpis={data.kpis}
                connection={data.connection}
                allConnections={data.allConnections}
                onOpenImportModal={() => setIsImportModalOpen(true)}
                onSelectTab={handleSelectTab}
                onRefresh={fetchData}
              />
            )}

            {activeTab === 'books' && (
              <CarrierBookTab
                records={data.records}
                onOpenMatchModal={(rec) => setMatchModalRecord(rec)}
                onOpenImportModal={() => setIsImportModalOpen(true)}
              />
            )}

            {activeTab === 'payments' && (
              <PaymentsTab
                records={data.records}
                onOpenMatchModal={(rec) => setMatchModalRecord(rec)}
              />
            )}

            {activeTab === 'unmatched' && (
              <UnmatchedTab
                records={data.records}
                onOpenMatchModal={(rec) => setMatchModalRecord(rec)}
                onRefresh={fetchData}
              />
            )}

            {activeTab === 'sync-history' && (
              <SyncHistoryTab syncRuns={data.syncRuns} />
            )}

            {activeTab === 'connections' && (
              <ConnectionsTab
                connection={data.connection}
                allConnections={data.allConnections}
                onConnectCarrier={handleConnectCarrier}
                onValidateSession={handleValidateSession}
                onSyncNow={handleSyncNow}
                onToggleAutomation={handleToggleAutomation}
                onOpenImportModal={() => setIsImportModalOpen(true)}
                onOpenAddCarrierModal={() => setIsAddCarrierModalOpen(true)}
              />
            )}
          </div>
        )}

        {/* Modals */}
        <ImportCsvModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={fetchData}
          carrier="Oscar"
        />

        <AddCarrierModal
          isOpen={isAddCarrierModalOpen}
          onClose={() => setIsAddCarrierModalOpen(false)}
          onSuccess={fetchData}
          allConnections={data.allConnections}
        />

        <ManualMatchModal
          isOpen={Boolean(matchModalRecord)}
          onClose={() => setMatchModalRecord(null)}
          onSuccess={fetchData}
          carrierRecord={matchModalRecord}
        />
      </div>
    </DashboardLayout>
  );
}

export default function CarrierPortalsPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="py-20 text-center text-xs font-bold text-slate-500">
            Loading Carrier Portals...
          </div>
        </DashboardLayout>
      }
    >
      <CarrierPortalsContent />
    </Suspense>
  );
}
