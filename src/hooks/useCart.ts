'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CartItem } from '@/types/orders';
import type { PublicMenuItem } from '@/types/public-menu';

export function useCart(restaurantSlug: string, tableNumber: string) {
  const storageKey = `dineflow_cart_${restaurantSlug}_${tableNumber}`;

  const [items, setItems] = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.items)) setItems(parsed.items);
        if (typeof parsed.orderNotes === 'string') setOrderNotes(parsed.orderNotes);
      }
    } catch {
      // Ignore localStorage errors
    } finally {
      setIsLoaded(true);
    }
  }, [storageKey]);

  // Persist cart changes
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ items, orderNotes }));
    } catch {
      // Ignore localStorage errors
    }
  }, [items, orderNotes, storageKey, isLoaded]);

  const addItem = useCallback((item: PublicMenuItem, categoryName: string) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === item.id);
      if (existing) {
        return prev.map((i) =>
          i.menuItemId === item.id
            ? { ...i, quantity: Math.min(i.quantity + 1, 50) }
            : i,
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          price: item.price,
          imageUrl: item.imageUrl,
          categoryName,
          quantity: 1,
          notes: '',
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback((menuItemId: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((item) => {
          if (item.menuItemId !== menuItemId) return item;
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: Math.min(newQty, 50) } : null;
        })
        .filter((item): item is CartItem => item !== null),
    );
  }, []);

  const updateItemNotes = useCallback((menuItemId: string, notes: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.menuItemId === menuItemId ? { ...item, notes } : item,
      ),
    );
  }, []);

  const removeItem = useCallback((menuItemId: string) => {
    setItems((prev) => prev.filter((i) => i.menuItemId !== menuItemId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setOrderNotes('');
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore localStorage errors
    }
  }, [storageKey]);

  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    items,
    orderNotes,
    setOrderNotes,
    addItem,
    updateQuantity,
    updateItemNotes,
    removeItem,
    clearCart,
    totalCount,
    subtotal,
  };
}
