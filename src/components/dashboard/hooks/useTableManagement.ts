import { useState } from 'react';
import QRCode from 'qrcode';
import type { RestaurantTableData, RestaurantSummary } from '@/types/dashboard';
import { TableStatus } from '@/types';

interface UseTableManagementProps {
  activeRestaurant: RestaurantSummary | null;
  notify: (type: 'success' | 'error', message: string) => void;
  refreshActiveData: () => Promise<void>;
  editingTable: RestaurantTableData | null;
  setEditingTable: (table: RestaurantTableData | null) => void;
  setShowTableModal: (show: boolean) => void;
}

export function useTableManagement({
  activeRestaurant,
  notify,
  refreshActiveData,
  editingTable,
  setEditingTable,
  setShowTableModal,
}: UseTableManagementProps) {
  const [actionLoading, setActionLoading] = useState(false);

  // QR Modal State
  const [showQrModal, setShowQrModal] = useState(false);
  const [activeTableForQr, setActiveTableForQr] =
    useState<RestaurantTableData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrMenuUrl, setQrMenuUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

  // Clear Table Modal State
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearingTable, setClearingTable] = useState<RestaurantTableData | null>(null);

  function handleOpenClearModal(table: RestaurantTableData) {
    setClearingTable(table);
    setShowClearModal(true);
  }

  function handleCloseClearModal() {
    setShowClearModal(false);
    setClearingTable(null);
  }

  async function openQrModalWithToken(
    table: RestaurantTableData,
    rawToken: string,
    publicUrl: string,
  ) {
    setActiveTableForQr(table);
    const fullUrl = `${window.location.origin}${publicUrl}`;
    setQrMenuUrl(fullUrl);
    try {
      const dataUrl = await QRCode.toDataURL(fullUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#090d16', light: '#ffffff' },
      });
      setQrDataUrl(dataUrl);
      setShowQrModal(true);
    } catch {
      notify('error', 'Failed to render QR code image.');
    }
  }

  async function handleSaveTable(data: {
    tableNumber: string;
    capacity: number;
    status: TableStatus;
    generateQr: boolean;
  }) {
    if (!activeRestaurant) return;
    setActionLoading(true);
    try {
      const url = editingTable
        ? `/api/v1/restaurants/${activeRestaurant.id}/tables/${editingTable.id}`
        : `/api/v1/restaurants/${activeRestaurant.id}/tables`;
      const res = await fetch(url, {
        method: editingTable ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error?.message || 'Failed to save table');
      }

      notify('success', editingTable ? 'Table updated' : 'Table created successfully');
      setShowTableModal(false);
      setEditingTable(null);

      if (!editingTable && resData.data.rawToken) {
        void openQrModalWithToken(
          resData.data.table,
          resData.data.rawToken,
          resData.data.publicMenuUrl,
        );
      }
      void refreshActiveData();
    } catch (err) {
      notify('error', (err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeactivateTable(table: RestaurantTableData) {
    if (!activeRestaurant) return;
    if (
      !confirm(
        `Are you sure you want to deactivate Table ${table.tableNumber}? This will revoke its QR code immediately.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/v1/restaurants/${activeRestaurant.id}/tables/${table.id}`,
        { method: 'DELETE' },
      );
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error?.message || 'Failed to deactivate table');
      }

      notify('success', `Table ${table.tableNumber} deactivated and QR code revoked.`);
      void refreshActiveData();
    } catch (err) {
      notify('error', (err as Error).message);
    }
  }

  async function handleGenerateOrViewQr(table: RestaurantTableData) {
    if (!activeRestaurant) return;
    setQrLoading(true);
    try {
      const res = await fetch(
        `/api/v1/restaurants/${activeRestaurant.id}/tables/${table.id}/qr`,
        { method: 'POST' },
      );
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error?.message || 'Failed to generate QR code');
      }

      await openQrModalWithToken(
        table,
        resData.data.rawToken,
        resData.data.publicMenuUrl,
      );
      void refreshActiveData();
    } catch (err) {
      notify('error', (err as Error).message);
    } finally {
      setQrLoading(false);
    }
  }

  async function handleRotateQr() {
    if (!activeRestaurant || !activeTableForQr) return;
    if (
      !confirm(
        `Are you sure you want to rotate the QR code for Table ${activeTableForQr.tableNumber}? All printed physical QR cards for this table will stop working immediately.`,
      )
    ) {
      return;
    }
    setQrLoading(true);
    try {
      const res = await fetch(
        `/api/v1/restaurants/${activeRestaurant.id}/tables/${activeTableForQr.id}/qr/rotate`,
        { method: 'POST' },
      );
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error?.message || 'Failed to rotate QR code');
      }

      notify(
        'success',
        `QR code rotated! New code active for Table ${activeTableForQr.tableNumber}`,
      );
      await openQrModalWithToken(
        activeTableForQr,
        resData.data.rawToken,
        resData.data.publicMenuUrl,
      );
      void refreshActiveData();
    } catch (err) {
      notify('error', (err as Error).message);
    } finally {
      setQrLoading(false);
    }
  }

  async function handleRevokeQr() {
    if (!activeRestaurant || !activeTableForQr) return;
    if (
      !confirm(
        `Revoke QR code for Table ${activeTableForQr.tableNumber}? Customers scanning this QR will no longer be able to open the menu until a new one is generated.`,
      )
    ) {
      return;
    }
    setQrLoading(true);
    try {
      const res = await fetch(
        `/api/v1/restaurants/${activeRestaurant.id}/tables/${activeTableForQr.id}/qr`,
        { method: 'DELETE' },
      );
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error?.message || 'Failed to revoke QR code');
      }

      notify('success', `QR code revoked for Table ${activeTableForQr.tableNumber}`);
      setShowQrModal(false);
      void refreshActiveData();
    } catch (err) {
      notify('error', (err as Error).message);
    } finally {
      setQrLoading(false);
    }
  }

  return {
    actionLoading,
    showQrModal,
    setShowQrModal,
    activeTableForQr,
    qrDataUrl,
    qrMenuUrl,
    qrLoading,
    openQrModalWithToken,
    handleSaveTable,
    handleDeactivateTable,
    handleGenerateOrViewQr,
    handleRotateQr,
    handleRevokeQr,
    showClearModal,
    setShowClearModal,
    clearingTable,
    handleOpenClearModal,
    handleCloseClearModal,
  };
}
