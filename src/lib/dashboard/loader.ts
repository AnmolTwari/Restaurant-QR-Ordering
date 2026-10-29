import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { TableStatus } from '@/types';
import type {
  RestaurantSummary,
  Category,
  MenuItem,
  RestaurantTableData,
} from '@/types/dashboard';

export type DashboardInitialDataResult =
  | { authenticated: false }
  | {
      authenticated: true;
      hasRestaurants: false;
      currentUser: { id: string; fullName: string; email: string };
      restaurants: [];
    }
  | {
      authenticated: true;
      hasRestaurants: true;
      currentUser: { id: string; fullName: string; email: string };
      restaurants: RestaurantSummary[];
      activeRestaurant: RestaurantSummary;
      categories: Category[];
      menuItems: MenuItem[];
      tables: RestaurantTableData[];
    };

/**
 * Server-side pre-fetcher for owner & staff dashboard.
 * Eliminates 4-stage client-side network waterfall for instant SSR paint.
 */
export async function getDashboardInitialData(): Promise<DashboardInitialDataResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { authenticated: false };
  }

  const memberships = await prisma.restaurantMembership.findMany({
    where: {
      userId: user.id,
      isActive: true,
      restaurant: { isActive: true },
    },
    include: {
      restaurant: {
        select: {
          id: true,
          name: true,
          slug: true,
          currency: true,
          address: true,
          phone: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (memberships.length === 0) {
    return {
      authenticated: true,
      hasRestaurants: false,
      currentUser: { id: user.id, fullName: user.fullName, email: user.email },
      restaurants: [],
    };
  }

  const restaurants: RestaurantSummary[] = memberships.map((m) => ({
    id: m.restaurant.id,
    name: m.restaurant.name,
    slug: m.restaurant.slug,
    currency: m.restaurant.currency,
    role: m.role,
    address: m.restaurant.address || undefined,
    phone: m.restaurant.phone || undefined,
  }));

  const activeRestaurant = restaurants[0];

  // Parallel server-side fetch of active restaurant data
  const [categoriesRaw, menuItemsRaw, tablesRaw] = await Promise.all([
    prisma.menuCategory.findMany({
      where: { restaurantId: activeRestaurant.id },
      include: {
        _count: { select: { menuItems: true } },
      },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.menuItem.findMany({
      where: { restaurantId: activeRestaurant.id },
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.restaurantTable.findMany({
      where: { restaurantId: activeRestaurant.id },
      include: {
        qrTokens: {
          where: { isRevoked: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: {
          select: {
            sessions: { where: { isActive: true } },
            orders: true,
          },
        },
      },
      orderBy: { tableNumber: 'asc' },
    }),
  ]);

  const categories: Category[] = categoriesRaw.map((c) => ({
    id: c.id,
    restaurantId: c.restaurantId,
    name: c.name,
    description: c.description,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    itemCount: c._count.menuItems,
  }));

  const menuItems: MenuItem[] = menuItemsRaw.map((i) => ({
    id: i.id,
    restaurantId: i.restaurantId,
    categoryId: i.categoryId,
    name: i.name,
    description: i.description,
    price: i.price,
    imageUrl: i.imageUrl,
    isAvailable: i.isAvailable,
    sortOrder: i.sortOrder,
    category: i.category,
  }));

  const tables: RestaurantTableData[] = tablesRaw.map((t) => ({
    id: t.id,
    tableNumber: t.tableNumber,
    capacity: t.capacity,
    status: t.status as TableStatus,
    hasActiveQr: t.qrTokens.length > 0,
    qrTokenInfo: t.qrTokens[0]
      ? { id: t.qrTokens[0].id, createdAt: t.qrTokens[0].createdAt.toISOString() }
      : null,
    activeSessionsCount: t._count.sessions,
    totalOrdersCount: t._count.orders,
    createdAt: t.createdAt.toISOString(),
  }));

  return {
    authenticated: true,
    hasRestaurants: true,
    currentUser: { id: user.id, fullName: user.fullName, email: user.email },
    restaurants,
    activeRestaurant,
    categories,
    menuItems,
    tables,
  };
}
