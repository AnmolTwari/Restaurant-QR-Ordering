'use client';

import React, { useState, useCallback } from 'react';

import type {
  Category,
  MenuItem,
  RestaurantTableData,
  DashboardTab,
  RestaurantSummary,
  NotificationState,
} from '@/types/dashboard';

import { DashboardNotification } from '@/components/dashboard/DashboardNotification';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardTabsNav } from '@/components/dashboard/DashboardTabsNav';

import { OverviewTab } from '@/components/dashboard/tabs/OverviewTab';
import { CategoriesTab } from '@/components/dashboard/tabs/CategoriesTab';
import { MenuItemsTab } from '@/components/dashboard/tabs/MenuItemsTab';
import { TablesTab } from '@/components/dashboard/tabs/TablesTab';
import { OrdersTab } from '@/components/dashboard/tabs/OrdersTab';
import { PaymentsTab } from '@/components/dashboard/tabs/PaymentsTab';

import { CategoryModal } from '@/components/dashboard/modals/CategoryModal';
import { MenuItemModal } from '@/components/dashboard/modals/MenuItemModal';
import { TableModal } from '@/components/dashboard/modals/TableModal';
import { QrCodeModal } from '@/components/dashboard/modals/QrCodeModal';
import { ClearTableModal } from '@/components/dashboard/modals/ClearTableModal';

import { useMenuManagement } from '@/components/dashboard/hooks/useMenuManagement';
import { useTableManagement } from '@/components/dashboard/hooks/useTableManagement';

interface DashboardClientProps {
  initialData: {
    currentUser: { id: string; fullName: string; email: string };
    restaurants: RestaurantSummary[];
    activeRestaurant: RestaurantSummary;
    categories: Category[];
    menuItems: MenuItem[];
    tables: RestaurantTableData[];
  };
}

