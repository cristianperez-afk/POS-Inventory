// Category subcategories mapping — apparel/thrift (ukay-ukay) goods
export const categorySubcategories: { [key: string]: string[] } = {
  'Tops': ['T-Shirts', 'Polo Shirts', 'Blouses', 'Tank Tops'],
  'Bottoms': ['Jeans', 'Pants', 'Shorts', 'Skirts'],
  'Dresses': ['Casual Dresses', 'Formal Dresses'],
  'Outerwear': ['Jackets', 'Hoodies & Sweaters'],
  'Shoes': ['Sneakers', 'Boots', 'Sandals'],
  'Accessories': ['Bags', 'Hats'],
  // Assorted/unsorted bales that don't fit one clothing type (e.g. "Mixed Clothing" bale)
  'Mixed': ['Mixed Clothing', 'Mixed Kids Wear', 'Mixed Accessories', 'Mixed Shoes', 'Assorted Grade A', 'Assorted Grade B']
};

// Category subcategories mapping — brand-new general merchandise (mall/retail goods)
export const generalMerchandiseSubcategories: { [key: string]: string[] } = {
  'Electronics': ['Mobile & Accessories', 'Computers & Peripherals', 'Audio & Headphones', 'Cables & Chargers', 'Batteries'],
  'Home & Kitchen': ['Cookware', 'Tableware', 'Storage & Organization', 'Small Appliances', 'Home Decor'],
  'Health & Beauty': ['Skincare', 'Cosmetics', 'Hair Care', 'Fragrances', 'Personal Care'],
  'Groceries & Food': ['Snacks & Confectionery', 'Beverages', 'Canned & Packaged Goods', 'Condiments & Spices', 'Dairy & Frozen'],
  'Household Supplies': ['Cleaning Supplies', 'Laundry', 'Paper Products', 'Air Fresheners', 'Pest Control'],
  'Stationery & Office': ['Writing Instruments', 'Paper & Notebooks', 'Office Supplies', 'Art & Craft', 'Filing & Storage'],
  'Toys & Games': ['Educational Toys', 'Action Figures & Dolls', 'Board Games & Puzzles', 'Outdoor Play'],
  'Hardware & Tools': ['Hand Tools', 'Power Tools', 'Fasteners', 'Electrical', 'Plumbing'],
  'Baby & Kids': ['Diapers & Wipes', 'Feeding', 'Baby Care', 'Kids Apparel'],
  'Sports & Outdoors': ['Fitness Equipment', 'Outdoor Gear', 'Sportswear', 'Bicycles & Accessories'],
};

// Colors for charts
export const CHART_COLORS = ['#007A5E', '#009BA5', '#00A7A5', '#E0F5F1', '#008967'];
