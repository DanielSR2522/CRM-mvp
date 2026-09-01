'use client';

import React, { useState } from 'react';
import { CARRIER_REGISTRY, CarrierDefinition } from '@/lib/carrier-portals/carrier-registry';

interface AddCarrierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  allConnections: any[];
}

export default function AddCarrierModal({
  isOpen,
  onClose,
  onSuccess,
  allConnections,
}: AddCarrierModalProps) {
  const [loadingCarrier, setLoadingCarrier] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Map existing connections by carrier ID
  const existingConnectionsMap = new Map<string, any>();
  (allConnections || []).forEach((conn) => {
    if (conn.carrier) {
      existingConnectionsMap.set(conn.carrier.toLowerCase(), conn);
    }
  });

  const handleCreateConnection = async (carrierDef: CarrierDefinition) => {
    setLoadingCarrier(carrierDef.id);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch('/api/carrier-portals/connections/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier: carrierDef.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to connect ${carrierDef.displayName}.`);
      }

      if (data.alreadyExists) {
        setMessage(`ℹ ${carrierDef.displayName} connection already exists.`);
      } else {
        setMessage(`✓ ${carrierDef.displayName} connection created successfully!`);
      }

      onSuccess();
    } catch (err: any) {
      console.error(`Error connecting carrier ${carrierDef.id}:`, err);
      setError(err?.message || `Failed to create ${carrierDef.displayName} connection.`);
    } finally {
      setLoadingCarrier(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto font-sans">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">Connect Carrier</h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Select a supported health insurance carrier to enable portal sync &amp; book intelligence
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Feedback Banners */}
        <div className="px-6 pt-4 space-y-2">
          {message && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-semibold">
              {message}
            </div>
          )}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-xs font-semibold">
              {error}
            </div>
          )}
        </div>

        {/* Body — List of Available Carriers */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
          {CARRIER_REGISTRY.map((car) => {
            const existingConn = existingConnectionsMap.get(car.id.toLowerCase());
            const isConnected = existingConn && existingConn.connection_status === 'connected';
            const isImported = existingConn && existingConn.connection_status === 'imported';
            const isReauth = existingConn && existingConn.connection_status === 'reauthentication_required';
            const isExisting = Boolean(existingConn);
            const isLoading = loadingCarrier === car.id;

            return (
              <div
                key={car.id}
                className="p-4 rounded-xl border border-slate-100 hover:border-slate-200 bg-white hover:bg-slate-50/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${car.gradient} text-white font-black text-lg flex items-center justify-center shrink-0 shadow-sm`}
                  >
                    {car.logoLetter}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-extrabold text-slate-900">{car.displayName}</h4>
                      {isExisting && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                            isConnected
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isReauth
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          {isConnected
                            ? 'Connected'
                            : isReauth
                            ? 'Reauth Required'
                            : isImported
                            ? 'CSV Connected'
                            : 'Setup Created'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5 max-w-md">
                      {car.description}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {isExisting ? (
                    <button
                      onClick={() => {
                        onClose();
                      }}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition-all"
                    >
                      Already Connected
                    </button>
                  ) : (
                    <button
                      onClick={() => handleCreateConnection(car)}
                      disabled={isLoading}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-extrabold rounded-xl text-xs transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isLoading ? (
                        <>
                          <span className="animate-spin">⌛</span>
                          <span>Connecting...</span>
                        </>
                      ) : (
                        <span>+ Connect Carrier</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <span>Multi-carrier adapter architecture enforces agent data isolation.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