export function DashboardClient({ initialData }: DashboardClientProps) {
  const [currentUser] = useState(initialData.currentUser);
  const [restaurants] = useState<RestaurantSummary[]>(initialData.restaurants);
  const [activeRestaurant, setActiveRestaurant] = useState<RestaurantSummary>(
    initialData.activeRestaurant,
  );

  const [categories, setCategories] = useState<Category[]>(initialData.categories);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(initialData.menuItems);
  const [tables, setTables] = useState<RestaurantTableData[]>(initialData.tables);

  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [notification, setNotification] = useState<NotificationState | null>(null);

  // Modal Targets
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  const [showTableModal, setShowTableModal] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTableData | null>(null);

  const notify = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  async function handleLogout() {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch {
      window.location.href = '/login';
    }
  }

  const refreshActiveData = useCallback(async () => {
    if (!activeRestaurant) return;
    try {
      const [catRes, itemRes, tableRes] = await Promise.all([
        fetch(`/api/v1/restaurants/${activeRestaurant.id}/categories`),
        fetch(`/api/v1/restaurants/${activeRestaurant.id}/menu-items`),
        fetch(`/api/v1/restaurants/${activeRestaurant.id}/tables`),
      ]);
      const catData = await catRes.json();
      const itemData = await itemRes.json();
      const tableData = await tableRes.json();
      if (catData.success) setCategories(catData.data.categories);
      if (itemData.success) setMenuItems(itemData.data.menuItems);
      if (tableData.success) setTables(tableData.data.tables);
    } catch {
      notify('error', 'Failed to refresh data.');
    }
  }, [activeRestaurant, notify]);

  // Hook for category and menu item actions
  const menuOps = useMenuManagement({
    activeRestaurant,
    notify,
    refreshActiveData,
    editingCategory,
    setEditingCategory,
    setShowCategoryModal,
    editingItem,
    setEditingItem,
    setShowItemModal,
  });

  // Hook for table and QR actions
  const tableOps = useTableManagement({
    activeRestaurant,
    notify,
    refreshActiveData,
    editingTable,
    setEditingTable,
    setShowTableModal,
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <DashboardNotification notification={notification} />

      <DashboardHeader
        currentUser={currentUser}
        restaurants={restaurants}
        activeRestaurant={activeRestaurant}
        onSelectRestaurant={setActiveRestaurant}
        onLogout={handleLogout}
      />

      <DashboardTabsNav
        activeRestaurant={activeRestaurant}
        activeTab={activeTab}
        categoriesCount={categories.length}
        itemsCount={menuItems.length}
        tablesCount={tables.length}
        onSelectTab={setActiveTab}
        onOpenAddCategory={() => {
          setEditingCategory(null);
          setShowCategoryModal(true);
        }}
        onOpenAddTable={() => {
          setEditingTable(null);
          setShowTableModal(true);
        }}
        onOpenAddItem={() => {
          setEditingItem(null);
          setShowItemModal(true);
        }}
      />

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
        <div className="flex-1">
          {activeTab === 'overview' && (
            <OverviewTab
              categories={categories}
              menuItems={menuItems}
              tables={tables}
              activeRestaurant={activeRestaurant}
            />
          )}

          {activeTab === 'categories' && (
            <CategoriesTab
              categories={categories}
              onOpenCreate={() => {
                setEditingCategory(null);
                setShowCategoryModal(true);
              }}
              onEditCategory={(cat: Category) => {
                setEditingCategory(cat);
                setShowCategoryModal(true);
              }}
              onToggleStatus={menuOps.handleToggleCategoryStatus}
            />
          )}

          {activeTab === 'items' && (
            <MenuItemsTab
              categories={categories}
              menuItems={menuItems}
              selectedCategoryFilter={selectedCategoryFilter}
              currency={activeRestaurant?.currency}
              onSelectCategoryFilter={setSelectedCategoryFilter}
              onOpenCreateItem={() => {
                setEditingItem(null);
                setShowItemModal(true);
              }}
              onEditItem={(item: MenuItem) => {
                setEditingItem(item);
                setShowItemModal(true);
              }}
              onToggleAvailability={menuOps.handleToggleItemAvailability}
            />
          )}

          {activeTab === 'tables' && (
            <TablesTab
              tables={tables}
              qrLoading={tableOps.qrLoading}
              onOpenCreateTable={() => {
                setEditingTable(null);
                setShowTableModal(true);
              }}
              onGenerateOrViewQr={tableOps.handleGenerateOrViewQr}
              onEditTable={(tbl: RestaurantTableData) => {
                setEditingTable(tbl);
                setShowTableModal(true);
              }}
              onDeactivateTable={tableOps.handleDeactivateTable}
              onClearTable={tableOps.handleOpenClearModal}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersTab
              restaurantId={activeRestaurant.id}
              currency={activeRestaurant.currency}
              onNotify={notify}
            />
          )}

          {activeTab === 'payments' && (
            <PaymentsTab
              restaurantId={activeRestaurant.id}
              restaurantSlug={activeRestaurant.slug}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <CategoryModal
        isOpen={showCategoryModal}
        editingCategory={editingCategory}
        defaultSortOrder={categories.length}
        loading={menuOps.actionLoading}
        onClose={() => {
          setShowCategoryModal(false);
          setEditingCategory(null);
        }}
        onSave={menuOps.handleSaveCategory}
      />

      <MenuItemModal
        isOpen={showItemModal}
        editingItem={editingItem}
        categories={categories}
        currency={activeRestaurant?.currency}
        loading={menuOps.actionLoading}
        onClose={() => {
          setShowItemModal(false);
          setEditingItem(null);
        }}
        onSave={menuOps.handleSaveItem}
      />

      <TableModal
        isOpen={showTableModal}
        editingTable={editingTable}
        defaultTableNumber={`T-${tables.length + 1}`}
        loading={tableOps.actionLoading}
        onClose={() => {
          setShowTableModal(false);
          setEditingTable(null);
        }}
        onSave={tableOps.handleSaveTable}
      />

      <QrCodeModal
        isOpen={tableOps.showQrModal}
        table={tableOps.activeTableForQr}
        restaurant={activeRestaurant}
        qrDataUrl={tableOps.qrDataUrl}
        qrMenuUrl={tableOps.qrMenuUrl}
        loading={tableOps.qrLoading}
        onClose={() => tableOps.setShowQrModal(false)}
        onRotate={tableOps.handleRotateQr}
        onRevoke={tableOps.handleRevokeQr}
      />

      <ClearTableModal
        isOpen={tableOps.showClearModal}
        table={tableOps.clearingTable}
        restaurantId={activeRestaurant?.id || ''}
        currency={activeRestaurant?.currency}
        onClose={tableOps.handleCloseClearModal}
        onCleared={refreshActiveData}
        notify={notify}
      />
    </div>
  );
}
