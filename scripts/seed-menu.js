const { PrismaClient } = require('../src/generated/prisma');

const prisma = new PrismaClient();

async function main() {
  // 1. Find the active restaurant
  const restaurant = await prisma.restaurant.findFirst({
    where: { isActive: true },
  });

  if (!restaurant) {
    console.error('No active restaurant found in database.');
    process.exit(1);
  }

  console.log(`Seeding menu for restaurant: "${restaurant.name}" (${restaurant.slug}) [${restaurant.id}]`);

  const menuData = [
    {
      category: 'Coffee & Beverages',
      description: 'Artisan espresso, cold brews, and refreshing signature mocktails',
      sortOrder: 1,
      items: [
        {
          name: 'Iced Caramel Macchiato',
          description: 'Freshly brewed espresso layered with creamy whole milk and vanilla syrup, crowned with buttery caramel drizzle.',
          price: 22000, // ₹220.00
          imageUrl: 'https://images.unsplash.com/photo-1485808191679-5f86510681a2?w=500&auto=format&fit=crop&q=80',
          sortOrder: 1,
        },
        {
          name: 'Classic Cold Brew Coffee',
          description: 'Slow-steeped for 16 hours using single-origin Arabica beans. Bold, smooth, with zero bitterness.',
          price: 18000, // ₹180.00
          imageUrl: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=500&auto=format&fit=crop&q=80',
          sortOrder: 2,
        },
        {
          name: 'Espresso Romano Single',
          description: 'Intense, rich espresso shot extracted under 9 bars of pressure, served with a twist of fresh lemon peel.',
          price: 12000, // ₹120.00
          imageUrl: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=500&auto=format&fit=crop&q=80',
          sortOrder: 3,
        },
        {
          name: 'Fresh Mint Mojito Fizz',
          description: 'Crushed garden mint, freshly squeezed lime, raw cane sugar, and sparkling soda served over crushed ice.',
          price: 16000, // ₹160.00
          imageUrl: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=500&auto=format&fit=crop&q=80',
          sortOrder: 4,
        },
      ],
    },
    {
      category: 'Starters & Small Plates',
      description: 'Crunchy appetizers, sourdough bites, and sharing platters',
      sortOrder: 2,
      items: [
        {
          name: 'Truffle Parmesan Fries',
          description: 'Crisp golden hand-cut fries tossed with aromatic white truffle oil, sea salt flakes, and aged Grana Padano parmesan.',
          price: 24000, // ₹240.00
          imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500&auto=format&fit=crop&q=80',
          sortOrder: 1,
        },
        {
          name: 'Paneer Tikka Bruschetta',
          description: 'Char-grilled cottage cheese marinated in aromatic tandoori spices, served on toasted sourdough with cherry tomatoes.',
          price: 28000, // ₹280.00
          imageUrl: 'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=500&auto=format&fit=crop&q=80',
          sortOrder: 2,
        },
        {
          name: 'Garlic Butter Stuffed Mushrooms',
          description: 'Plump button mushrooms filled with molten mozzarella, roasted garlic, fresh herbs, and baked golden.',
          price: 26000, // ₹260.00
          imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&auto=format&fit=crop&q=80',
          sortOrder: 3,
        },
      ],
    },
    {
      category: 'Mains & Bowls',
      description: 'Handmade pastas, wood-fired artisanal pizzas, and gourmet burgers',
      sortOrder: 3,
      items: [
        {
          name: 'Creamy Wild Mushroom Pasta',
          description: 'Artisanal fettuccine pasta tossed in a velvety garlic cream sauce with porcini and sautéed button mushrooms.',
          price: 38000, // ₹380.00
          imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281242?w=500&auto=format&fit=crop&q=80',
          sortOrder: 1,
        },
        {
          name: 'Classic Margherita Wood-Fired Pizza',
          description: 'Hand-stretched sourdough crust, San Marzano tomato sauce, fresh buffalo mozzarella, fragrant basil, and extra virgin olive oil.',
          price: 42000, // ₹420.00
          imageUrl: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=500&auto=format&fit=crop&q=80',
          sortOrder: 2,
        },
        {
          name: 'Farmhouse Gourmet Burger',
          description: 'Juicy spiced house patty, melted sharp cheddar, caramelized balsamic onions, crisp lettuce, and signature garlic aioli.',
          price: 34000, // ₹340.00
          imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=80',
          sortOrder: 3,
        },
      ],
    },
    {
      category: 'Dessert',
      description: 'Handcrafted desserts, warm bakes, and Belgian waffles',
      sortOrder: 4,
      items: [
        {
          name: 'Molten Belgian Chocolate Lava Cake',
          description: 'Warm dark chocolate cake with a flowing molten chocolate center, served with a scoop of Madagascar vanilla bean ice cream.',
          price: 25000, // ₹250.00
          imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=500&auto=format&fit=crop&q=80',
          sortOrder: 1,
        },
        {
          name: 'Classic Italian Tiramisu',
          description: 'Espresso-soaked savoiardi ladyfingers layered with whipped mascarpone cream and dusted with Dutch alkalized cocoa.',
          price: 29000, // ₹290.00
          imageUrl: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=500&auto=format&fit=crop&q=80',
          sortOrder: 2,
        },
        {
          name: 'Golden Belgian Waffle with Berries',
          description: 'Freshly baked crisp Belgian waffle served with seasonal berries, organic Canadian maple syrup, and whipped cream.',
          price: 23000, // ₹230.00
          imageUrl: 'https://images.unsplash.com/photo-1562376552-0d160a2f238d?w=500&auto=format&fit=crop&q=80',
          sortOrder: 3,
        },
      ],
    },
  ];

  for (const group of menuData) {
    // Upsert Category
    const category = await prisma.menuCategory.upsert({
      where: {
        restaurantId_name: {
          restaurantId: restaurant.id,
          name: group.category,
        },
      },
      update: {
        description: group.description,
        sortOrder: group.sortOrder,
        isActive: true,
      },
      create: {
        restaurantId: restaurant.id,
        name: group.category,
        description: group.description,
        sortOrder: group.sortOrder,
        isActive: true,
      },
    });

    console.log(`\nCategory: "${category.name}"`);

    // Insert Items
    for (const item of group.items) {
      const existing = await prisma.menuItem.findFirst({
        where: {
          restaurantId: restaurant.id,
          categoryId: category.id,
          name: item.name,
        },
      });

      if (existing) {
        await prisma.menuItem.update({
          where: { id: existing.id },
          data: {
            description: item.description,
            price: item.price,
            imageUrl: item.imageUrl,
            isAvailable: true,
            sortOrder: item.sortOrder,
          },
        });
        console.log(`  Updated: ${item.name} (₹${item.price / 100})`);
      } else {
        await prisma.menuItem.create({
          data: {
            restaurantId: restaurant.id,
            categoryId: category.id,
            name: item.name,
            description: item.description,
            price: item.price,
            imageUrl: item.imageUrl,
            isAvailable: true,
            sortOrder: item.sortOrder,
          },
        });
        console.log(`  Created: ${item.name} (₹${item.price / 100})`);
      }
    }
  }

  console.log('\nMenu seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
