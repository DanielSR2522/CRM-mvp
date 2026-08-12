'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { formatIsoToUsDate } from '@/utils/dateUtils';

export type PolicyModuleType = 'property_casualty' | 'health' | 'life' | 'supplemental';

export interface PolicyQuickViewProps {
  isOpen: boolean;
  onClose: () => void;
  policyId: string | null;
  clientId: string | null;
  moduleType: PolicyModuleType | null;
  policyTypeLabel?: string | null;
}

export default function PolicyQuickViewDrawer({
  isOpen,
  onClose,
  policyId,
  clientId,
  moduleType,
  policyTypeLabel,
}: PolicyQuickViewProps) {
  const router = useRouter();

  // Loading & Data States
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Client Data
  const [clientData, setClientData] = useState<{
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
  } | null>(null);

  // Module Specific Records
  const [pcPolicy, setPcPolicy] = useState<any | null>(null);
  const [healthPolicy, setHealthPolicy] = useState<any | null>(null);
  const [lifePolicy, setLifePolicy] = useState<any | null>(null);
  const [lifeProducts, setLifeProducts] = useState<any[]>([]);

  // Ref to track loaded key and prevent infinite effect refetch loops
  const loadedKeyRef = useRef<string | null>(null);

  // Load Policy Data based on moduleType and policyId (Executes ONCE per open / policy change)
  useEffect(() => {
    if (!isOpen || !policyId || !moduleType) {
      if (!isOpen) {
        loadedKeyRef.current = null;
      }
      return;
    }

    const currentKey = `${policyId}_${moduleType}_${clientId || ''}`;

    // Skip redundant refetching if already loaded for this policy
    if (loadedKeyRef.current === currentKey) {
      return;
    }

    let isMounted = true;

    const fetchPolicyDetails = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        let fetchedClient: any = null;
        let fetchedPc: any = null;
        let fetchedHealth: any = null;
        let fetchedLife: any = null;
        let fetchedProducts: any[] = [];

        // 1. Fetch Client Basic Info if clientId present
        if (clientId) {
          const { data: cData } = await supabase
            .from('clients')
            .select('id, full_name, email, phone')
            .eq('id', clientId)
            .maybeSingle();
          if (cData) fetchedClient = cData;
        }

        // 2. Fetch Module Details
        if (moduleType === 'property_casualty' || moduleType === 'supplemental') {
          const { data: pData, error: pErr } = await supabase
            .from('policies')
            .select('*')
            .eq('id', policyId)
            .single();

          if (pErr) throw pErr;
          fetchedPc = pData;

          if (!fetchedClient && pData?.client_id) {
            const { data: cData } = await supabase
              .from('clients')
              .select('id, full_name, email, phone')
              .eq('id', pData.client_id)
              .maybeSingle();
            if (cData) fetchedClient = cData;
          }
        } else if (moduleType === 'health') {
          const { data: hData, error: hErr } = await supabase
            .from('health_policies')
            .select('*')
            .eq('id', policyId)
            .single();

          if (hErr) throw hErr;
          fetchedHealth = hData;

          if (!fetchedClient && hData?.client_id) {
            const { data: cData } = await supabase
              .from('clients')
              .select('id, full_name, email, phone')
              .eq('id', hData.client_id)
              .maybeSingle();
            if (cData) fetchedClient = cData;
          }
        } else if (moduleType === 'life') {
          const { data: lData, error: lErr } = await supabase
            .from('life_policies')
            .select('*')
            .eq('id', policyId)
            .single();

          if (lErr) throw lErr;
          fetchedLife = lData;

          if (!fetchedClient && lData?.client_id) {
            const { data: cData } = await supabase
              .from('clients')
              .select('id, full_name, email, phone')
              .eq('id', lData.client_id)
              .maybeSingle();
            if (cData) fetchedClient = cData;
          }

          // Fetch Life Products for this life policy
          const { data: prodData } = await supabase
            .from('life_policy_products')
            .select('*')
            .eq('life_policy_id', policyId);
          fetchedProducts = prodData || [];
        }

        if (isMounted) {
          setClientData(fetchedClient);
          setPcPolicy(fetchedPc);
          setHealthPolicy(fetchedHealth);
          setLifePolicy(fetchedLife);
          setLifeProducts(fetchedProducts);
          loadedKeyRef.current = currentKey;
        }
      } catch (err: any) {
        console.error('Error loading quick view policy detail:', err);
        if (isMounted) {
          setErrorMsg(err?.message || 'Failed to load policy detail record.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchPolicyDetails();

    return () => {
      isMounted = false;
    };
  }, [isOpen, policyId, clientId, moduleType]);

  if (!isOpen) return null;

  // Primary Action: Open Policy Navigation
  const handleOpenPolicy = () => {
    const targetClientId = clientId || clientData?.id || pcPolicy?.client_id || healthPolicy?.client_id || lifePolicy?.client_id;
    if (!targetClientId) return;

    onClose();

    if (moduleType === 'property_casualty') {
      router.push(`/clients/${targetClientId}/policies/${policyId}`);
    } else if (moduleType === 'health') {
      router.push(`/clients/${targetClientId}?tab=health`);
    } else if (moduleType === 'life') {
      router.push(`/clients/${targetClientId}?tab=life`);
    } else if (moduleType === 'supplemental') {
      router.push(`/clients/${targetClientId}?tab=supplemental`);
    } else {
      router.push(`/clients/${targetClientId}`);
    }
  };

  // Helper for Initials
  const getInitials = (name?: string | null) => {
    if (!name) return 'CL';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  // Expiration Days Calculation
  const getExpirationDaysBadge = (expDateIso?: string | null) => {
    if (!expDateIso) return null;
    const nowIso = new Date().toISOString().split('T')[0];
    const days = Math.ceil(
      (new Date(expDateIso + 'T00:00:00').getTime() - new Date(nowIso + 'T00:00:00').getTime()) / (1000 * 3600 * 24)
    );

    if (days < 0) {
      return (
        <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-[#FEF2F2] text-[#C24141] border border-[#FECACA]">
          Expired {Math.abs(days)} {Math.abs(days) === 1 ? 'day' : 'days'} ago
        </span>
      );
    }
    if (days <= 7) {
      return (
        <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-[#FEFCE8] text-[#B7791F] border border-[#FEF08A]">
          Expires in {days} {days === 1 ? 'day' : 'days'}
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-[#EEF4FF] text-[#2563EB] border border-[#BFDBFE]">
        Expires in {days} days
      </span>
    );
  };

  // Format currency
  const formatCurrency = (val?: number | null) => {
    if (val === undefined || val === null) return '—';
    return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Derived Summary Values depending on policy type
  const polNumber =
    pcPolicy?.policy_number ||
    healthPolicy?.no_membership ||
    healthPolicy?.application_number ||
    lifePolicy?.policy_number ||
    'N/A';

  const polStatus =
    pcPolicy?.status ||
    healthPolicy?.policy_status ||
    lifePolicy?.status ||
    'Active';

  const carrierName =
    pcPolicy?.company_name ||
    pcPolicy?.writing_company ||
    healthPolicy?.company_2026 ||
    (lifeProducts.length > 0 ? lifeProducts[0].company : null) ||
    'N/A';

  const effDateFormatted =
    (pcPolicy?.effective_date && formatIsoToUsDate(pcPolicy.effective_date)) ||
    (healthPolicy?.effective_date && formatIsoToUsDate(healthPolicy.effective_date)) ||
    (lifePolicy?.effective_date && formatIsoToUsDate(lifePolicy.effective_date)) ||
    '—';

  const expDateFormatted =
    (pcPolicy?.expiration_date && formatIsoToUsDate(pcPolicy.expiration_date)) ||
    (lifePolicy?.expiration_date && formatIsoToUsDate(lifePolicy.expiration_date)) ||
    '—';

  const rawExpDateIso = pcPolicy?.expiration_date || lifePolicy?.expiration_date || null;

  const premiumAmount =
    pcPolicy?.premium ||
    pcPolicy?.total_premium ||
    pcPolicy?.annual_premium ||
    healthPolicy?.plan_cost ||
    (lifeProducts.length > 0 ? lifeProducts[0].monthly_premium : null) ||
    null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        {/* Slide-over panel (35-40% desktop, full mobile) */}
        <div className="w-screen max-w-xl lg:max-w-2xl bg-white shadow-2xl flex flex-col border-l border-[#DCE2EA] animate-in slide-in-from-right duration-200">
          
          {/* DRAWER HEADER */}
          <div className="px-6 py-5 bg-[#F8FAFC] border-b border-[#DCE2EA] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#EEF4FF] text-[#2563EB] border border-[#BFDBFE]">
                  {moduleType === 'property_casualty' ? 'P&C Policy' : moduleType === 'health' ? 'Health Policy' : moduleType === 'life' ? 'Life Policy' : 'Supplemental'}
                </span>
                <span className="text-xs text-[#556176] font-medium">#{polNumber}</span>
              </div>
              <h2 className="text-lg font-semibold text-[#172033] mt-1 tracking-tight">
                Policy Expiration Details
              </h2>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-md bg-white border border-[#DCE2EA] text-[#556176] hover:text-[#172033] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors"
              aria-label="Close panel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* CLIENT SUMMARY BAR */}
          <div className="px-6 py-4 bg-white border-b border-[#E8ECF2] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-[#2563EB] text-white font-semibold text-sm flex items-center justify-center flex-shrink-0 shadow-sm">
                {getInitials(clientData?.full_name)}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#172033] truncate">
                  {clientData?.full_name || 'Client Record'}
                </h3>
                <p className="text-xs text-[#556176] truncate">
                  {clientData?.phone || clientData?.email || 'Customer Profile'}
                </p>
              </div>
            </div>

            <button
              onClick={handleOpenPolicy}
              className="crm-btn-primary text-xs px-4 py-2 flex items-center gap-1.5 flex-shrink-0 shadow-sm"
            >
              <span>Open Policy</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>

          {/* DRAWER BODY (SCROLLABLE) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {loading ? (
              <div className="py-20 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-[#2563EB] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-[#556176]">Loading detailed policy record...</p>
              </div>
            ) : errorMsg ? (
              <div className="p-4 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-[#C24141] text-xs font-semibold">
                {errorMsg}
              </div>
            ) : (
              <>
                {/* 1. POLICY SUMMARY CARD */}
                <div className="crm-card p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#E8ECF2] pb-3">
                    <h4 className="text-xs font-semibold text-[#172033] uppercase tracking-wider">
                      Policy Overview
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded text-xs font-semibold border ${
                        polStatus === 'Active' ? 'bg-[#F0FDF4] text-[#15803D] border-[#DCFCE7]' :
                        polStatus === 'Pending' ? 'bg-[#FEFCE8] text-[#B7791F] border-[#FEF08A]' :
                        'bg-[#FEF2F2] text-[#C24141] border-[#FECACA]'
                      }`}>
                        {polStatus}
                      </span>
                      {getExpirationDaysBadge(rawExpDateIso)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[#7C8799] text-[11px] block">Policy Type / Line</span>
                      <span className="font-semibold text-[#172033]">
                        {policyTypeLabel || pcPolicy?.policy_type || (moduleType === 'health' ? 'Health Plan' : moduleType === 'life' ? 'Life Insurance' : 'Supplemental')}
                      </span>
                    </div>

                    <div>
                      <span className="text-[#7C8799] text-[11px] block">Policy Number</span>
                      <span className="font-mono font-medium text-[#172033]">#{polNumber}</span>
                    </div>

                    <div>
                      <span className="text-[#7C8799] text-[11px] block">Company / Carrier</span>
                      <span className="font-medium text-[#172033]">{carrierName}</span>
                    </div>

                    <div>
                      <span className="text-[#7C8799] text-[11px] block">Premium</span>
                      <span className="font-semibold text-[#172033]">
                        {formatCurrency(premiumAmount)}
                        {pcPolicy?.policy_payment_frequency && (
                          <span className="text-[10px] text-[#556176] font-normal ml-1">
                            ({pcPolicy.policy_payment_frequency})
                          </span>
                        )}
                      </span>
                    </div>

                    <div>
                      <span className="text-[#7C8799] text-[11px] block">Effective Date (MM/DD/YYYY)</span>
                      <span className="font-medium text-[#172033]">{effDateFormatted}</span>
                    </div>

                    <div>
                      <span className="text-[#7C8799] text-[11px] block">Expiration Date (MM/DD/YYYY)</span>
                      <span className="font-medium text-[#172033]">{expDateFormatted}</span>
                    </div>
                  </div>
                </div>

                {/* 2. MODULE-SPECIFIC DETAILS */}
                
                {/* P&C Specific Record Details */}
                {(moduleType === 'property_casualty' || moduleType === 'supplemental') && pcPolicy && (
                  <div className="crm-card p-5 space-y-4">
                    <h4 className="text-xs font-semibold text-[#172033] uppercase tracking-wider border-b border-[#E8ECF2] pb-3">
                      Property & Casualty Details
                    </h4>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[#7C8799] text-[11px] block">Ownership Type</span>
                        <span className="font-medium text-[#172033] capitalize">{pcPolicy.policy_ownership_type || 'Personal'}</span>
                      </div>

                      <div>
                        <span className="text-[#7C8799] text-[11px] block">Business Type</span>
                        <span className="font-medium text-[#172033]">{pcPolicy.business_type || 'Personal'}</span>
                      </div>

                      {pcPolicy.writing_company && (
                        <div>
                          <span className="text-[#7C8799] text-[11px] block">Writing Company</span>
                          <span className="font-medium text-[#172033]">{pcPolicy.writing_company}</span>
                        </div>
                      )}

                      {pcPolicy.billing_type && (
                        <div>
                          <span className="text-[#7C8799] text-[11px] block">Billing Type</span>
                          <span className="font-medium text-[#172033]">{pcPolicy.billing_type}</span>
                        </div>
                      )}

                      {pcPolicy.address && (
                        <div className="col-span-2">
                          <span className="text-[#7C8799] text-[11px] block">Insured Location / Address</span>
                          <span className="font-medium text-[#172033]">
                            {[pcPolicy.address, pcPolicy.city, pcPolicy.state, pcPolicy.zip_code].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* DRAWER FOOTER */}
          <div className="px-6 py-4 bg-[#F8FAFC] border-t border-[#DCE2EA] flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="crm-btn-secondary text-xs px-4 py-2"
            >
              Close Quick View
            </button>

            <button
              onClick={handleOpenPolicy}
              className="crm-btn-primary text-xs px-5 py-2 flex items-center gap-1.5 shadow-sm"
            >
              <span>Open Policy</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
