'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { isoDateToMMDDYYYY } from '@/lib/formatters/date';
import USDateInput from '@/components/shared/USDateInput';

export type LifeProductType =
  | 'Term'
  | 'IUL'
  | 'Whole Life'
  | 'VUL'
  | 'Term - Disability'
  | 'Costumer Whole Life';

export interface LifePolicyProduct {
  id: string;
  life_policy_id: string;
  product_type: LifeProductType;
  company: string | null;
  policy_number: string | null;
  policy_date: string | null;
  face_amount: number | null;
  monthly_premium: number | null;
  time_to_pay_premium: string | null;
  level_period: string | null;
  conversion_credit: number | null;
  created_at: string;
}

interface LifePolicyProductsProps {
  lifePolicyId: string;
  onProductsChange?: () => void;
}

const PRODUCT_OPTIONS: LifeProductType[] = [
  'Term',
  'IUL',
  'Whole Life',
  'VUL',
  'Term - Disability',
  'Costumer Whole Life',
];

export default function LifePolicyProducts({ lifePolicyId, onProductsChange }: LifePolicyProductsProps) {
  const [products, setProducts] = useState<LifePolicyProduct[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<LifePolicyProduct | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State
  const [productType, setProductType] = useState<LifeProductType>('Term');
  const [company, setCompany] = useState<string>('');
  const [policyNumber, setPolicyNumber] = useState<string>('');
  const [policyDate, setPolicyDate] = useState<string>('');
  const [faceAmount, setFaceAmount] = useState<string>('');
  const [monthlyPremium, setMonthlyPremium] = useState<string>('');
  const [timeToPayPremium, setTimeToPayPremium] = useState<string>('');
  const [levelPeriod, setLevelPeriod] = useState<string>('');
  const [conversionCredit, setConversionCredit] = useState<string>('');

  const formatCurrency = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const parseCurrencyInput = (val: string): number => {
    const cleaned = val.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('life_policy_products')
        .select('*')
        .eq('life_policy_id', lifePolicyId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error('Failed to load life policy products:', err);
    } finally {
      setLoading(false);
    }
  }, [lifePolicyId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const openAddModal = () => {
    setEditingProduct(null);
    setProductType('Term');
    setCompany('');
    setPolicyNumber('');
    setPolicyDate('');
    setFaceAmount('');
    setMonthlyPremium('');
    setTimeToPayPremium('');
    setLevelPeriod('');
    setConversionCredit('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (p: LifePolicyProduct) => {
    setEditingProduct(p);
    setProductType(p.product_type);
    setCompany(p.company || '');
    setPolicyNumber(p.policy_number || '');
    setPolicyDate(p.policy_date || '');
    setFaceAmount(p.face_amount !== null ? p.face_amount.toString() : '');
    setMonthlyPremium(p.monthly_premium !== null ? p.monthly_premium.toString() : '');
    setTimeToPayPremium(p.time_to_pay_premium || '');
    setLevelPeriod(p.level_period || '');
    setConversionCredit(p.conversion_credit !== null ? p.conversion_credit.toString() : '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFormError(null);

    try {
      const payload = {
        life_policy_id: lifePolicyId,
        product_type: productType,
        company: company.trim() || null,
        policy_number: policyNumber.trim() || null,
        policy_date: policyDate || null,
        face_amount: parseCurrencyInput(faceAmount),
        monthly_premium: parseCurrencyInput(monthlyPremium),
        time_to_pay_premium: timeToPayPremium.trim() || null,
        level_period: levelPeriod.trim() || null,
        conversion_credit: parseCurrencyInput(conversionCredit),
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('life_policy_products')
          .update(payload)
          .eq('id', editingProduct.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('life_policy_products')
          .insert(payload);

        if (error) throw error;
      }

      setIsModalOpen(false);
      await loadProducts();
      if (onProductsChange) onProductsChange();
    } catch (err: any) {
      console.error('Failed to save life policy product:', err);
      setFormError(err.message || 'Failed to save product');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      const { error } = await supabase
        .from('life_policy_products')
        .delete()
        .eq('id', productId);

      if (error) throw error;
      await loadProducts();
      if (onProductsChange) onProductsChange();
    } catch (err: any) {
      console.error('Failed to delete product:', err);
      alert('Failed to delete product: ' + err.message);
    }
  };

  return (
    <div className="space-y-3 font-sans">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-sans">Policy Products</h4>
          <p className="text-[11px] text-slate-400 font-normal">Life insurance products attached to this policy</p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg shadow-xs transition-all flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          + Add Product
        </button>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-slate-400">Loading products...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-8 bg-slate-50/50 border border-dashed border-slate-200 rounded-lg">
          <p className="text-xs text-slate-400 font-normal mb-2">No products added to this policy yet.</p>
          <button
            type="button"
            onClick={openAddModal}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline"
          >
            + Add First Product
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200/80">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-2.5">Product</th>
                <th className="p-2.5">Company</th>
                <th className="p-2.5">Policy #</th>
                <th className="p-2.5">Policy Date</th>
                <th className="p-2.5">Face Amount</th>
                <th className="p-2.5">Monthly Premium</th>
                <th className="p-2.5">Level Period</th>
                <th className="p-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-2.5 font-bold text-slate-900">{p.product_type}</td>
                  <td className="p-2.5">{p.company || '-'}</td>
                  <td className="p-2.5 font-mono">{p.policy_number || '-'}</td>
                  <td className="p-2.5 font-semibold text-slate-800">{isoDateToMMDDYYYY(p.policy_date) || '-'}</td>
                  <td className="p-2.5 font-bold text-slate-900">{formatCurrency(p.face_amount)}</td>
                  <td className="p-2.5 text-emerald-600 font-bold">{formatCurrency(p.monthly_premium)}</td>
                  <td className="p-2.5">{p.level_period || '-'}</td>
                  <td className="p-2.5 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(p)}
                      className="text-indigo-600 hover:text-indigo-800 font-bold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(p.id)}
                      className="text-rose-600 hover:text-rose-800 font-bold"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                {editingProduct ? 'Edit Product' : 'Add Policy Product'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-lg text-rose-600 text-xs font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-3.5 text-xs font-sans">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Product Type *</label>
                  <select
                    value={productType}
                    onChange={(e) => setProductType(e.target.value as LifeProductType)}
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs font-semibold"
                  >
                    {PRODUCT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Company / Carrier</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Carrier Name"
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Product Policy #</label>
                  <input
                    type="text"
                    value={policyNumber}
                    onChange={(e) => setPolicyNumber(e.target.value)}
                    placeholder="POL-123456"
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Policy Date</label>
                  <USDateInput
                    value={policyDate}
                    onChange={(isoVal) => setPolicyDate(isoVal)}
                  />
                </div>

                <div>
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Face Amount ($)</label>
                  <input
                    type="text"
                    value={faceAmount}
                    onChange={(e) => setFaceAmount(e.target.value)}
                    placeholder="250,000"
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Monthly Premium ($)</label>
                  <input
                    type="text"
                    value={monthlyPremium}
                    onChange={(e) => setMonthlyPremium(e.target.value)}
                    placeholder="150.00"
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Time to Pay Premium</label>
                  <input
                    type="text"
                    value={timeToPayPremium}
                    onChange={(e) => setTimeToPayPremium(e.target.value)}
                    placeholder="e.g. 20 Years, Pay to 65"
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Level Period</label>
                  <input
                    type="text"
                    value={levelPeriod}
                    onChange={(e) => setLevelPeriod(e.target.value)}
                    placeholder="e.g. 10 Years, 20 Years"
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block font-bold text-[10px] uppercase tracking-wider text-slate-500 mb-1">Conversion Credit ($)</label>
                  <input
                    type="text"
                    value={conversionCredit}
                    onChange={(e) => setConversionCredit(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-3.5 py-1.5 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : editingProduct ? 'Save Product' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
