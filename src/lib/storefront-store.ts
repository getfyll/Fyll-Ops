import { create } from 'zustand';

type CartItem = {
  productId: string;
  quantity: number;
  selectedSize?: string;
};

export type StorefrontPaymentReceipt = {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
};

export type StorefrontPendingOrderItem = {
  productId: string;
  productName: string;
  image: string;
  quantity: number;
  selectedSize?: string;
  unitPrice: number;
  lineTotal: number;
};

export type StorefrontPendingOrder = {
  id: string;
  reference: string;
  status: 'payment_pending_verification';
  createdAt: string;
  expiresAt: string;
  subtotal: number;
  shippingCost: number;
  total: number;
  shippingOptionId: string;
  shippingOptionName: string;
  customer: {
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    address1: string;
    address2: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    updatesOptIn: boolean;
  };
  receipt: StorefrontPaymentReceipt;
  items: StorefrontPendingOrderItem[];
};

type StorefrontStore = {
  cartItems: Record<string, CartItem>;
  cartCount: number;
  savedProductIds: string[];
  pendingOrders: StorefrontPendingOrder[];
  addToCart: (productId: string, quantity?: number, selectedSize?: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  removeCartItem: (productId: string) => void;
  moveCartItemToSaved: (productId: string) => void;
  toggleSavedProduct: (productId: string) => void;
  submitPendingOrder: (order: StorefrontPendingOrder) => void;
};

const sumCartCount = (cartItems: Record<string, CartItem>) =>
  Object.values(cartItems).reduce((sum, item) => sum + item.quantity, 0);

export const useStorefrontStore = create<StorefrontStore>((set) => ({
  cartItems: {},
  cartCount: 0,
  savedProductIds: [],
  pendingOrders: [],
  addToCart: (productId, quantity = 1, selectedSize) =>
    set((state) => {
      const existing = state.cartItems[productId];
      const nextQuantity = (existing?.quantity ?? 0) + quantity;
      return {
        cartItems: {
          ...state.cartItems,
          [productId]: {
            productId,
            quantity: nextQuantity,
            selectedSize,
          },
        },
        cartCount: sumCartCount({
          ...state.cartItems,
          [productId]: {
            productId,
            quantity: nextQuantity,
            selectedSize,
          },
        }),
      };
    }),
  updateCartQuantity: (productId, quantity) =>
    set((state) => {
      if (!state.cartItems[productId]) {
        return state;
      }

      if (quantity <= 0) {
        const remainingCartItems = { ...state.cartItems };
        delete remainingCartItems[productId];
        return {
          cartItems: remainingCartItems,
          cartCount: sumCartCount(remainingCartItems),
        };
      }

      const nextCartItems = {
        ...state.cartItems,
        [productId]: {
          ...state.cartItems[productId],
          quantity,
        },
      };

      return {
        cartItems: nextCartItems,
        cartCount: sumCartCount(nextCartItems),
      };
    }),
  removeCartItem: (productId) =>
    set((state) => {
      if (!state.cartItems[productId]) {
        return state;
      }

      const remainingCartItems = { ...state.cartItems };
      delete remainingCartItems[productId];
      return {
        cartItems: remainingCartItems,
        cartCount: sumCartCount(remainingCartItems),
      };
    }),
  moveCartItemToSaved: (productId) =>
    set((state) => {
      if (!state.cartItems[productId]) {
        return state;
      }

      const remainingCartItems = { ...state.cartItems };
      delete remainingCartItems[productId];
      const savedProductIds = state.savedProductIds.includes(productId)
        ? state.savedProductIds
        : [...state.savedProductIds, productId];

      return {
        cartItems: remainingCartItems,
        cartCount: sumCartCount(remainingCartItems),
        savedProductIds,
      };
    }),
  toggleSavedProduct: (productId) =>
    set((state) => {
      const savedProductIds = state.savedProductIds.includes(productId)
        ? state.savedProductIds.filter((id) => id !== productId)
        : [...state.savedProductIds, productId];
      return { savedProductIds };
    }),
  submitPendingOrder: (order) =>
    set((state) => {
      const existingOrderIndex = state.pendingOrders.findIndex(
        (pendingOrder) => pendingOrder.reference === order.reference
      );

      if (existingOrderIndex === -1) {
        return {
          pendingOrders: [order, ...state.pendingOrders],
        };
      }

      const pendingOrders = [...state.pendingOrders];
      pendingOrders[existingOrderIndex] = order;
      return { pendingOrders };
    }),
}));
