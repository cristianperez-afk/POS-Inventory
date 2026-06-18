// Types
export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  category: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  targetCustomer: 'Male' | 'Female' | 'Unisex';
  subcategory: string;
  size: string;
  condition: 'Excellent' | 'Good' | 'Fair' | 'Damaged';
  quantity: number;
  price: number;
  dateAdded: string;
  location: string;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplier: string;
  date: string;
  status: 'Pending' | 'Approved' | 'Received' | 'Rejected' | 'Cancelled';
  items: { name: string; quantity: number; price: number }[];
  totalAmount: number;
  paymentMethod?: 'Cash' | 'Bank Transfer' | 'Check' | 'Credit Terms';
  paymentTerms?: string;
  createdBy?: string;
}

export interface Transfer {
  id: string;
  transferNumber: string;
  fromLocation: string;
  toLocation: string;
  date: string;
  status: 'Pending' | 'In Transit' | 'Completed' | 'Cancelled';
  items: { itemId: string; name: string; quantity: number }[];
  createdBy: string;
  notes?: string;
}

export interface Adjustment {
  id: string;
  adjustmentNumber: string;
  date: string;
  type: 'Add' | 'Remove' | 'Damage' | 'Lost' | 'Found' | 'Recount';
  reason: string;
  items: { itemId: string; name: string; quantityChange: number; location: string }[];
  createdBy: string;
  status: 'Pending' | 'Approved' | 'Rejected';
}

export interface Location {
  id: string;
  name: string;
  address: string;
  manager: string;
  phone: string;
  itemCount: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Manager' | 'Staff';
  status: 'Active' | 'Inactive';
  lastLogin: string;
}

