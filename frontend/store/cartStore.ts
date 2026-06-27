import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

export type CartItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  imageUrl?: string;
  sku?: string;
};

type CartState = {
  items: CartItem[];
  loading: boolean;
  error: string | null;
  // Actions
  addItem: (item: Omit<CartItem, 'id'>) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  syncWithBackend: () => Promise<void>;
  loadFromBackend: () => Promise<void>;
  // Computed
  getTotal: () => number;
  getItemCount: () => number;
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      loading: false,
      error: null,

      addItem: async (newItem) => {
        set({ loading: true, error: null });
        try {
          const API_URL = process.env.NEXT_PUBLIC_API_URL;
          const { items } = get();
          
          // Check if item already exists
          const existingItem = items.find(item => item.productId === newItem.productId);
          
          if (existingItem) {
            // Update quantity
            const updatedItems = items.map(item =>
              item.productId === newItem.productId
                ? { ...item, quantity: item.quantity + newItem.quantity }
                : item
            );
            set({ items: updatedItems });
          } else {
            // Add new item
            const itemWithId = { ...newItem, id: `${newItem.productId}-${Date.now()}` };
            set({ items: [...items, itemWithId] });
          }

          // Try to sync with backend using the correct endpoint
          try {
            const cartData = {
              productId: newItem.productId,
              quantity: existingItem ? existingItem.quantity + newItem.quantity : newItem.quantity,
              price: newItem.price
            };
            await axios.post(`${API_URL}/cart/add`, cartData, { withCredentials: true });
          } catch (backendError) {
            console.warn('Failed to sync with backend, using localStorage only:', backendError);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to add item to cart';
          set({ error: message });
        } finally {
          set({ loading: false });
        }
      },

      updateQuantity: async (itemId, quantity) => {
        set({ loading: true, error: null });
        try {
          const { items } = get();
          
          if (quantity <= 0) {
            // Remove item if quantity is 0 or negative
            await get().removeItem(itemId);
            return;
          }

          const updatedItems = items.map(item =>
            item.id === itemId ? { ...item, quantity } : item
          );
          set({ items: updatedItems });

          // Try to sync with backend using the correct endpoint
          try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL;
            const item = items.find(item => item.id === itemId);
            if (item) {
              await axios.put(`${API_URL}/cart/${itemId}`, { quantity }, { withCredentials: true });
            }
          } catch (backendError) {
            console.warn('Failed to sync with backend, using localStorage only:', backendError);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update quantity';
          set({ error: message });
        } finally {
          set({ loading: false });
        }
      },

      removeItem: async (itemId) => {
        set({ loading: true, error: null });
        try {
          const { items } = get();
          const updatedItems = items.filter(item => item.id !== itemId);
          set({ items: updatedItems });

          // Try to sync with backend using the correct endpoint
          try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL;
            await axios.delete(`${API_URL}/cart/${itemId}`, { withCredentials: true });
          } catch (backendError) {
            console.warn('Failed to sync with backend, using localStorage only:', backendError);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to remove item';
          set({ error: message });
        } finally {
          set({ loading: false });
        }
      },

      clearCart: async () => {
        set({ loading: true, error: null });
        try {
          set({ items: [] });
          
          // Try to clear from backend, but don't fail if it's not available
          try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL;
            await axios.delete(`${API_URL}/cart`, { withCredentials: true });
          } catch (backendError) {
            console.warn('Cart backend not available for clearing:', backendError);
            // Cart is already cleared locally, so this is fine
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to clear cart';
          set({ error: message });
        } finally {
          set({ loading: false });
        }
      },

      syncWithBackend: async () => {
        try {
          const API_URL = process.env.NEXT_PUBLIC_API_URL;
          const { items } = get();
          
          // Sync each item individually using the correct endpoint
          for (const item of items) {
            const cartData = {
              productId: item.productId,
              quantity: item.quantity,
              price: item.price
            };
            await axios.post(`${API_URL}/cart/add`, cartData, { withCredentials: true });
          }
        } catch (error) {
          console.warn('Cart sync failed - using localStorage only:', error);
          // Cart will work with localStorage only if backend is not available
        }
      },

      loadFromBackend: async () => {
        set({ loading: true, error: null });
        try {
          const API_URL = process.env.NEXT_PUBLIC_API_URL;
          const { data } = await axios.get(`${API_URL}/cart/cart`, { withCredentials: true });
          
          if (data && Array.isArray(data.items)) {
            const backendItems = data.items.map((item: unknown) => {
              const typedItem = item as {
                id?: string;
                productId?: string;
                productName?: string;
                product?: { name?: string; imageUrl?: string };
                quantity?: number;
                price?: number;
                imageUrl?: string;
                sku?: string;
              };
              return {
                id: typedItem.id || `${typedItem.productId}-${Date.now()}`,
                productId: typedItem.productId || '',
                productName: typedItem.productName || typedItem.product?.name || 'Unknown Product',
                quantity: typedItem.quantity || 1,
                price: typedItem.price || 0,
                imageUrl: typedItem.imageUrl || typedItem.product?.imageUrl,
                sku: typedItem.sku
              };
            });
            set({ items: backendItems });
          }
        } catch (error) {
          console.warn('Cart backend not available - using localStorage only:', error);
          // Cart will work with localStorage only if backend is not available
        } finally {
          set({ loading: false });
        }
      },

      getTotal: () => {
        const { items } = get();
        return items.reduce((total, item) => total + (item.price * item.quantity), 0);
      },

      getItemCount: () => {
        const { items } = get();
        return items.reduce((count, item) => count + item.quantity, 0);
      },
    }),
    {
      name: 'cart-storage',
      partialize: (state) => ({ items: state.items }),
    }
  )
);
