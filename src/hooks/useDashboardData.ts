'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type {
  RestaurantSummary,
  Category,
  MenuItem,
  RestaurantTableData,
  NotificationState,
} from '@/types/dashboard';

export function useDashboardData() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<{ id: string; fullName: string; email: string } | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [activeRestaurant, setActiveRestaurant] = useState<RestaurantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<NotificationState | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<RestaurantTableData[]>([]);

  const notify = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  // Load User & Owned Restaurants
  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const userRes = await fetch('/api/v1/auth/me');
      const userData = await userRes.json();

      if (!userRes.ok || !userData.success) {
        router.push('/login');
        return;
      }

      setCurrentUser(userData.data.user);

      const restRes = await fetch('/api/v1/restaurants');
      const restData = await restRes.json();

      if (!restRes.ok || !restData.success || restData.data.restaurants.length === 0) {
        router.push('/onboarding');
        return;
      }

      const list: RestaurantSummary[] = restData.data.restaurants;
      setRestaurants(list);
      setActiveRestaurant(list[0]);
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // Load Categories, Items, and Tables when Active Restaurant Changes
  const loadRestaurantData = useCallback(async (restaurantId: string) => {
    try {
      const [catRes, itemRes, tableRes] = await Promise.all([
        fetch(`/api/v1/restaurants/${restaurantId}/categories`),
        fetch(`/api/v1/restaurants/${restaurantId}/menu-items`),
        fetch(`/api/v1/restaurants/${restaurantId}/tables`),
      ]);

      const catData = await catRes.json();
      const itemData = await itemRes.json();
      const tableData = await tableRes.json();

      if (catData.success) {
        setCategories(catData.data.categories);
      }
      if (itemData.success) {
        setMenuItems(itemData.data.menuItems);
      }
      if (tableData.success) {
        setTables(tableData.data.tables);
      }
    } catch {
      notify('error', 'Failed to load restaurant data.');
    }
  }, [notify]);

  useEffect(() => {
    if (activeRestaurant) {
      void loadRestaurantData(activeRestaurant.id);
    }
  }, [activeRestaurant, loadRestaurantData]);

  const refreshActiveData = useCallback(() => {
    if (activeRestaurant) {
      void loadRestaurantData(activeRestaurant.id);
    }
  }, [activeRestaurant, loadRestaurantData]);

  return {
    currentUser,
    restaurants,
    activeRestaurant,
    setActiveRestaurant,
    loading,
    notification,
    notify,
    categories,
    menuItems,
    tables,
    refreshActiveData,
  };
}
