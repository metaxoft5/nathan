"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useUser } from "@/hooks/useUser";

type Order = {
  id: string;
  userId: string;
  status: string;
  paymentStatus: string;
  total: number;
  user?: { id?: string; name?: string | null; email?: string | null };
};

type Pagination = { pages: number };

const AdminOrdersPage = () => {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [adminPagination, setAdminPagination] = useState<Pagination | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [debouncedStatus, setDebouncedStatus] = useState("");
  const [debouncedPaymentStatus, setDebouncedPaymentStatus] = useState("");

  useEffect(() => {
    if (!userLoading && (!user || user.role !== "admin")) {
      router.replace("/");
    }
  }, [user, userLoading, router]);

  // Debounce status/paymentStatus changes to reduce requests
  useEffect(() => {
    const t = setTimeout(() => setDebouncedStatus(status), 300);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPaymentStatus(paymentStatus), 300);
    return () => clearTimeout(t);
  }, [paymentStatus]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axios.get<{
          orders: Order[];
          pagination?: Pagination;
        }>(`${API_URL}/orders/admin/all`, {
          withCredentials: true,
          signal: controller.signal,
          params: {
            status: debouncedStatus || undefined,
            paymentStatus: debouncedPaymentStatus || undefined,
            page,
            limit,
          },
        });
        setAdminOrders(Array.isArray(data.orders) ? data.orders : []);
        setAdminPagination(data.pagination ?? { pages: 1 });
      } catch (e) {
        if (axios.isCancel(e)) return;
        const message =
          (e as { message?: string })?.message || "Failed to load orders";
        setError(message);
        setAdminOrders([]);
        setAdminPagination({ pages: 1 });
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [user, debouncedStatus, debouncedPaymentStatus, page, limit]);

  const adminUpdateStatus = async (
    id: string,
    payload: { status?: string; paymentStatus?: string }
  ) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    try {
      await axios.put(`${API_URL}/orders/${id}/status`, payload, {
        withCredentials: true,
      });
      setAdminOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...payload } : o))
      );
    } catch (e) {
      const message =
        (e as { message?: string })?.message || "Failed to update order";
      setError(message);
    }
  };

  const totalPages = useMemo(
    () => adminPagination?.pages ?? 1,
    [adminPagination]
  );

  // Show loading while checking authentication
  if (userLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF5D39] mx-auto mb-4"></div>
          <p className="text-black text-lg">Loading orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-black mb-6">Admin Orders</h1>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="border border-gray-300 rounded px-3 py-2 text-black bg-white"
        >
          <option value="">All statuses</option>
          <option value="pending">pending</option>
          <option value="confirmed">confirmed</option>
          <option value="shipped">shipped</option>
          <option value="delivered">delivered</option>
          <option value="cancelled">cancelled</option>
        </select>
        <select
          value={paymentStatus}
          onChange={(e) => {
            setPage(1);
            setPaymentStatus(e.target.value);
          }}
          className="border border-gray-300 rounded px-3 py-2 text-black bg-white"
        >
          <option value="">All payments</option>
          <option value="pending">pending</option>
          <option value="paid">paid</option>
          <option value="failed">failed</option>
        </select>
        <select
          value={limit}
          onChange={(e) => {
            setPage(1);
            setLimit(parseInt(e.target.value) || 10);
          }}
          className="border border-gray-300 rounded px-3 py-2 text-black bg-white"
        >
          <option value={10}>10 per page</option>
          <option value={20}>20 per page</option>
          <option value={50}>50 per page</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-red-700">
          {error}
        </div>
      )}
      {loading && (
        <div className="w-full">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded" />
            <div className="h-4 bg-gray-200 rounded" />
            <div className="h-4 bg-gray-200 rounded" />
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-gray-200 rounded">
        <table className="min-w-full text-left">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              <th className="px-4 py-2 text-black">Order</th>
              <th className="px-4 py-2 text-black">User</th>
              <th className="px-4 py-2 text-black">Status</th>
              <th className="px-4 py-2 text-black">Payment</th>
              <th className="px-4 py-2 text-black">Total</th>
              <th className="px-4 py-2 text-black">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {adminOrders.map((o, idx) => (
              <tr
                key={o.id}
                className={idx % 2 === 0 ? "bg-white" : "bg-gray-50 hover:bg-gray-100"}
              >
                <td className="px-4 py-2 text-black">{o.id.slice(0, 8)}</td>
                <td className="px-4 py-2 text-black">
                  {o.user?.name || o.user?.email || o.userId}
                </td>
                <td className="px-4 py-2">
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${
                    o.status === "pending"
                      ? "bg-yellow-100 text-yellow-800"
                      : o.status === "confirmed"
                      ? "bg-blue-100 text-blue-800"
                      : o.status === "shipped"
                      ? "bg-indigo-100 text-indigo-800"
                      : o.status === "delivered"
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-200 text-gray-800"
                  }`}>
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span className={`text-xs font-semibold px-2 py-1 rounded ${
                    o.paymentStatus === "pending"
                      ? "bg-yellow-100 text-yellow-800"
                      : o.paymentStatus === "paid"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}>
                    {o.paymentStatus}
                  </span>
                </td>
                <td className="px-4 py-2 text-black">${o.total.toFixed(2)}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <select
                      defaultValue={o.status}
                      onChange={(e) =>
                        adminUpdateStatus(o.id, { status: e.target.value })
                      }
                      className="border border-gray-300 rounded px-2 py-1 text-black bg-white"
                    >
                      <option value="pending">pending</option>
                      <option value="confirmed">confirmed</option>
                      <option value="shipped">shipped</option>
                      <option value="delivered">delivered</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                    <select
                      defaultValue={o.paymentStatus}
                      onChange={(e) =>
                        adminUpdateStatus(o.id, {
                          paymentStatus: e.target.value,
                        })
                      }
                      className="border border-gray-300 rounded px-2 py-1 text-black bg-white"
                    >
                      <option value="pending">pending</option>
                      <option value="paid">paid</option>
                      <option value="failed">failed</option>
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 mt-6">
          <button
            className="px-3 py-1 rounded border border-gray-300 text-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <span className="text-black">
            Page {page} of {totalPages}
          </span>
          <button
            className="px-3 py-1 rounded border border-gray-300 text-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminOrdersPage;
