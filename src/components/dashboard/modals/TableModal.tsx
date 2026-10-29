'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import type { RestaurantTableData } from '@/types/dashboard';
import { TableStatus } from '@/types';

interface TableModalProps {
  isOpen: boolean;
  editingTable: RestaurantTableData | null;
  defaultTableNumber: string;
  loading: boolean;
  onClose: () => void;
  onSave: (data: {
    tableNumber: string;
    capacity: number;
    status: TableStatus;
    generateQr: boolean;
  }) => Promise<void>;
}

export function TableModal({
  isOpen,
  editingTable,
  defaultTableNumber,
  loading,
  onClose,
  onSave,
}: TableModalProps) {
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [status, setStatus] = useState<TableStatus>(TableStatus.AVAILABLE);
  const [generateQr, setGenerateQr] = useState(true);

  useEffect(() => {
    if (editingTable) {
      setTableNumber(editingTable.tableNumber);
      setCapacity(editingTable.capacity);
      setStatus(editingTable.status);
      setGenerateQr(false);
    } else {
      setTableNumber(defaultTableNumber);
      setCapacity(4);
      setStatus(TableStatus.AVAILABLE);
      setGenerateQr(true);
    }
  }, [editingTable, defaultTableNumber, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tableNumber.trim()) return;
    await onSave({
      tableNumber: tableNumber.trim(),
      capacity,
      status,
      generateQr,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm print:hidden">
      <div className="glass-panel rounded-2xl border border-slate-800 p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-base font-semibold text-white mb-4">
          {editingTable ? `Edit Table ${editingTable.tableNumber}` : 'Create Dining Table'}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="modalTblNumber">
              Table Number / Label *
            </label>
            <input
              id="modalTblNumber"
              type="text"
              required
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value.trim())}
              placeholder="e.g. T-1, Patio-4, Booth-B"
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="modalTblCapacity">
                Seating Capacity
              </label>
              <input
                id="modalTblCapacity"
                type="number"
                min="1"
                max="50"
                required
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1" htmlFor="modalTblStatus">
                Table Status
              </label>
              <select
                id="modalTblStatus"
                value={status}
                onChange={(e) => setStatus(e.target.value as TableStatus)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              >
                <option value={TableStatus.AVAILABLE}>AVAILABLE</option>
                <option value={TableStatus.OCCUPIED}>OCCUPIED</option>
                <option value={TableStatus.RESERVED}>RESERVED</option>
                <option value={TableStatus.INACTIVE}>INACTIVE</option>
              </select>
            </div>
          </div>

          {!editingTable && (
            <div className="flex items-center gap-2.5 pt-2">
              <input
                id="modalTblGenQr"
                type="checkbox"
                checked={generateQr}
                onChange={(e) => setGenerateQr(e.target.checked)}
                className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 bg-slate-900 border-slate-800"
              />
              <label htmlFor="modalTblGenQr" className="text-xs text-slate-300 select-none">
                Automatically generate cryptographically secure QR code
              </label>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !tableNumber.trim()}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 disabled:opacity-60"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{editingTable ? 'Update Table' : 'Create Table'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
