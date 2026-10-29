'use client';

import React from 'react';
import { QrCode, Plus, Users, Edit2, Trash2 } from 'lucide-react';
import type { RestaurantTableData } from '@/types/dashboard';

interface TablesTabProps {
  tables: RestaurantTableData[];
  qrLoading: boolean;
  onOpenCreateTable: () => void;
  onGenerateOrViewQr: (table: RestaurantTableData) => void;
  onEditTable: (table: RestaurantTableData) => void;
  onDeactivateTable: (table: RestaurantTableData) => void;
}

export function TablesTab({
  tables,
  qrLoading,
  onOpenCreateTable,
  onGenerateOrViewQr,
  onEditTable,
  onDeactivateTable,
}: TablesTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Restaurant Tables & QR Codes</h2>
          <p className="text-xs text-slate-400">
            Manage physical dining tables, generate cryptographically signed QR codes, and print table stands
          </p>
        </div>

        <button
          onClick={onOpenCreateTable}
          className="px-3.5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-xl flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Table</span>
        </button>
      </div>

      {tables.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center border border-slate-800">
          <QrCode className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-base font-medium text-white mb-1">No tables created yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
            Add tables to generate unique, secure QR codes that customers scan to view the menu and order.
          </p>
          <button
            onClick={onOpenCreateTable}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-xl"
          >
            Create First Table
          </button>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4 font-medium">Table</th>
                <th className="py-3.5 px-4 font-medium">Capacity</th>
                <th className="py-3.5 px-4 font-medium">Status</th>
                <th className="py-3.5 px-4 font-medium">QR Status</th>
                <th className="py-3.5 px-4 font-medium">Active Sessions</th>
                <th className="py-3.5 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-300">
              {tables.map((tbl) => (
                <tr key={tbl.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                    <span>Table {tbl.tableNumber}</span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-300">
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      <span>{tbl.capacity} Seats</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        tbl.status === 'AVAILABLE'
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                          : tbl.status === 'OCCUPIED'
                          ? 'bg-orange-950/60 text-orange-400 border border-orange-800/60'
                          : tbl.status === 'RESERVED'
                          ? 'bg-indigo-950/60 text-indigo-400 border border-indigo-800/60'
                          : 'bg-slate-800 text-slate-500 border border-slate-700'
                      }`}
                    >
                      {tbl.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded ${
                        tbl.hasActiveQr
                          ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40'
                          : 'bg-slate-900 text-slate-500 border border-slate-800'
                      }`}
                    >
                      <QrCode className="w-3 h-3" />
                      <span>{tbl.hasActiveQr ? 'Active' : 'No QR'}</span>
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-400">
                    {tbl.activeSessionsCount} active
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Generate or View QR */}
                      <button
                        onClick={() => onGenerateOrViewQr(tbl)}
                        disabled={qrLoading}
                        className="px-2.5 py-1.5 rounded-lg bg-orange-600/10 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/20 text-xs font-medium flex items-center gap-1 transition-all"
                        title="Display QR code and menu link"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>{tbl.hasActiveQr ? 'View QR' : 'Generate'}</span>
                      </button>

                      {/* Edit Table */}
                      <button
                        onClick={() => onEditTable(tbl)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        title="Edit Table"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Deactivate Table */}
                      <button
                        onClick={() => onDeactivateTable(tbl)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 hover:border-red-900/60 transition-colors"
                        title="Deactivate Table"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
