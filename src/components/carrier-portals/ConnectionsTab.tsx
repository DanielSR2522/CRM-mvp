'use client';

import React from 'react';
import { formatDateTimeMMDDYYYY } from '@/lib/carrier-portals/date-formatter';
import { CARRIER_REGISTRY, CarrierDefinition } from '@/lib/carrier-portals/carrier-registry';

interface ConnectionsTabProps {
  connection: any;
  allConnections: any[];
  onConnectCarrier: (carrier: string) => void;
  onValidateSession: (carrier: string) => void;
  onSyncNow: (carrier: string) => void;
  onToggleAutomation: (carrier: string) => void;
  onOpenImportModal: () => void;
  onOpenAddCarrierModal: () => void;
}

export default function ConnectionsTab({
  allConnections = [],
  onConnectCarrier,
  onSyncNow,
  onToggleAutomation,
  onOpenImportModal,
  onOpenAddCarrierModal,
}: ConnectionsTabProps) {
  // Build map of agent's existing connections
  const connectionsMap = new Map<string, any>();
  (allConnections || []).forEach((c) => {
    if (c.carrier) {
      connectionsMap.set(c.carrier.toLowerCase(), c);
    }
  });

  // Separate carriers into REAL CONNECTED vs SETUP REQUIRED / AVAILABLE
  const connectedCarriers: { def: CarrierDefinition; conn: any }[] = [];
  const setupAvailableCarriers: { def: CarrierDefinition; conn?: any }[] = [];

  CARRIER_REGISTRY.forEach((carDef) => {
    const conn = connectionsMap.get(carDef.id.toLowerCase());
    const isTrulyConnected = conn && (conn.connection_status === 'connected' || conn.connection_status === 'imported');

    if (isTrulyConnected) {
      connectedCarriers.push({ def: carDef, conn });
    } else {
      setupAvailableCarriers.push({ def: carDef, conn });
    }
  });

  return (
    <div className="space-y-8 font-sans">
      {/* Header Bar with + Add Carrier Button */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-extrabold text-slate-900">Carrier Connections</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Manage automated broker portal sync connections and CSV fallback importers across all supported carriers.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onOpenAddCarrierModal}
            className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-extrabold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-blue-500/10"
          >
            <span>+ Add Carrier</span>
          </button>

          <button
            onClick={onOpenImportModal}
            className="inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-2xs"
          >
            <span>⬆ Import Carrier CSV</span>
          </button>
        </div>
      </div>

      {/* 1. CONNECTED CARRIERS SECTION (Only Real Validated Sessions) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">
            Connected Carriers ({connectedCarriers.length})
          </h4>
        </div>

        {connectedCarriers.length === 0 ? (
          <div className="p-8 bg-white border border-slate-100 rounded-2xl text-center space-y-1">
            <p className="text-sm font-bold text-slate-700">No active connected carrier sessions yet.</p>
            <p className="text-xs text-slate-400">Click &quot;+ Add Carrier&quot; or &quot;Connect&quot; below to authenticate your broker portal session.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {connectedCarriers.map(({ def, conn }) => {
              const connStatus = conn?.connection_status || 'not_connected';
              const isConnected = connStatus === 'connected';
              const isReauthReq = connStatus === 'reauthentication_required';
              const isAutomationEnabled = conn?.automation_enabled !== false;

              const formattedLastSuccess = conn?.last_success_at
                ? formatDateTimeMMDDYYYY(conn.last_success_at)
                : conn?.last_sync_at
                ? formatDateTimeMMDDYYYY(conn.last_sync_at)
                : 'Never Synced';

              const formattedNextSync = conn?.next_sync_at
                ? formatDateTimeMMDDYYYY(conn.next_sync_at)
                : 'Not Scheduled';

              return (
                <div
                  key={def.id}
                  className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs flex flex-col justify-between space-y-5 hover:shadow-md transition-all"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${def.gradient} text-white font-black text-lg flex items-center justify-center shadow-sm`}
                        >
                          {def.logoLetter}
                        </div>
                        <div>
                          <h5 className="text-base font-extrabold text-slate-900">{def.displayName}</h5>
                          <span className="text-[11px] text-slate-400 font-medium block">
                            {def.shortName} Individual &amp; ACA Book
                          </span>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                          isConnected
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isReauthReq
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {isConnected
                          ? 'Connected'
                          : isReauthReq
                          ? 'Reauthentication Required'
                          : 'Imported (CSV)'}
                      </span>
                    </div>

                    {/* Operational Details Card */}
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold">Automatic Sync:</span>
                        <span className="font-extrabold text-slate-800">
                          {isAutomationEnabled ? 'ON (Every 8 Hours)' : 'OFF'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold">Last Successful Sync:</span>
                        <span className="font-extrabold text-emerald-700">{formattedLastSuccess}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-semibold">Next Scheduled Sync:</span>
                        <span className="font-extrabold text-blue-700">
                          {isAutomationEnabled ? formattedNextSync : 'Disabled'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-50 flex items-center justify-between gap-2">
                    <button
                      onClick={() => onSyncNow(def.id)}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-xs"
                    >
                      Sync Now
                    </button>

                    <button
                      onClick={() => onConnectCarrier(def.id)}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition-all"
                    >
                      {isConnected ? 'Reconnect' : 'Connect'}
                    </button>

                    <button
                      onClick={() => onToggleAutomation(def.id)}
                      className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition-all"
                    >
                      Auto: {isAutomationEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. AVAILABLE / SETUP REQUIRED CARRIERS SECTION */}
      {setupAvailableCarriers.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">
              Available &amp; Setup Required ({setupAvailableCarriers.length})
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {setupAvailableCarriers.map(({ def, conn }) => {
              const connStatus = conn?.connection_status || 'not_connected';
              const isSetupReq = connStatus === 'setup_required';
              const isReauth = connStatus === 'reauthentication_required';

              return (
                <div
                  key={def.id}
                  className="bg-white border border-slate-100 rounded-2xl p-6 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${def.gradient} text-white font-black text-lg flex items-center justify-center shadow-sm`}
                        >
                          {def.logoLetter}
                        </div>
                        <div>
                          <h5 className="text-base font-extrabold text-slate-900">{def.displayName}</h5>
                          <span className="text-[11px] text-slate-400 font-medium block">
                            Supported Carrier
                          </span>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                          isSetupReq
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : isReauth
                            ? 'bg-rose-50 text-rose-800 border-rose-300'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        {isSetupReq ? 'Setup Required' : isReauth ? 'Reauth Required' : 'Not Connected'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed font-medium">
                      {def.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-50">
                    <button
                      onClick={() => onConnectCarrier(def.id)}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-xs"
                    >
                      {isSetupReq ? 'Start Setup (Connect Ambetter)' : '+ Connect Carrier'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
