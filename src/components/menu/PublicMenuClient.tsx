'use client';

import React, { useState, useEffect } from 'react';
import { UtensilsCrossed, ShoppingBag, ArrowRight, AlertTriangle, RefreshCw } from 'lucide-react';
import type { PublicMenuData, PublicMenuItem } from '@/types/public-menu';
import { useCart } from '@/hooks/useCart';
import { formatMoney } from '@/lib/formatters';

import { MenuHeader } from '@/components/menu/MenuHeader';
import { MenuFilterBar } from '@/components/menu/MenuFilterBar';
import { MenuItemCard } from '@/components/menu/MenuItemCard';
import { CartDrawer } from '@/components/menu/CartDrawer';
import { OrderTrackingView } from '@/components/menu/OrderTrackingView';

interface PublicMenuClientProps {
  slug: string;
  data: PublicMenuData;
  tableToken?: string;
  initialOrderNumber?: string | null;
}

export function PublicMenuClient({
  slug,
  data,
  tableToken,
  initialOrderNumber = null,
}: PublicMenuClientProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Cart & Order State
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [activeOrderNumber, setActiveOrderNumber] = useState<string | null>(initialOrderNumber);

  // Dining Session State (HttpOnly cookie is primary credential)
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionVerifying, setSessionVerifying] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Establish or verify dining session via Route Handler
  useEffect(() => {
    let isMounted = true;
    setSessionVerifying(true);
    setSessionError(null);

    async function establishSession() {
      try {
        const res = await fetch('/api/v1/public/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantSlug: slug,
            tableToken: tableToken || undefined,
          }),
        });

        const json = await res.json();
        if (!isMounted) return;

        if (res.ok && json.success && json.data?.valid) {
          setSessionReady(true);
          setSessionError(null);
        } else {
          setSessionReady(false);
          setSessionError(
            json.error?.message ||
              'Your table session is invalid, expired, or belongs to another restaurant. Please rescan your table QR code.',
          );
        }
      } catch {
        if (!isMounted) return;
        setSessionReady(false);
        setSessionError('Network error establishing table session. Please check your connection.');
      } finally {
        if (isMounted) setSessionVerifying(false);
      }
    }

    void establishSession();
    return () => {
      isMounted = false;
    };
  }, [slug, tableToken]);

  // Initialize cart with table context
  const cart = useCart(slug, data.table.tableNumber || 'default');

  // If viewing active order tracking
  if (activeOrderNumber) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 pb-16 selection:bg-orange-500 selection:text-white">
        <OrderTrackingView
          orderNumber={activeOrderNumber}
          onBackToMenu={() => setActiveOrderNumber(null)}
        />
      </div>
    );
  }

  // Flatten & Filter Items
  const allItems = data.categories.flatMap((cat) =>
    cat.items.map((item) => ({ ...item, categoryName: cat.name, categoryId: cat.id })),
  );

  const filteredItems = allItems.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory;
    const matchesQuery =
      searchQuery.trim() === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesQuery;
  });

  function handleAddToCart(item: PublicMenuItem) {
    const category = data.categories.find((c) =>
      c.items.some((i) => i.id === item.id),
    );
    cart.addItem(item, category?.name || 'Item');
  }

  async function handleSubmitOrder() {
    if (cart.items.length === 0) return;
    if (!sessionReady) {
      alert(sessionError || 'Table session is not verified. Please scan your table QR code.');
      return;
    }

    setSubmittingOrder(true);
    try {
      const idempotencyKey = `ord_idem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Standard browser customer flow: HttpOnly table_session cookie is transmitted automatically
      const res = await fetch('/api/v1/public/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          restaurantSlug: slug,
          idempotencyKey,
          notes: cart.orderNotes || undefined,
          items: cart.items.map((i) => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            notes: i.notes || undefined,
          })),
        }),
      });

      const resData = await res.json();

      if (!res.ok || !resData.success) {
        if (res.status === 401) {
          setSessionReady(false);
          setSessionError(
            resData.error?.message ||
              'Your table session is invalid or expired. Please rescan your table QR code.',
          );
        }
        throw new Error(resData.error?.message || 'Failed to place order.');
      }

      cart.clearCart();
      setIsCartOpen(false);
      setActiveOrderNumber(resData.data.order.orderNumber);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmittingOrder(false);
    }
  }

  const disabledReason = sessionVerifying
    ? 'Connecting to table...'
    : !sessionReady
    ? 'Session Invalid — Rescan QR'
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-28 selection:bg-orange-500 selection:text-white">
      {/* Restaurant & Table Header */}
      <MenuHeader restaurant={data.restaurant} table={data.table} />

      {/* Session Error Alert Banner */}
      {!sessionVerifying && !sessionReady && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="p-4 rounded-2xl bg-amber-950/60 border border-amber-800/60 text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-semibold text-amber-100">Table Session Required</p>
              <p className="mt-0.5 text-amber-300/80">
                {sessionError ||
                  'Your table session could not be verified. Please scan your table QR code to enable ordering.'}
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="p-1.5 rounded-lg bg-amber-900/60 hover:bg-amber-900 text-amber-200 text-xs flex items-center gap-1 shrink-0"
              title="Retry verification"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      )}

      {/* Sticky Search & Category Bar */}
      <MenuFilterBar
        searchQuery={searchQuery}
        selectedCategory={selectedCategory}
        totalItemsCount={allItems.length}
        categories={data.categories}
        onSearchChange={setSearchQuery}
        onSelectCategory={setSelectedCategory}
      />

      {/* Menu Item Cards */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {filteredItems.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center border border-slate-800 my-8">
            <UtensilsCrossed className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white mb-1">No items found</h3>
            <p className="text-xs text-slate-400">
              {searchQuery
                ? `No dishes matching "${searchQuery}". Try a different keyword.`
                : 'No active menu items available in this category currently.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => {
              const inCart = cart.items.find((i) => i.menuItemId === item.id);
              return (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  currency={data.restaurant.currency}
                  cartQuantity={inCart?.quantity || 0}
                  onAddToCart={handleAddToCart}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar */}
      {cart.totalCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 p-3 sm:p-4 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
          <div className="max-w-md mx-auto">
            <button
              onClick={() => setIsCartOpen(true)}
              className="w-full py-3.5 px-5 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm shadow-2xl shadow-orange-600/40 flex items-center justify-between transition-all transform active:scale-95"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-black/20 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4 text-white" />
                </div>
                <span>View Cart ({cart.totalCount})</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-black">
                  {formatMoney(cart.subtotal, data.restaurant.currency)}
                </span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        items={cart.items}
        orderNotes={cart.orderNotes}
        currency={data.restaurant.currency}
        subtotal={cart.subtotal}
        submitting={submittingOrder}
        disabledReason={disabledReason}
        onClose={() => setIsCartOpen(false)}
        onUpdateQuantity={cart.updateQuantity}
        onUpdateItemNotes={cart.updateItemNotes}
        onRemoveItem={cart.removeItem}
        onOrderNotesChange={cart.setOrderNotes}
        onSubmitOrder={handleSubmitOrder}
      />
    </div>
  );
}
