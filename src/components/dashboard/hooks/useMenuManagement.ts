import { useState } from 'react';
import type { Category, MenuItem, RestaurantSummary } from '@/types/dashboard';

interface UseMenuManagementProps {
  activeRestaurant: RestaurantSummary | null;
  notify: (type: 'success' | 'error', message: string) => void;
  refreshActiveData: () => Promise<void>;
  editingCategory: Category | null;
  setEditingCategory: (cat: Category | null) => void;
  setShowCategoryModal: (show: boolean) => void;
  editingItem: MenuItem | null;
  setEditingItem: (item: MenuItem | null) => void;
  setShowItemModal: (show: boolean) => void;
}

export function useMenuManagement({
  activeRestaurant,
  notify,
  refreshActiveData,
  editingCategory,
  setEditingCategory,
  setShowCategoryModal,
  editingItem,
  setEditingItem,
  setShowItemModal,
}: UseMenuManagementProps) {
  const [actionLoading, setActionLoading] = useState(false);

  // --- Category Handlers ---
  async function handleSaveCategory(data: {
    name: string;
    description: string | null;
    sortOrder: number;
  }) {
    if (!activeRestaurant) return;
    setActionLoading(true);
    try {
      const url = editingCategory
        ? `/api/v1/restaurants/${activeRestaurant.id}/categories/${editingCategory.id}`
        : `/api/v1/restaurants/${activeRestaurant.id}/categories`;
      const res = await fetch(url, {
        method: editingCategory ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error?.message || 'Failed to save category');
      }

      notify(
        'success',
        editingCategory ? 'Category updated' : 'Category created successfully',
      );
      setShowCategoryModal(false);
      setEditingCategory(null);
      void refreshActiveData();
    } catch (err) {
      notify('error', (err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleCategoryStatus(cat: Category) {
    if (!activeRestaurant) return;
    try {
      const res = await fetch(
        `/api/v1/restaurants/${activeRestaurant.id}/categories/${cat.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: !cat.isActive }),
        },
      );
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error?.message || 'Failed to update category');
      }

      notify('success', `Category marked ${!cat.isActive ? 'Active' : 'Inactive'}`);
      void refreshActiveData();
    } catch (err) {
      notify('error', (err as Error).message);
    }
  }

  // --- Menu Item Handlers ---
  async function handleSaveItem(data: {
    name: string;
    description: string | null;
    categoryId: string;
    priceMajor: string;
    imageUrl: string | null;
    isAvailable: boolean;
  }) {
    if (!activeRestaurant) return;
    const priceMajorNum = parseFloat(data.priceMajor);
    if (isNaN(priceMajorNum) || priceMajorNum < 0) {
      notify('error', 'Please enter a valid price.');
      return;
    }

    setActionLoading(true);
    try {
      const url = editingItem
        ? `/api/v1/restaurants/${activeRestaurant.id}/menu-items/${editingItem.id}`
        : `/api/v1/restaurants/${activeRestaurant.id}/menu-items`;
      const res = await fetch(url, {
        method: editingItem ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          categoryId: data.categoryId,
          price: Math.round(priceMajorNum * 100),
          imageUrl: data.imageUrl,
          isAvailable: data.isAvailable,
        }),
      });
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error?.message || 'Failed to save menu item');
      }

      notify(
        'success',
        editingItem ? 'Menu item updated' : 'Menu item created successfully',
      );
      setShowItemModal(false);
      setEditingItem(null);
      void refreshActiveData();
    } catch (err) {
      notify('error', (err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleItemAvailability(item: MenuItem) {
    if (!activeRestaurant) return;
    try {
      const res = await fetch(
        `/api/v1/restaurants/${activeRestaurant.id}/menu-items/${item.id}/availability`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isAvailable: !item.isAvailable }),
        },
      );
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error?.message || 'Failed to toggle availability');
      }

      notify(
        'success',
        `${item.name} is now ${!item.isAvailable ? 'Available' : 'Unavailable'}`,
      );
      void refreshActiveData();
    } catch (err) {
      notify('error', (err as Error).message);
    }
  }

  return {
    actionLoading,
    handleSaveCategory,
    handleToggleCategoryStatus,
    handleSaveItem,
    handleToggleItemAvailability,
  };
}