export interface Sale {
  id: string;
  transactionNumber: string;
  date: string;
  time: string;
  cashier: string;
  location: string;
  items: {
    itemId: string;
    name: string;
    category: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: 'Cash' | 'GCash' | 'Card' | 'Bank Transfer';
  amountPaid: number;
  change: number;
  customer?: string;
  status: 'Completed' | 'Refunded' | 'Partial Refund';
  refundReason?: string;
}

// Generate Sample Data
export function generateSampleData(): InventoryItem[] {
  const items: InventoryItem[] = [];
  let id = 1;

  // Tops - T-Shirts
  const tshirts = [
    'Vintage Band T-Shirt', 'Plain White Tee', 'Graphic Print Shirt', 'Striped Casual Tee',
    'V-Neck Cotton Shirt', 'Oversized Tee', 'Vintage Logo Tee', 'Tie-Dye T-Shirt',
    'Retro Sports Tee', 'Basic Black Shirt', 'Crop Top Tee', 'Long Sleeve Tee'
  ];
  tshirts.forEach((name, index) => {
    const gender = index % 2 === 0 ? 'Men' : 'Women';
    items.push({
      id: String(id++),
      name,
      category: 'Tops',
      
      targetCustomer: (gender === 'Men' ? 'Male' : 'Female'),
      subcategory: 'T-Shirts',
      size: ['XS', 'S', 'M', 'L', 'XL'][Math.floor(Math.random() * 5)],
      condition: ['Excellent', 'Good', 'Fair'][Math.floor(Math.random() * 3)] as any,
      quantity: Math.floor(Math.random() * 10) + 1,
      price: Math.floor(Math.random() * 200) + 100,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: ['Main Store', 'Warehouse', 'Branch 1'][Math.floor(Math.random() * 3)]
    });
  });

  // Tops - Polo Shirts
  const polos = [
    'Classic Polo', 'Striped Polo Shirt', 'Branded Polo', 'Golf Polo',
    'Navy Blue Polo', 'Pique Polo', 'Slim Fit Polo', 'Vintage Polo'
  ];
  polos.forEach((name, index) => {
    const gender = index < 5 ? 'Men' : 'Women';
    items.push({
      id: String(id++),
      name,
      category: 'Tops',
      
      targetCustomer: (gender === 'Men' ? 'Male' : 'Female'),
      subcategory: 'Polo Shirts',
      size: ['S', 'M', 'L', 'XL'][Math.floor(Math.random() * 4)],
      condition: ['Excellent', 'Good'][Math.floor(Math.random() * 2)] as any,
      quantity: Math.floor(Math.random() * 8) + 2,
      price: Math.floor(Math.random() * 250) + 150,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: ['Main Store', 'Branch 1'][Math.floor(Math.random() * 2)]
    });
  });

  // Tops - Blouses
  const blouses = [
    'Floral Blouse', 'Silk Blouse', 'Lace Detail Blouse', 'Office Blouse',
    'Ruffled Blouse', 'Peasant Blouse', 'Button-Up Blouse', 'Chiffon Blouse'
  ];
  blouses.forEach(name => {
    items.push({
      id: String(id++),
      name,
      category: 'Tops',
      
      targetCustomer: 'Female',
      subcategory: 'Blouses',
      size: ['XS', 'S', 'M', 'L'][Math.floor(Math.random() * 4)],
      condition: ['Excellent', 'Good', 'Fair'][Math.floor(Math.random() * 3)] as any,
      quantity: Math.floor(Math.random() * 6) + 1,
      price: Math.floor(Math.random() * 300) + 180,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: ['Main Store', 'Warehouse'][Math.floor(Math.random() * 2)]
    });
  });

  // Tops - Tank Tops
  const tanks = [
    'Basic Tank Top', 'Racerback Tank', 'Muscle Tank', 'Graphic Tank',
    'Ribbed Tank Top', 'Cropped Tank'
  ];
  tanks.forEach((name, index) => {
    const gender = index % 2 === 0 ? 'Women' : 'Men';
    items.push({
      id: String(id++),
      name,
      category: 'Tops',
      
      targetCustomer: (gender === 'Men' ? 'Male' : 'Female'),
      subcategory: 'Tank Tops',
      size: ['S', 'M', 'L'][Math.floor(Math.random() * 3)],
      condition: ['Excellent', 'Good'][Math.floor(Math.random() * 2)] as any,
      quantity: Math.floor(Math.random() * 7) + 2,
      price: Math.floor(Math.random() * 150) + 80,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: 'Main Store'
    });
  });

  // Bottoms - Jeans
  const jeans = [
    'Vintage Levi\'s Jeans', 'Skinny Jeans', 'Mom Jeans', 'Boyfriend Jeans',
    'High-Waisted Jeans', 'Ripped Jeans', 'Bootcut Jeans', 'Straight Leg Jeans',
    'Black Denim', 'Light Wash Jeans'
  ];
  jeans.forEach((name, index) => {
    const gender = index % 2 === 0 ? 'Men' : 'Women';
    items.push({
      id: String(id++),
      name,
      category: 'Bottoms',
      
      targetCustomer: (gender === 'Men' ? 'Male' : 'Female'),
      subcategory: 'Jeans',
      size: ['26', '28', '30', '32', '34'][Math.floor(Math.random() * 5)],
      condition: ['Excellent', 'Good', 'Fair'][Math.floor(Math.random() * 3)] as any,
      quantity: Math.floor(Math.random() * 8) + 1,
      price: Math.floor(Math.random() * 400) + 200,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: ['Main Store', 'Warehouse', 'Branch 1'][Math.floor(Math.random() * 3)]
    });
  });

  // Bottoms - Pants
  const pants = [
    'Cargo Pants', 'Chinos', 'Dress Pants', 'Joggers', 'Wide Leg Pants',
    'Corduroy Pants', 'Khaki Pants', 'Leather Pants'
  ];
  pants.forEach((name, index) => {
    const gender = index < 4 ? 'Men' : 'Women';
    items.push({
      id: String(id++),
      name,
      category: 'Bottoms',
      
      targetCustomer: (gender === 'Men' ? 'Male' : 'Female'),
      subcategory: 'Pants',
      size: ['S', 'M', 'L', 'XL'][Math.floor(Math.random() * 4)],
      condition: ['Excellent', 'Good'][Math.floor(Math.random() * 2)] as any,
      quantity: Math.floor(Math.random() * 6) + 2,
      price: Math.floor(Math.random() * 350) + 180,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: ['Main Store', 'Branch 1'][Math.floor(Math.random() * 2)]
    });
  });

  // Bottoms - Shorts
  const shorts = [
    'Denim Shorts', 'Athletic Shorts', 'Cargo Shorts', 'Board Shorts',
    'High-Waisted Shorts', 'Bermuda Shorts'
  ];
  shorts.forEach((name, index) => {
    const gender = index % 2 === 0 ? 'Women' : 'Men';
    items.push({
      id: String(id++),
      name,
      category: 'Bottoms',
      
      targetCustomer: (gender === 'Men' ? 'Male' : 'Female'),
      subcategory: 'Shorts',
      size: ['XS', 'S', 'M', 'L'][Math.floor(Math.random() * 4)],
      condition: ['Excellent', 'Good', 'Fair'][Math.floor(Math.random() * 3)] as any,
      quantity: Math.floor(Math.random() * 5) + 1,
      price: Math.floor(Math.random() * 200) + 120,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: 'Main Store'
    });
  });

  // Bottoms - Skirts
  const skirts = [
    'Mini Skirt', 'Midi Skirt', 'Pleated Skirt', 'Denim Skirt',
    'Pencil Skirt', 'A-Line Skirt', 'Wrap Skirt'
  ];
  skirts.forEach(name => {
    items.push({
      id: String(id++),
      name,
      category: 'Bottoms',
      
      targetCustomer: 'Female',
      subcategory: 'Skirts',
      size: ['XS', 'S', 'M', 'L'][Math.floor(Math.random() * 4)],
      condition: ['Excellent', 'Good'][Math.floor(Math.random() * 2)] as any,
      quantity: Math.floor(Math.random() * 4) + 1,
      price: Math.floor(Math.random() * 250) + 150,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: ['Main Store', 'Warehouse'][Math.floor(Math.random() * 2)]
    });
  });

  // Dresses - Casual
  const casualDresses = [
    'Summer Dress', 'Sundress', 'Shirt Dress', 'T-Shirt Dress',
    'Casual Maxi Dress', 'Wrap Dress'
  ];
  casualDresses.forEach(name => {
    items.push({
      id: String(id++),
      name,
      category: 'Dresses',
      
      targetCustomer: 'Female',
      subcategory: 'Casual Dresses',
      size: ['XS', 'S', 'M', 'L'][Math.floor(Math.random() * 4)],
      condition: ['Excellent', 'Good'][Math.floor(Math.random() * 2)] as any,
      quantity: Math.floor(Math.random() * 4) + 1,
      price: Math.floor(Math.random() * 300) + 200,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: 'Main Store'
    });
  });

  // Dresses - Formal
  const formalDresses = [
    'Cocktail Dress', 'Evening Gown', 'Little Black Dress', 'Formal Maxi',
    'Party Dress', 'Prom Dress'
  ];
  formalDresses.forEach(name => {
    items.push({
      id: String(id++),
      name,
      category: 'Dresses',
      
      targetCustomer: 'Female',
      subcategory: 'Formal Dresses',
      size: ['XS', 'S', 'M', 'L'][Math.floor(Math.random() * 4)],
      condition: ['Excellent', 'Good'][Math.floor(Math.random() * 2)] as any,
      quantity: Math.floor(Math.random() * 3) + 1,
      price: Math.floor(Math.random() * 600) + 400,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: ['Main Store', 'Warehouse'][Math.floor(Math.random() * 2)]
    });
  });

  // Outerwear - Jackets
  const jackets = [
    'Denim Jacket', 'Leather Jacket', 'Bomber Jacket', 'Varsity Jacket',
    'Windbreaker', 'Track Jacket', 'Puffer Jacket', 'Jean Jacket'
  ];
  jackets.forEach((name, index) => {
    const gender = index % 2 === 0 ? 'Men' : 'Women';
    items.push({
      id: String(id++),
      name,
      category: 'Outerwear',
      
      targetCustomer: (gender === 'Men' ? 'Male' : 'Female'),
      subcategory: 'Jackets',
      size: ['S', 'M', 'L', 'XL'][Math.floor(Math.random() * 4)],
      condition: ['Excellent', 'Good', 'Fair'][Math.floor(Math.random() * 3)] as any,
      quantity: Math.floor(Math.random() * 5) + 1,
      price: Math.floor(Math.random() * 500) + 300,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: ['Main Store', 'Warehouse'][Math.floor(Math.random() * 2)]
    });
  });

  // Outerwear - Hoodies & Sweaters
  const hoodies = [
    'Pullover Hoodie', 'Zip-Up Hoodie', 'Crewneck Sweatshirt', 'Oversized Hoodie',
    'Knit Sweater', 'Cardigan Sweater', 'Turtleneck Sweater'
  ];
  hoodies.forEach((name, index) => {
    const gender = index < 4 ? 'Men' : 'Women';
    items.push({
      id: String(id++),
      name,
      category: 'Outerwear',
      
      targetCustomer: (gender === 'Men' ? 'Male' : 'Female'),
      subcategory: 'Hoodies & Sweaters',
      size: ['S', 'M', 'L', 'XL'][Math.floor(Math.random() * 4)],
      condition: ['Excellent', 'Good'][Math.floor(Math.random() * 2)] as any,
      quantity: Math.floor(Math.random() * 6) + 2,
      price: Math.floor(Math.random() * 350) + 200,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: 'Main Store'
    });
  });

  // Shoes - Sneakers
  const sneakers = [
    'Nike Air Max', 'Adidas Superstar', 'Converse Chuck Taylor', 'Vans Old Skool',
    'Running Sneakers', 'High-Top Sneakers', 'Slip-On Sneakers', 'Retro Sneakers'
  ];
  sneakers.forEach(name => {
    items.push({
      id: String(id++),
      name,
      category: 'Shoes',
      
      targetCustomer: 'Unisex',
      subcategory: 'Sneakers',
      size: ['7', '8', '9', '10', '11'][Math.floor(Math.random() * 5)],
      condition: ['Excellent', 'Good', 'Fair'][Math.floor(Math.random() * 3)] as any,
      quantity: Math.floor(Math.random() * 4) + 1,
      price: Math.floor(Math.random() * 800) + 400,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: ['Main Store', 'Warehouse'][Math.floor(Math.random() * 2)]
    });
  });

  // Shoes - Boots
  const boots = [
    'Leather Boots', 'Combat Boots', 'Chelsea Boots', 'Ankle Boots',
    'Cowboy Boots', 'Winter Boots'
  ];
  boots.forEach(name => {
    items.push({
      id: String(id++),
      name,
      category: 'Shoes',
      
      targetCustomer: 'Unisex',
      subcategory: 'Boots',
      size: ['7', '8', '9', '10'][Math.floor(Math.random() * 4)],
      condition: ['Excellent', 'Good', 'Fair'][Math.floor(Math.random() * 3)] as any,
      quantity: Math.floor(Math.random() * 3) + 1,
      price: Math.floor(Math.random() * 900) + 500,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: ['Warehouse', 'Branch 1'][Math.floor(Math.random() * 2)]
    });
  });

  // Shoes - Sandals
  const sandals = [
    'Slide Sandals', 'Flip Flops', 'Strappy Sandals', 'Platform Sandals',
    'Gladiator Sandals'
  ];
  sandals.forEach(name => {
    items.push({
      id: String(id++),
      name,
      category: 'Shoes',
      
      targetCustomer: 'Unisex',
      subcategory: 'Sandals',
      size: ['7', '8', '9', '10'][Math.floor(Math.random() * 4)],
      condition: ['Excellent', 'Good'][Math.floor(Math.random() * 2)] as any,
      quantity: Math.floor(Math.random() * 5) + 2,
      price: Math.floor(Math.random() * 300) + 150,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: 'Main Store'
    });
  });

  // Accessories - Bags
  const bags = [
    'Tote Bag', 'Backpack', 'Crossbody Bag', 'Shoulder Bag',
    'Clutch', 'Messenger Bag', 'Handbag', 'Duffel Bag'
  ];
  bags.forEach(name => {
    items.push({
      id: String(id++),
      name,
      category: 'Accessories',
      
      targetCustomer: 'Unisex',
      subcategory: 'Bags',
      size: 'One Size',
      condition: ['Excellent', 'Good', 'Fair'][Math.floor(Math.random() * 3)] as any,
      quantity: Math.floor(Math.random() * 4) + 1,
      price: Math.floor(Math.random() * 500) + 200,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: ['Main Store', 'Warehouse'][Math.floor(Math.random() * 2)]
    });
  });

  // Accessories - Hats
  const hats = [
    'Baseball Cap', 'Beanie', 'Bucket Hat', 'Fedora', 'Sun Hat', 'Snapback'
  ];
  hats.forEach(name => {
    items.push({
      id: String(id++),
      name,
      category: 'Accessories',
      
      targetCustomer: 'Unisex',
      subcategory: 'Hats',
      size: 'One Size',
      condition: ['Excellent', 'Good'][Math.floor(Math.random() * 2)] as any,
      quantity: Math.floor(Math.random() * 6) + 2,
      price: Math.floor(Math.random() * 200) + 100,
      dateAdded: `2026-0${Math.floor(Math.random() * 5) + 1}-${Math.floor(Math.random() * 28) + 1}`,
      location: 'Main Store'
    });
  });

  // Add a damaged item
  items.push({
    id: String(id++),
    name: 'Damaged Vintage Jacket',
    category: 'Outerwear',
    
    targetCustomer: 'Male',
    subcategory: 'Jackets',
    size: 'L',
    condition: 'Damaged',
    quantity: 1,
    price: 150,
    dateAdded: '2026-05-28',
    location: 'Warehouse'
  });

  return items;
}

export function generatePurchaseOrders(): PurchaseOrder[] {
  return [
    {
      id: '1',
      orderNumber: 'PO-2026-001',
      supplier: 'Fashion Wholesale Inc.',
      date: '2026-05-28',
      status: 'Pending',
      items: [
        { name: 'Vintage T-Shirts', quantity: 50, price: 150 },
        { name: 'Denim Jeans', quantity: 30, price: 300 }
      ],
      totalAmount: 16500
    },
    {
      id: '2',
      orderNumber: 'PO-2026-002',
      supplier: 'Thrift Suppliers Co.',
      date: '2026-05-25',
      status: 'Approved',
      items: [
        { name: 'Leather Jackets', quantity: 20, price: 500 },
        { name: 'Casual Dresses', quantity: 40, price: 250 }
      ],
      totalAmount: 20000
    },
    {
      id: '3',
      orderNumber: 'PO-2026-003',
      supplier: 'Vintage Clothing Ltd.',
      date: '2026-05-20',
      status: 'Received',
      items: [
        { name: 'Retro Sneakers', quantity: 25, price: 600 },
        { name: 'Hoodies', quantity: 35, price: 280 }
      ],
      totalAmount: 24800
    }
  ];
}

export function generateTransfers(): Transfer[] {
  return [
    {
      id: '1',
      transferNumber: 'TR-2026-001',
      fromLocation: 'Main Store',
      toLocation: 'Branch 1',
      date: '2026-06-01',
      status: 'Pending',
      items: [
        { itemId: '1', name: 'Vintage Band T-Shirt', quantity: 10 },
        { itemId: '45', name: 'Skinny Jeans', quantity: 5 }
      ],
      createdBy: 'Admin User',
      notes: 'Restocking Branch 1 with popular items'
    },
    {
      id: '2',
      transferNumber: 'TR-2026-002',
      fromLocation: 'Warehouse',
      toLocation: 'Main Store',
      date: '2026-05-30',
      status: 'In Transit',
      items: [
        { itemId: '99', name: 'Leather Jacket', quantity: 3 },
        { itemId: '100', name: 'Denim Jacket', quantity: 4 }
      ],
      createdBy: 'Admin User',
      notes: 'Seasonal stock transfer'
    },
    {
      id: '3',
      transferNumber: 'TR-2026-003',
      fromLocation: 'Branch 1',
      toLocation: 'Warehouse',
      date: '2026-05-28',
      status: 'Completed',
      items: [
        { itemId: '56', name: 'Summer Dress', quantity: 8 },
        { itemId: '115', name: 'Tote Bag', quantity: 12 }
      ],
      createdBy: 'Staff User',
      notes: 'End of season transfer'
    }
  ];
}

export function generateAdjustments(): Adjustment[] {
  return [
    {
      id: '1',
      adjustmentNumber: 'ADJ-2026-001',
      date: '2026-06-01',
      type: 'Damage',
      reason: 'Items damaged during display',
      items: [
        { itemId: '12', name: 'Plain White Tee', quantityChange: -3, location: 'Main Store' }
      ],
      createdBy: 'Staff User',
      status: 'Approved'
    },
    {
      id: '2',
      adjustmentNumber: 'ADJ-2026-002',
      date: '2026-05-30',
      type: 'Found',
      reason: 'Found during inventory recount',
      items: [
        { itemId: '78', name: 'Cargo Pants', quantityChange: 2, location: 'Warehouse' }
      ],
      createdBy: 'Manager User',
      status: 'Approved'
    },
    {
      id: '3',
      adjustmentNumber: 'ADJ-2026-003',
      date: '2026-05-29',
      type: 'Lost',
      reason: 'Missing items after stock check',
      items: [
        { itemId: '34', name: 'High-Waisted Jeans', quantityChange: -1, location: 'Branch 1' }
      ],
      createdBy: 'Staff User',
      status: 'Pending'
    }
  ];
}

export function generateLocations(): Location[] {
  return [
    {
      id: '1',
      name: 'Main Store',
      address: '123 Fashion Street, Manila',
      manager: 'Juan Dela Cruz',
      phone: '+63 912 345 6789',
      itemCount: 180
    },
    {
      id: '2',
      name: 'Warehouse',
      address: '456 Storage Ave, Quezon City',
      manager: 'Maria Santos',
      phone: '+63 917 234 5678',
      itemCount: 95
    },
    {
      id: '3',
      name: 'Branch 1',
      address: '789 Market Road, Makati',
      manager: 'Pedro Reyes',
      phone: '+63 915 678 9012',
      itemCount: 120
    }
  ];
}

export function generateUsers(): User[] {
  return [
    {
      id: '1',
      name: 'Admin User',
      email: 'admin@retaildemo.com',
      role: 'Admin',
      status: 'Active',
      lastLogin: '2026-06-02 09:30'
    },
    {
      id: '2',
      name: 'Juan Dela Cruz',
      email: 'juan@retaildemo.com',
      role: 'Manager',
      status: 'Active',
      lastLogin: '2026-06-01 14:20'
    },
    {
      id: '3',
      name: 'Maria Santos',
      email: 'maria@retaildemo.com',
      role: 'Manager',
      status: 'Active',
      lastLogin: '2026-06-01 16:45'
    },
    {
      id: '4',
      name: 'Pedro Reyes',
      email: 'pedro@retaildemo.com',
      role: 'Staff',
      status: 'Active',
      lastLogin: '2026-05-31 10:15'
    },
    {
      id: '5',
      name: 'Ana Garcia',
      email: 'ana@retaildemo.com',
      role: 'Staff',
      status: 'Inactive',
      lastLogin: '2026-05-15 13:00'
    }
  ];
}

export interface ProductReceived {
  id: string;
  receiptNumber: string;
  poNumber: string;
  poId?: string;
  supplier: string;
  dateReceived: string;
  receivedDate?: string;
  items: {
    name: string;
    orderedQty: number;
    receivedQty: number;
    acceptedQty: number;
    rejectedQty: number;
    category: string;
    subcategory?: string;
    size?: string;
    condition: 'Excellent' | 'Good' | 'Fair' | 'Damaged';
    inspectionNotes?: string;
    price: number;
  }[];
  receivedBy: string;
  status: 'Pending Inspection' | 'Partially Accepted' | 'Fully Accepted' | 'Completed';
  totalOrdered: number;
  totalAccepted: number;
  totalRejected: number;
}

export interface Bundle {
  id: string;
  name: string;
  items: { itemId: string; quantity: number }[];
  price: number;
  discount: number;
  dateCreated: string;
  createdBy: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Active' | 'Inactive';
  approvedBy?: string;
  approvedDate?: string;
  rejectionReason?: string;
}

export function generateProductsReceived(): ProductReceived[] {
  return [
    {
      id: '1',
      receiptNumber: 'REC-2026-001',
      poNumber: 'PO-2026-003',
      supplier: 'Vintage Clothing Ltd.',
      dateReceived: '2026-05-30',
      items: [
        {
          name: 'Retro Sneakers',
          orderedQty: 25,
          receivedQty: 25,
          acceptedQty: 24,
          rejectedQty: 1,
          category: 'Shoes',
          subcategory: 'Sneakers',
          size: '9',
          condition: 'Excellent',
          inspectionNotes: 'One pair had minor defects',
          price: 600
        },
        {
          name: 'Hoodies',
          orderedQty: 35,
          receivedQty: 35,
          acceptedQty: 35,
          rejectedQty: 0,
          category: 'Outerwear',
          subcategory: 'Hoodies & Sweaters',
          size: 'M',
          condition: 'Good',
          price: 280
        }
      ],
      receivedBy: 'Admin User',
      status: 'Fully Accepted',
      totalOrdered: 60,
      totalAccepted: 59,
      totalRejected: 1
    },
    {
      id: '2',
      receiptNumber: 'REC-2026-002',
      poNumber: 'PO-2026-001',
      supplier: 'Fashion Wholesale Inc.',
      dateReceived: '2026-05-28',
      items: [
        {
          name: 'Vintage Band Tees',
          orderedQty: 50,
          receivedQty: 40,
          acceptedQty: 38,
          rejectedQty: 2,
          category: 'Tops',
          subcategory: 'T-Shirts',
          size: 'L',
          condition: 'Good',
          inspectionNotes: 'Short delivery, 2 items damaged',
          price: 150
        },
        {
          name: 'Mom Jeans',
          orderedQty: 30,
          receivedQty: 30,
          acceptedQty: 30,
          rejectedQty: 0,
          category: 'Bottoms',
          subcategory: 'Jeans',
          size: '28',
          condition: 'Excellent',
          price: 300
        }
      ],
      receivedBy: 'Admin User',
      status: 'Partially Accepted',
      totalOrdered: 80,
      totalAccepted: 68,
      totalRejected: 2
    }
  ];
}

export function generateBundles(): Bundle[] {
  return [
    {
      id: '1',
      name: 'Summer Essentials Pack',
      items: [
        { itemId: '1', quantity: 2 },
        { itemId: '45', quantity: 1 }
      ],
      price: 800,
      discount: 15,
      dateCreated: '2026-05-20',
      createdBy: 'admin@retaildemo.com',
      status: 'Active',
      approvedBy: 'admin@retaildemo.com',
      approvedDate: '2026-05-20'
    },
    {
      id: '2',
      name: 'Complete Outfit Bundle',
      items: [
        { itemId: '12', quantity: 1 },
        { itemId: '34', quantity: 1 },
        { itemId: '67', quantity: 1 }
      ],
      price: 1500,
      discount: 20,
      dateCreated: '2026-05-15',
      createdBy: 'staff@retaildemo.com',
      status: 'Pending'
    },
    {
      id: '3',
      name: 'Winter Wardrobe Set',
      items: [
        { itemId: '23', quantity: 1 },
        { itemId: '56', quantity: 2 }
      ],
      price: 1200,
      discount: 25,
      dateCreated: '2026-05-18',
      createdBy: 'admin@retaildemo.com',
      status: 'Approved',
      approvedBy: 'admin@retaildemo.com',
      approvedDate: '2026-05-18'
    },
    {
      id: '4',
      name: 'Casual Weekend Pack',
      items: [
        { itemId: '8', quantity: 1 },
        { itemId: '15', quantity: 1 },
        { itemId: '42', quantity: 1 }
      ],
      price: 950,
      discount: 10,
      dateCreated: '2026-05-12',
      createdBy: 'admin@retaildemo.com',
      status: 'Inactive',
      approvedBy: 'admin@retaildemo.com',
      approvedDate: '2026-05-12'
    },
    {
      id: '5',
      name: 'Office Essentials Bundle',
      items: [
        { itemId: '29', quantity: 2 },
        { itemId: '71', quantity: 1 }
      ],
      price: 1800,
      discount: 18,
      dateCreated: '2026-05-10',
      createdBy: 'staff@retaildemo.com',
      status: 'Rejected',
      rejectionReason: 'Items no longer available in required quantities'
    },
    {
      id: '6',
      name: 'Gym & Activewear Set',
      items: [
        { itemId: '5', quantity: 3 },
        { itemId: '38', quantity: 1 }
      ],
      price: 1100,
      discount: 22,
      dateCreated: '2026-05-25',
      createdBy: 'admin@retaildemo.com',
      status: 'Active',
      approvedBy: 'admin@retaildemo.com',
      approvedDate: '2026-05-25'
    },
    {
      id: '7',
      name: 'Date Night Special',
      items: [
        { itemId: '19', quantity: 1 },
        { itemId: '52', quantity: 1 },
        { itemId: '88', quantity: 1 }
      ],
      price: 2200,
      discount: 30,
      dateCreated: '2026-05-22',
      createdBy: 'staff@retaildemo.com',
      status: 'Pending'
    },
    {
      id: '8',
      name: 'Back to School Bundle',
      items: [
        { itemId: '11', quantity: 2 },
        { itemId: '33', quantity: 2 }
      ],
      price: 1350,
      discount: 20,
      dateCreated: '2026-05-08',
      createdBy: 'admin@retaildemo.com',
      status: 'Approved',
      approvedBy: 'admin@retaildemo.com',
      approvedDate: '2026-05-08'
    }
  ];
}

export function generateSales(): Sale[] {
  const sales: Sale[] = [];
  const cashiers = ['Maria Santos', 'Juan Dela Cruz', 'Anna Reyes'];
  const locations = ['Main Store', 'Branch 1', 'Warehouse'];
  const paymentMethods: ('Cash' | 'GCash' | 'Card' | 'Bank Transfer')[] = ['Cash', 'GCash', 'Card', 'Bank Transfer'];
  const itemNames = ['Vintage Band T-Shirt', 'Skinny Jeans', 'Denim Jacket', 'Sneakers', 'Leather Bag'];
  const categories = ['Tops', 'Bottoms', 'Outerwear', 'Shoes', 'Accessories'];

  // Generate 50 sample sales
  for (let i = 0; i < 50; i++) {
    const numItems = Math.floor(Math.random() * 3) + 1;
    const items = [];
    let subtotal = 0;

    for (let j = 0; j < numItems; j++) {
      const quantity = Math.floor(Math.random() * 2) + 1;
      const unitPrice = Math.floor(Math.random() * 500) + 100;
      const totalPrice = quantity * unitPrice;
      
      items.push({
        itemId: String(Math.floor(Math.random() * 100) + 1),
        name: itemNames[Math.floor(Math.random() * itemNames.length)],
        category: categories[Math.floor(Math.random() * categories.length)],
        quantity,
        unitPrice,
        totalPrice
      });
      
      subtotal += totalPrice;
    }

    const discount = Math.random() > 0.7 ? Math.floor(subtotal * 0.1) : 0;
    const tax = 0;
    const total = subtotal - discount + tax;
    const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
    const amountPaid = paymentMethod === 'Cash' ? Math.ceil(total / 100) * 100 : total;
    const change = amountPaid - total;

    const daysAgo = Math.floor(Math.random() * 30);
    const saleDate = new Date();
    saleDate.setDate(saleDate.getDate() - daysAgo);
    const dateStr = saleDate.toISOString().split('T')[0];
    const timeStr = `${String(Math.floor(Math.random() * 12) + 9).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;

    sales.push({
      id: String(i + 1),
      transactionNumber: `TXN-2026-${String(i + 1).padStart(4, '0')}`,
      date: dateStr,
      time: timeStr,
      cashier: cashiers[Math.floor(Math.random() * cashiers.length)],
      location: locations[Math.floor(Math.random() * locations.length)],
      items,
      subtotal,
      discount,
      tax,
      total,
      paymentMethod,
      amountPaid,
      change,
      customer: Math.random() > 0.7 ? `Customer ${i + 1}` : undefined,
      status: Math.random() > 0.95 ? 'Refunded' : 'Completed',
      refundReason: Math.random() > 0.95 ? 'Defective item' : undefined
    });
  }

  return sales.sort((a, b) => new Date(b.date + ' ' + b.time).getTime() - new Date(a.date + ' ' + a.time).getTime());
}
