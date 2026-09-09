export type ProductDetail = {
  id: string;
  brand: string;
  name: string;
  category: string;
  price: string;
  priceValue: number;
  compareAtPrice?: string;
  compareAtPriceValue?: number;
  discount?: string;
  rating: string;
  ratingCount: string;
  badge: string;
  description: string;
  sizes: string[];
  images: string[];
  reviewBars: number[];
};

export const PRODUCT_DETAILS: Record<string, ProductDetail> = {
  '1': {
    id: '1',
    brand: 'Fyll Optical',
    name: 'Muna Crystal',
    category: 'Optical',
    price: '₦74,500',
    priceValue: 74500,
    compareAtPrice: '₦82,000',
    compareAtPriceValue: 82000,
    discount: '9% off',
    rating: '4.8',
    ratingCount: '184 ratings',
    badge: 'Most loved this month',
    description:
      'A clean crystal optical frame with a light everyday feel. Built for comfortable all-day wear with a refined silhouette that works for both work and casual styling.',
    sizes: ['47', '49', '51'],
    images: [
      'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1574258495973-f010dfbb5371?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1591076482161-42ce6da69f67?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=800&q=80',
    ],
    reviewBars: [92, 78, 34, 16, 8],
  },
  '2': {
    id: '2',
    brand: 'Fyll Studio',
    name: 'Regina Tortoise',
    category: 'Sunglasses',
    price: '₦81,000',
    priceValue: 81000,
    compareAtPrice: '₦90,000',
    compareAtPriceValue: 90000,
    discount: '10% off',
    rating: '4.9',
    ratingCount: '129 ratings',
    badge: 'Best seller this season',
    description:
      'A warm tortoise sunglass frame with soft contrast and an editorial shape. Designed to feel polished without looking heavy, with tint depth that works well outdoors.',
    sizes: ['Small', 'Medium', 'Wide'],
    images: [
      'https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=800&q=80',
    ],
    reviewBars: [88, 74, 28, 12, 6],
  },
  '3': {
    id: '3',
    brand: 'Fyll Objects',
    name: 'Lagos Clip Case',
    category: 'Accessories',
    price: '₦18,500',
    priceValue: 18500,
    compareAtPrice: '₦22,000',
    compareAtPriceValue: 22000,
    discount: '16% off',
    rating: '4.7',
    ratingCount: '92 ratings',
    badge: 'Easy add-on item',
    description:
      'A compact protective clip case for glasses and small essentials. Soft-touch exterior, structured body, and a simple clip system for bags and travel.',
    sizes: ['Classic', 'Large'],
    images: [
      'https://images.unsplash.com/photo-1516574187841-cb9cc2ca948b?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1521223890158-f9f7c3d5d504?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=800&q=80',
    ],
    reviewBars: [80, 62, 30, 14, 5],
  },
  '4': {
    id: '4',
    brand: 'Fyll Optical',
    name: 'Bold Noir',
    category: 'Optical',
    price: '₦69,000',
    priceValue: 69000,
    compareAtPrice: '₦76,000',
    compareAtPriceValue: 76000,
    discount: '9% off',
    rating: '4.6',
    ratingCount: '140 ratings',
    badge: 'New drop',
    description:
      'A deeper black frame with a defined front and a slightly wider stance. Good for customers who want a stronger visual line without going oversized.',
    sizes: ['48', '50', '52'],
    images: [
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1591076482161-42ce6da69f67?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1574258495973-f010dfbb5371?auto=format&fit=crop&w=800&q=80',
    ],
    reviewBars: [76, 64, 26, 10, 4],
  },
  '5': {
    id: '5',
    brand: 'Fyll Studio',
    name: 'Sam Grey',
    category: 'New Drops',
    price: '₦77,500',
    priceValue: 77500,
    compareAtPrice: '₦86,000',
    compareAtPriceValue: 86000,
    discount: '10% off',
    rating: '4.8',
    ratingCount: '166 ratings',
    badge: 'Fresh release',
    description:
      'A cool grey frame with a balanced bridge and clean temple line. Built to look soft and modern while still feeling elevated enough for dress styling.',
    sizes: ['49', '51', '53'],
    images: [
      'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
    ],
    reviewBars: [90, 70, 24, 9, 3],
  },
  '6': {
    id: '6',
    brand: 'Fyll Studio',
    name: 'Abdul Silver',
    category: 'Sunglasses',
    price: '₦72,000',
    priceValue: 72000,
    compareAtPrice: '₦79,000',
    compareAtPriceValue: 79000,
    discount: '8% off',
    rating: '4.7',
    ratingCount: '118 ratings',
    badge: 'Easy summer pick',
    description:
      'A silver-toned sunglass frame with a lighter visual weight and a crisp metallic finish. Designed for customers who want clarity and brightness without flash.',
    sizes: ['Narrow', 'Standard', 'Wide'],
    images: [
      'https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=80',
    ],
    reviewBars: [82, 68, 22, 8, 2],
  },
  '7': {
    id: '7',
    brand: 'Fyll Optical',
    name: 'Cairo Smoke',
    category: 'Optical',
    price: '₦71,500',
    priceValue: 71500,
    compareAtPrice: '₦78,000',
    compareAtPriceValue: 78000,
    discount: '8% off',
    rating: '4.7',
    ratingCount: '103 ratings',
    badge: 'Quiet bestseller',
    description:
      'A softened smoke optical frame with clean edges and a light visual profile. Easy to style and comfortable for daily wear.',
    sizes: ['48', '50', '52'],
    images: [
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1591076482161-42ce6da69f67?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1574258495973-f010dfbb5371?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=80',
    ],
    reviewBars: [84, 66, 23, 7, 2],
  },
  '8': {
    id: '8',
    brand: 'Fyll Studio',
    name: 'Casita Sand',
    category: 'Sunglasses',
    price: '₦79,000',
    priceValue: 79000,
    compareAtPrice: '₦87,000',
    compareAtPriceValue: 87000,
    discount: '9% off',
    rating: '4.8',
    ratingCount: '111 ratings',
    badge: 'Warm weather edit',
    description:
      'A sand-toned sunglass frame with a softer finish and balanced proportions, made for bright daytime wear.',
    sizes: ['Small', 'Medium', 'Wide'],
    images: [
      'https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=80',
    ],
    reviewBars: [87, 71, 21, 6, 2],
  },
};

export const STORE_BRAND = {
  name: 'Mint Shop',
  avatarText: 'M',
  rating: '4.8',
  reviewCount: '25.6K',
};

export function getStorefrontProduct(id: string) {
  return PRODUCT_DETAILS[id];
}
