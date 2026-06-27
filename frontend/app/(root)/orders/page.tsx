"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useOrdersStore } from "@/store/ordersStore";
import { useUser } from "@/hooks/useUser";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CustomButton from "@/components/custom/CustomButton";

const OrdersPage = () => {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const { orders, pagination, loading, error, fetchOrders } = useOrdersStore();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  // Authentication check
  useEffect(() => {
    if (!userLoading && !user) {
      router.push("/auth/login");
      return;
    }
  }, [user, userLoading, router]);

  useEffect(() => {
    if (user) {
      fetchOrders({ status: status || undefined, page, limit: 10 }).catch(
        () => {}
      );
    }
  }, [fetchOrders, status, page, user]);

  const totalPages = useMemo(() => pagination?.pages ?? 1, [pagination]);
  const safeOrders = Array.isArray(orders) ? orders : [];

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

  // Redirect if not authenticated
  if (!user) {
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-black mb-6">My Orders</h1>

      <div className="flex items-center gap-3 mb-6">
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
      </div>

      {error && <div className="text-red-500 mb-4">{error}</div>}
      {loading && <div className="text-black">Loading...</div>}
      {!loading && safeOrders.length === 0 && (
        <div className="text-black">No orders found.</div>
      )}

      <div className="space-y-4">
        {safeOrders.map((o) => {
          const itemsCount = Array.isArray(o.orderItems)
            ? o.orderItems.length
            : 0;
          const totalVal = Number(o.total || 0);
          const idShort = typeof o.id === "string" ? o.id.slice(0, 8) : "";
          return (
            <Link
              key={o.id}
              href={`/orders/${o.id}`}
              className="block border border-gray-200 rounded p-4 hover:shadow"
            >
              <div className="flex justify-between">
                <div className="text-black font-semibold">Order #{idShort}</div>
                <div className="text-gray-700">
                  {o.status} / {o.paymentStatus}
                </div>
              </div>
              <div className="text-black mt-2">
                Total: ${totalVal.toFixed(2)}
              </div>
              <div className="text-gray-600 mt-2">Items: {itemsCount}</div>
            </Link>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 mt-6">
          <CustomButton
            title="Prev"
            className="px-3 py-1 rounded border border-gray-300 text-black disabled:opacity-50 bg-white"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          />
          <span className="text-black">
            Page {page} of {totalPages}
          </span>
          <CustomButton
            title="Next"
            className="px-3 py-1 rounded border border-gray-300 text-black disabled:opacity-50 bg-white"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          />
        </div>
      )}
    </div>
  );
};

export default OrdersPage;
