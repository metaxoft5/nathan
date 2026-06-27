import { create } from 'zustand';
import axios from 'axios';

export type OrderItem = {
  id?: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  imageUrl?: string;
};

export type Order = {
  id?: string;
  userId?: string;
  orderItems?: OrderItem[];
  items?: Array<{
    productId: string;
    quantity: number;
  }>;
  total: number;
  status?: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  paymentStatus?: 'pending' | 'paid' | 'failed';
  shippingAddress?: string;
  orderNotes?: string;
  createdAt?: string;
  updatedAt?: string;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

type OrdersState = {
  orders: Order[];
  order: Order | null;
  pagination: Pagination | null;
  loading: boolean;
  error: string | null;
  fetchOrders: (params: { status?: string; page?: number; limit?: number }) => Promise<void>;
  fetchOrder: (id: string) => Promise<Order | null>;
  fetchOrderById: (id: string) => Promise<void>;
  createOrder: (orderData: Partial<Order>) => Promise<Order | null>;
  updateOrderStatus: (id: string, status: Order['status']) => Promise<void>;
  clearOrder: () => void;
};

export const useOrdersStore = create<OrdersState>((set, get) => ({
  orders: [],
  order: null,
  pagination: null,
  loading: false,
  error: null,

  fetchOrders: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const queryParams = new URLSearchParams();
      
      if (params.status) queryParams.append('status', params.status);
      if (params.page) queryParams.append('page', params.page.toString());
      if (params.limit) queryParams.append('limit', params.limit.toString());

      const { data } = await axios.get<{ orders: Order[]; pagination: Pagination }>(
        `${API_URL}/orders?${queryParams.toString()}`,
        { withCredentials: true }
      );

      set({ 
        orders: data.orders || [], 
        pagination: data.pagination || null,
        loading: false 
      });
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch orders';
      set({ error: message, loading: false, orders: [] });
    }
  },

  fetchOrder: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const { data } = await axios.get<Order>(
        `${API_URL}/orders/${id}`,
        { withCredentials: true }
      );
      set({ loading: false });
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch order';
      set({ error: message, loading: false });
      return null;
    }
  },

  createOrder: async (orderData: Partial<Order>) => {
    set({ loading: true, error: null });
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      
      const { data } = await axios.post<Order>(
        `${API_URL}/orders`,
        orderData,
        { withCredentials: true }
      );
      
      // Add the new order to the local state
      const { orders } = get();
      set({ 
        orders: [data, ...orders], // Add new order at the beginning
        loading: false 
      });
      
      
      return data;
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string }; status?: number } };
      const message = axiosError.response?.data?.message || (error instanceof Error ? error.message : 'Failed to create order');
      set({ error: message, loading: false });
      return null;
    }
  },

  updateOrderStatus: async (id: string, status: Order['status']) => {
    set({ loading: true, error: null });
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      await axios.put(
        `${API_URL}/orders/${id}/status`,
        { status },
        { withCredentials: true }
      );
      
      // Update the order in the local state
      const { orders } = get();
      const updatedOrders = orders.map(order => 
        order.id === id ? { ...order, status } : order
      );
      set({ orders: updatedOrders, loading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update order status';
      set({ error: message, loading: false });
    }
  },

  fetchOrderById: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const { data } = await axios.get<Order>(
        `${API_URL}/orders/${id}`,
        { withCredentials: true }
      );
      set({ order: data, loading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch order';
      set({ error: message, loading: false, order: null });
    }
  },

  clearOrder: () => {
    set({ order: null, error: null });
  },
}));
