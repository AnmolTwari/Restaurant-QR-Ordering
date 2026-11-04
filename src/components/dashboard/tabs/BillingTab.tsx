'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Building2,
  Percent,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Save,
  HelpCircle,
  IndianRupee,
  Layers,
} from 'lucide-react';
import { formatMoney } from '@/lib/formatters';

interface BillingTabProps {
  restaurantId: string;
  currency?: string;
  userRole?: string;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

interface BillingMetrics {
  totalBilled: number;
  totalCashCollected: number;
  outstandingUnpaid: number;
  totalDiscounts: number;
  totalGstCollected: number;
  additionalCharges: {
    serviceCharge: number;
    packagingCharge: number;
    customCharge: number;
    total: number;
  };
  counts: {
    totalOrders: number;
    paidOrders: number;
    unpaidOrders: number;
    refundedOrders: number;
  };
}

export function BillingTab({
  restaurantId,
  currency = 'INR',
  userRole,
  onNotify,
}: BillingTabProps) {
  const isOwner = userRole === 'OWNER';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [metrics, setMetrics] = useState<BillingMetrics | null>(null);

  // Form State
  const [legalName, setLegalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [state, setState] = useState('Maharashtra');
  const [stateCode, setStateCode] = useState('27');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('INV-');
  const [invoiceNextNumber, setInvoiceNextNumber] = useState(1001);

  // GST State
  const [gstEnabled, setGstEnabled] = useState(false);
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [gstRatePercent, setGstRatePercent] = useState('5.0');

  // Additional Charges
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(false);
  const [serviceChargeRatePercent, setServiceChargeRatePercent] = useState('5.0');
  const [serviceChargeType, setServiceChargeType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');

  const [packagingChargeEnabled, setPackagingChargeEnabled] = useState(false);
  const [packagingChargeMajor, setPackagingChargeMajor] = useState('15.00');

  const [customChargeEnabled, setCustomChargeEnabled] = useState(false);
  const [customChargeName, setCustomChargeName] = useState('');
  const [customChargeMajor, setCustomChargeMajor] = useState('10.00');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [configRes, summaryRes] = await Promise.all([
        fetch(`/api/v1/restaurants/${restaurantId}/billing`),
        fetch(`/api/v1/restaurants/${restaurantId}/billing/summary`),
      ]);

      const configData = await configRes.json();
      const summaryData = await summaryRes.json();

      if (configData.success && configData.data?.config) {
        const c = configData.data.config;
        setLegalName(c.legalName || '');
        setDisplayName(c.displayName || '');
        setGstin(c.gstin || '');
        setAddress(c.address || '');
        setState(c.state || 'Maharashtra');
        setStateCode(c.stateCode || '27');
        setPhone(c.phone || '');
        setEmail(c.email || '');
        setInvoicePrefix(c.invoicePrefix || 'INV-');
        setInvoiceNextNumber(c.invoiceNextNumber || 1001);
        setGstEnabled(Boolean(c.gstEnabled));
        setTaxInclusive(Boolean(c.taxInclusive));
        setGstRatePercent(((c.gstRate || 500) / 100).toFixed(1));
        setServiceChargeEnabled(Boolean(c.serviceChargeEnabled));
        setServiceChargeRatePercent(((c.serviceChargeRate || 0) / 100).toFixed(1));
        setServiceChargeType(c.serviceChargeType || 'PERCENTAGE');
        setPackagingChargeEnabled(Boolean(c.packagingChargeEnabled));
        setPackagingChargeMajor(((c.packagingChargeAmount || 0) / 100).toFixed(2));
        setCustomChargeEnabled(Boolean(c.customChargeEnabled));
        setCustomChargeName(c.customChargeName || '');
        setCustomChargeMajor(((c.customChargeAmount || 0) / 100).toFixed(2));
      }

      if (summaryData.success && summaryData.data?.metrics) {
        setMetrics(summaryData.data.metrics);
      }
    } catch {
      onNotify('error', 'Failed to load billing configuration.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId, onNotify]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!isOwner) {
      onNotify('error', 'Only restaurant owners are permitted to update billing settings.');
      return;
    }

    setSaving(true);
    try {
      const gstRateBasisPoints = Math.round(parseFloat(gstRatePercent || '0') * 100);
      const serviceChargeBasisPoints = Math.round(parseFloat(serviceChargeRatePercent || '0') * 100);
      const packagingChargePaise = Math.round(parseFloat(packagingChargeMajor || '0') * 100);
      const customChargePaise = Math.round(parseFloat(customChargeMajor || '0') * 100);

      const payload = {
        legalName: legalName.trim() || null,
        displayName: displayName.trim() || null,
        gstin: gstin.trim().toUpperCase() || null,
        address: address.trim() || null,
        state: state.trim() || 'Maharashtra',
        stateCode: stateCode.trim() || '27',
        phone: phone.trim() || null,
        email: email.trim() || null,
        invoicePrefix: invoicePrefix.trim() || 'INV-',
        invoiceNextNumber: Number(invoiceNextNumber) || 1001,
        gstEnabled,
        taxInclusive,
        gstRate: gstRateBasisPoints,
        serviceChargeEnabled,
        serviceChargeRate: serviceChargeBasisPoints,
        serviceChargeType,
        packagingChargeEnabled,
        packagingChargeAmount: packagingChargePaise,
        packagingChargeType: 'FIXED',
        customChargeName: customChargeName.trim() || null,
        customChargeEnabled,
        customChargeAmount: customChargePaise,
        customChargeType: 'FIXED',
      };

      const res = await fetch(`/api/v1/restaurants/${restaurantId}/billing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to update billing settings.');
      }

      onNotify('success', 'Billing and tax configuration saved successfully.');
      await loadData();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2 text-orange-500" />
        <span>Loading billing and tax configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in text-slate-100">
      {/* Role permission alert banner */}
      {!isOwner && (
        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <span className="font-bold">Manager Read-Only Mode: </span>
            <span>
              You are signed in as a Manager. Only restaurant owners are authorized to change legal
              business details, GST registration, or tax settings.
            </span>
          </div>
        </div>
      )}

      {/* Section 1: Financial & Billing Overview */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-orange-500" />
            <span>Billing & Collection Summary</span>
          </h2>
          <p className="text-xs text-slate-400">
            Authoritative financial metrics across all restaurant orders.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Billed
            </span>
            <div className="text-xl font-bold font-mono text-white">
              {formatMoney(metrics?.totalBilled || 0, currency)}
            </div>
            <span className="text-[10px] text-slate-500">
              {metrics?.counts.totalOrders || 0} total orders
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/20 bg-emerald-500/5 space-y-1">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              Cash Collected
            </span>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {formatMoney(metrics?.totalCashCollected || 0, currency)}
            </div>
            <span className="text-[10px] text-emerald-400/80">
              {metrics?.counts.paidOrders || 0} paid orders settled
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-amber-500/20 bg-amber-500/5 space-y-1">
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
              Outstanding Unpaid
            </span>
            <div className="text-xl font-bold font-mono text-amber-400">
              {formatMoney(metrics?.outstandingUnpaid || 0, currency)}
            </div>
            <span className="text-[10px] text-amber-400/80">
              {metrics?.counts.unpaidOrders || 0} unpaid orders pending
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total GST Recorded
            </span>
            <div className="text-xl font-bold font-mono text-white">
              {formatMoney(metrics?.totalGstCollected || 0, currency)}
            </div>
            <span className="text-[10px] text-slate-500">
              From settled invoices
            </span>
          </div>
        </div>
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSaveSettings} className="space-y-8">
        {/* Section 2: Business & GST Details */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-6">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-orange-500" />
              <span>Business Identity & Tax Registration</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Configured details appear on customer invoices and receipts.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300">Legal Business Name</label>
              <input
                type="text"
                disabled={!isOwner}
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="e.g. Spice Hospitality Private Limited"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white disabled:opacity-60 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300">Invoice Display Name</label>
              <input
                type="text"
                disabled={!isOwner}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. The Spice Bistro"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white disabled:opacity-60 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-300">GSTIN (Optional)</label>
                <span className="text-[10px] text-slate-500">15-character Indian GST format</span>
              </div>
              <input
                type="text"
                disabled={!isOwner}
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="e.g. 27AAPFU0939F1ZV"
                maxLength={15}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-white uppercase disabled:opacity-60 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300">Registered Business Phone</label>
              <input
                type="text"
                disabled={!isOwner}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white disabled:opacity-60 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-semibold text-slate-300">Registered Business Address</label>
              <input
                type="text"
                disabled={!isOwner}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Shop 4, Grand Mall, MG Road, Pune, Maharashtra"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white disabled:opacity-60 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300">State of Supply</label>
              <input
                type="text"
                disabled={!isOwner}
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="e.g. Maharashtra"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white disabled:opacity-60 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300">State Code</label>
              <input
                type="text"
                disabled={!isOwner}
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                placeholder="e.g. 27"
                maxLength={2}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-white disabled:opacity-60 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300">Invoice Number Prefix</label>
              <input
                type="text"
                disabled={!isOwner}
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                placeholder="e.g. INV-"
                maxLength={10}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-white disabled:opacity-60 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300">Next Invoice Counter</label>
              <input
                type="number"
                disabled={!isOwner}
                value={invoiceNextNumber}
                onChange={(e) => setInvoiceNextNumber(parseInt(e.target.value, 10) || 1)}
                min={1}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-white disabled:opacity-60 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        </div>

        {/* Section 3: GST Tax Configuration */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-6">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Percent className="w-4 h-4 text-orange-500" />
                <span>GST Tax Rules</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure rates and tax treatment. Consult your accountant for your applicable tax classification.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                disabled={!isOwner}
                checked={gstEnabled}
                onChange={(e) => setGstEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
              <span className="ml-2 text-xs font-semibold text-slate-300">
                {gstEnabled ? 'GST Enabled' : 'GST Disabled'}
              </span>
            </label>
          </div>

          {gstEnabled && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300">Applicable GST Rate (%)</label>
                  <select
                    disabled={!isOwner}
                    value={gstRatePercent}
                    onChange={(e) => setGstRatePercent(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white disabled:opacity-60 focus:outline-none focus:border-orange-500"
                  >
                    <option value="5.0">5.0% (Standard AC Restaurant)</option>
                    <option value="12.0">12.0%</option>
                    <option value="18.0">18.0% (Hotel Restaurant)</option>
                    <option value="28.0">28.0%</option>
                    <option value="0.0">0.0% (Exempt)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300">Menu Price Tax Treatment</label>
                  <select
                    disabled={!isOwner}
                    value={taxInclusive ? 'INCLUSIVE' : 'EXCLUSIVE'}
                    onChange={(e) => setTaxInclusive(e.target.value === 'INCLUSIVE')}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white disabled:opacity-60 focus:outline-none focus:border-orange-500"
                  >
                    <option value="EXCLUSIVE">Tax-Exclusive (GST added on top of menu prices)</option>
                    <option value="INCLUSIVE">Tax-Inclusive (Menu prices already include GST)</option>
                  </select>
                </div>
              </div>

              {/* Tax Accounting Breakdown Hint */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <span className="font-bold text-slate-300 block">Intra-State Supply Breakdown:</span>
                <p>
                  • CGST: {(parseFloat(gstRatePercent || '0') / 2).toFixed(2)}% | SGST:{' '}
                  {(parseFloat(gstRatePercent || '0') / 2).toFixed(2)}%
                </p>
                <p className="text-slate-500">
                  {taxInclusive
                    ? 'In-tax mode: tax components are extracted from the taxable items subtotal without charging customer extra.'
                    : 'Exclusive mode: tax is computed on taxable item and service charges and added to the bill.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Additional Charges */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-6">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-orange-500" />
              <span>Additional Charges</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Service charges and packaging charges are displayed transparently in customer carts before ordering.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            {/* Service Charge */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">Service Charge</span>
                  <span className="text-[11px] text-slate-400">
                    Discretionary staff service charge levied on dining orders.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isOwner}
                    checked={serviceChargeEnabled}
                    onChange={(e) => setServiceChargeEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                </label>
              </div>

              {serviceChargeEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-slate-300">Rate (%)</label>
                    <input
                      type="number"
                      disabled={!isOwner}
                      value={serviceChargeRatePercent}
                      onChange={(e) => setServiceChargeRatePercent(e.target.value)}
                      step="0.5"
                      min="0"
                      max="20"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-300">Charge Type</label>
                    <select
                      disabled={!isOwner}
                      value={serviceChargeType}
                      onChange={(e) =>
                        setServiceChargeType(e.target.value as 'PERCENTAGE' | 'FIXED')
                      }
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white"
                    >
                      <option value="PERCENTAGE">Percentage of Items Subtotal</option>
                      <option value="FIXED">Fixed Amount per Order</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Packaging Charge */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">Packaging Charge</span>
                  <span className="text-[11px] text-slate-400">
                    Takeaway and container packaging cost.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isOwner}
                    checked={packagingChargeEnabled}
                    onChange={(e) => setPackagingChargeEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                </label>
              </div>

              {packagingChargeEnabled && (
                <div className="pt-2 max-w-xs space-y-1">
                  <label className="text-slate-300">Fixed Packaging Amount (₹)</label>
                  <input
                    type="number"
                    disabled={!isOwner}
                    value={packagingChargeMajor}
                    onChange={(e) => setPackagingChargeMajor(e.target.value)}
                    step="1"
                    min="0"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        {isOwner && (
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-orange-600/20 active:scale-95 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Billing Settings</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
