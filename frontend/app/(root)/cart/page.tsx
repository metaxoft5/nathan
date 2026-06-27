"use client";
import React, { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/store/cartStore";
import { useOrdersStore } from "@/store/ordersStore";
import { useUser } from "@/hooks/useUser";
import VerificationGuard from "@/components/auth/VerificationGuard";
import CustomButton from "@/components/custom/CustomButton";

// Type definitions
interface Product {
  id: string;
  name: string;
  price: number;
  category?: string;
  imageUrl?: string;
  sku?: string;
  isActive?: boolean;
}

const CartPage = () => {
  const { user, loading: userLoading } = useUser();
  const {
    items,
    loading,
    error,
    updateQuantity,
    removeItem,
    clearCart,
    getTotal,
    loadFromBackend,
    addItem,
  } = useCartStore();

  const { createOrder } = useOrdersStore();
  const router = useRouter();
  const [orderLoading, setOrderLoading] = useState<boolean>(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [clearCartLoading, setClearCartLoading] = useState<boolean>(false);
  const [notes, setNotes] = useState("");
  const [shipping] = useState({
    name: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    postal: "",
    country: "US",
  });
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState<boolean>(false);

  const fetchRecommendedProducts = useCallback(async () => {
    setRecommendedLoading(true);
    try {
      const response = await fetch("/api/products", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const products = Array.isArray(data) ? data : data.products || [];

        // Filter out products already in cart
        const cartProductIds = items.map((item) => item.productId);
        const availableProducts = products.filter(
          (product: Product) =>
            product.id &&
            !cartProductIds.includes(product.id) &&
            product.isActive !== false
        );

        // Always show recommendations - if we have available products, show them
        // If no available products, show all products (user can still browse)
        let productsToShow = availableProducts;

        // If no products available (all in cart), show all products for browsing
        if (availableProducts.length === 0 && products.length > 0) {
          productsToShow = products.filter(
            (product: Product) => product.id && product.isActive !== false
          );
        }

        // Randomly select 2 products
        const shuffled = productsToShow.sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 2);

        setRecommendedProducts(selected);
      }
    } catch (error) {
      console.error("Failed to fetch recommended products:", error);
    } finally {
      setRecommendedLoading(false);
    }
  }, [items]);

  // Authentication check
  useEffect(() => {
    if (!userLoading && !user) {
      router.push("/auth/login");
      return;
    }
  }, [user, userLoading, router]);

  useEffect(() => {
    if (user) {
      loadFromBackend();
      fetchRecommendedProducts();
    }
  }, [loadFromBackend, fetchRecommendedProducts, user]);

  // Show loading while checking authentication
  if (userLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF5D39] mx-auto mb-4"></div>
          <p className="text-black text-lg">Loading cart...</p>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated
  if (!user) {
    return null;
  }

  const handleQuantity = async (itemId: string, quantity: number) => {
    await updateQuantity(itemId, quantity);
  };

  const handleRemoveItem = async (itemId: string) => {
    await removeItem(itemId);
  };

  const handleClearCart = async () => {
    setClearCartLoading(true);
    try {
      await clearCart();
    } finally {
      setClearCartLoading(false);
    }
  };

  const handleAddRecommendedProduct = async (product: Product) => {
    try {
      await addItem({
        productId: product.id,
        productName: product.name,
        quantity: 1,
        price: product.price,
        imageUrl: product.imageUrl,
        sku: product.sku,
      });
      // Refresh recommended products to show new ones
      fetchRecommendedProducts();
    } catch (error) {
      console.error("Failed to add recommended product:", error);
    }
  };

  const handleViewAllProducts = () => {
    router.push("/shop");
  };

  const checkout = async () => {
    setOrderError(null);
    try {
      setOrderLoading(true);

      if (items.length === 0) {
        throw new Error("Your cart is empty. Add some products to continue.");
      }

      // Enhanced product verification with detailed logging
      try {
        const productIds = items.map((item) => item.productId);
        // Check if products exist by fetching them from backend
        const response = await fetch("/api/products", {
          credentials: "include",
        });

        if (response.ok) {
          const products = await response.json();

          const availableProductIds = Array.isArray(products)
            ? products.map((p: { id: string }) => p.id)
            : products.products?.map((p: { id: string }) => p.id) || [];

          const missingProducts = productIds.filter(
            (id) => !availableProductIds.includes(id)
          );
          if (missingProducts.length > 0) {
            throw new Error(
              `Some items in your cart are no longer available. Please refresh your cart to see current availability.`
            );
          }
        }
      } catch {
        // Continue anyway - backend will handle validation
      }

      // Try the format that matches the backend database
      const orderData = {
        orderItems: items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
        })),
        total: getTotal(),
        // Add any additional fields the backend might expect
        status: "pending" as const,
        notes: notes || "",
        shippingAddress: {
          name: shipping.name,
          email: shipping.email,
          phone: shipping.phone,
          address1: shipping.address1,
          address2: shipping.address2,
          city: shipping.city,
          state: shipping.state,
          postal: shipping.postal,
          country: shipping.country,
        },
      };

      // Fix: shippingAddress should be a string, not an object
      const orderDataForBackend = {
        ...orderData,
        shippingAddress: [
          orderData.shippingAddress.name,
          orderData.shippingAddress.email,
          orderData.shippingAddress.phone,
          orderData.shippingAddress.address1,
          orderData.shippingAddress.address2,
          orderData.shippingAddress.city,
          orderData.shippingAddress.state,
          orderData.shippingAddress.postal,
          orderData.shippingAddress.country,
        ]
          .filter(Boolean)
          .join(", "),
      };

      const created = await createOrder(orderDataForBackend);
      if (!created) throw new Error("Failed to create order");

      // Create Stripe Checkout Session
      const resp = await fetch("/payments/create-checkout-session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: created.id,
          items: orderData.orderItems,
          customerEmail: shipping.email || undefined,
          shippingAddress: orderData.shippingAddress,
          successUrl: `${window.location.origin}/profile?order=${created.id}&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/cart`,
        }),
      });
      if (!resp.ok) throw new Error("Unable to start checkout");
      const data = await resp.json();
      if (!data?.url) throw new Error("Invalid checkout session");
      window.location.href = data.url;
    } catch (e: unknown) {
      const message =
        (e as { message?: string })?.message || "Failed to place order";
      setOrderError(message);
    } finally {
      setOrderLoading(false);
    }
  };

  return (
    <VerificationGuard>
      <div className="min-h-screen bg-white">
        <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12">
          {/* Header */}
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="text-2xl sm:text-4xl font-bold mb-2 bg-gradient-to-r from-[#FF5D39] to-[#F1A900] bg-clip-text text-transparent">
              Your Shopping Cart
            </h1>
            <p className="text-base sm:text-lg text-black/70">
              Review your items and complete your purchase
            </p>
          </div>

          {/* Error and Loading States */}
          {error && (
            <div className="mb-6 p-4 rounded-xl shadow-sm bg-primary/10 border border-primary/40">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-primary"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-primary">{error}</p>
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex justify-center items-center py-16 sm:py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <span className="ml-3 text-lg text-black/70">
                Loading your cart...
              </span>
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="text-center py-16 sm:py-20">
              <div className="mx-auto h-20 w-20 sm:h-24 sm:w-24 mb-4 text-gray-300">
                <svg
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  className="text-black"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-2.5 5M7 13l2.5 5m6-5v6a2 2 0 01-2 2H9a2 2 0 01-2-2v-6m6 0V9a2 2 0 00-2-2H9a2 2 0 00-2 2v4.01"
                  />
                </svg>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-2 text-black">
                Your cart is empty
              </h3>
              <p className="mb-6 text-sm sm:text-base text-black/70">
                Looks like you haven&apos;t added any items to your cart yet.
              </p>
              <CustomButton
                title="Start Shopping"
                onClick={() => router.push("/shop")}
                className="bg-primary text-white hover:opacity-90 transition-opacity hover:bg-primary/90"
              />
            </div>
          )}

          {/* Cart Items */}
          {items.length > 0 && (
            <div className="space-y-4 sm:space-y-6 mb-8">
              {items.map((item) => {
                const unit = item.price;
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl shadow-lg border border-gray-200 bg-white overflow-hidden hover:shadow-xl transition-all duration-300"
                  >
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6">
                      {/* Product Image */}
                      <div className="flex-shrink-0">
                        {item.imageUrl ? (
                          <div className="relative">
                            <Image
                              src={item.imageUrl}
                              alt={item.productName}
                              width={120}
                              height={120}
                              className="w-30 h-30 object-cover rounded-xl shadow-md"
                            />
                            <div
                              className="absolute inset-0 rounded-xl"
                              style={{
                                background:
                                  "linear-gradient(to top, rgba(0,0,0,0.08), transparent)",
                              }}
                            ></div>
                          </div>
                        ) : (
                          <div
                            className="w-30 h-30 rounded-xl flex items-center justify-center"
                            style={{
                              background: `linear-gradient(135deg, #F3F3F3 0%, #E5E5E5 100%)`,
                            }}
                          >
                            <svg
                              className="w-12 h-12"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke={"var(--black)"}
                              style={{ opacity: 0.3 }}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Product Details */}
                      <div className="flex-1 min-w-0">
                        {/* Header with title and remove button */}
                        <div className="flex justify-between items-start gap-3 mb-3">
                          <h3 className="text-lg sm:text-xl font-semibold flex-1 text-black">
                            {item.productName}
                          </h3>
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="flex-shrink-0 p-2 rounded-full transition-colors duration-200 text-black bg-transparent hover:bg-primary/10 hover:text-primary"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>

                        {/* Price - separate row on mobile */}
                        <div className="mb-4">
                          <p className="text-base sm:text-lg font-medium text-primary">
                            ${unit.toFixed(2)} each
                          </p>
                        </div>

                        {/* Quantity Controls and Total - separate rows on mobile */}
                        <div className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-4">
                          {/* Quantity Controls */}
                          <div className="flex items-center rounded-xl p-1 w-fit bg-white">
                            <button
                              type="button"
                              className="p-2 rounded-lg transition-all duration-200 text-black bg-transparent hover:text-primary"
                              onClick={() =>
                                handleQuantity(
                                  item.id,
                                  Math.max(1, item.quantity - 1)
                                )
                              }
                              aria-label="Decrease quantity"
                            >
                              <svg
                                className="w-4 h-4 sm:w-5 sm:h-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M20 12H4"
                                />
                              </svg>
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={item.quantity || 1}
                              onChange={(e) =>
                                handleQuantity(
                                  item.id,
                                  Number(e.target.value) || 1
                                )
                              }
                              className="w-14 sm:w-16 text-center font-medium text-sm sm:text-base text-black bg-transparent outline-none"
                            />
                            <button
                              type="button"
                              className="p-2 rounded-lg transition-all duration-200 text-black bg-transparent hover:text-primary"
                              onClick={() =>
                                handleQuantity(item.id, item.quantity + 1)
                              }
                              aria-label="Increase quantity"
                            >
                              <svg
                                className="w-4 h-4 sm:w-5 sm:h-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                            </button>
                          </div>

                          {/* Total - separate row on mobile, inline on desktop */}
                          <div className="sm:ml-auto">
                            <span className="text-xl sm:text-2xl font-bold text-black">
                              ${(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Checkout Section */}
          {items.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
              {/* Order Details */}
              <div className="lg:col-span-2 space-y-6">
                <div className="rounded-2xl shadow-lg border border-gray-200 bg-white p-4 sm:p-6">
                  <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 flex items-center text-black">
                    <svg
                      className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    Order Details
                  </h2>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-black/80">
                        Order Notes
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base border border-gray-300 text-black bg-white transition-all duration-200 outline-none focus:border-primary focus:border-2"
                        rows={3}
                        placeholder="Any special instructions for your order..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Summary */}
              <div className="lg:col-span-1">
                <div className="rounded-2xl shadow-lg border border-gray-200 bg-white p-4 sm:p-6 sticky top-4 sm:top-6">
                  <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 flex items-center text-black">
                    <svg
                      className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 00-2 2z"
                      />
                    </svg>
                    Order Summary
                  </h2>

                  <div className="space-y-4 mb-6">
                    <div className="flex justify-between items-center py-2.5 sm:py-3 border-b border-gray-200">
                      <span className="text-black/70">Subtotal</span>
                      <span className="text-lg sm:text-xl font-bold text-black">
                        ${getTotal().toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2.5 sm:py-3 border-b border-gray-200">
                      <span className="text-black/70">Shipping</span>
                      <span className="text-black">Free</span>
                    </div>
                    <div className="flex justify-between items-center py-2.5 sm:py-3">
                      <span className="text-base sm:text-lg font-semibold text-black">
                        Total
                      </span>
                      <span className="text-xl sm:text-2xl font-bold text-primary">
                        ${getTotal().toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Special Offer Banner */}
                  <div className="mb-4 p-3 rounded-lg text-center bg-gradient-to-br from-primary/15 to-primary/15">
                    <div className="flex items-center justify-center mb-1">
                      <svg
                        className="w-4 h-4 mr-2 text-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
                        />
                      </svg>
                      <span className="text-sm font-bold text-primary">
                        Special Offer!
                      </span>
                    </div>
                    <p className="text-xs text-black/80">
                      Add more items to your order and save on shipping
                    </p>
                  </div>

                  {/* Recommended Products Section */}
                  <div className="mb-6 p-4 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5">
                    <div className="flex items-center mb-4">
                      <svg
                        className="w-5 h-5 mr-2 text-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                        />
                      </svg>
                      <h3 className="text-lg font-bold text-black">
                        You might also like
                      </h3>
                      <div className="flex-1 h-px ml-3 bg-gradient-to-r from-primary/40 to-transparent"></div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {recommendedLoading ? (
                        // Loading state
                        <>
                          <div
                            className="bg-white rounded-lg p-3 shadow-sm border animate-pulse"
                            style={{ borderColor: `${"var(--primary)"}20` }}
                          >
                            <div className="aspect-square mb-2 rounded-lg bg-gray-200"></div>
                            <div className="h-4 bg-gray-200 rounded mb-1"></div>
                            <div className="h-3 bg-gray-200 rounded mb-2"></div>
                            <div className="flex items-center justify-between">
                              <div className="h-4 bg-gray-200 rounded w-12"></div>
                              <div className="h-6 bg-gray-200 rounded-full w-12"></div>
                            </div>
                          </div>
                          <div
                            className="bg-white rounded-lg p-3 shadow-sm border animate-pulse"
                            style={{ borderColor: `${"var(--primary)"}20` }}
                          >
                            <div className="aspect-square mb-2 rounded-lg bg-gray-200"></div>
                            <div className="h-4 bg-gray-200 rounded mb-1"></div>
                            <div className="h-3 bg-gray-200 rounded mb-2"></div>
                            <div className="flex items-center justify-between">
                              <div className="h-4 bg-gray-200 rounded w-12"></div>
                              <div className="h-6 bg-gray-200 rounded-full w-12"></div>
                            </div>
                          </div>
                        </>
                      ) : recommendedProducts.length > 0 ? (
                        // Real products
                        recommendedProducts.map((product, index) => (
                          <div
                            key={product.id}
                            className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer border"
                            style={{ borderColor: `${"var(--primary)"}20` }}
                          >
                            <div className="aspect-square mb-2 rounded-lg overflow-hidden bg-gray-100">
                              {product.imageUrl ? (
                                <Image
                                  src={product.imageUrl}
                                  alt={product.name}
                                  width={100}
                                  height={100}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center"
                                  style={{
                                    background: `linear-gradient(135deg, ${
                                      index % 2 === 0
                                        ? `${"var(--primary)"}20, ${"var(--primary)"}20`
                                        : `${"var(--primary)"}20, ${"var(--primary)"}20`
                                    })`,
                                  }}
                                >
                                  <svg
                                    className="w-8 h-8"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke={
                                      index % 2 === 0
                                        ? "var(--primary)"
                                        : "var(--primary)"
                                    }
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                                    />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <h4
                              className="text-sm font-semibold mb-1 truncate"
                              style={{ color: "var(--black)" }}
                              title={product.name}
                            >
                              {product.name}
                            </h4>
                            <p
                              className="text-xs mb-2"
                              style={{ color: "var(--black)", opacity: 0.7 }}
                            >
                              {product.category || "Premium candy"}
                            </p>
                            <div className="flex items-center justify-between">
                              <span
                                className="text-sm font-bold"
                                style={{ color: "var(--primary)" }}
                              >
                                ${product.price?.toFixed(2) || "0.00"}
                              </span>
                              <button
                                onClick={() =>
                                  handleAddRecommendedProduct(product)
                                }
                                className="text-xs px-2 py-1 rounded-full text-white font-medium hover:opacity-90 transition-opacity cursor-pointer"
                                style={{ background: "var(--primary)" }}
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        // Fallback when no products available - show explore options
                        <>
                          <div
                            className="bg-white rounded-lg p-3 shadow-sm border text-center cursor-pointer hover:shadow-md transition-shadow"
                            style={{ borderColor: `${"var(--primary)"}20` }}
                            onClick={handleViewAllProducts}
                          >
                            <div
                              className="aspect-square mb-2 rounded-lg bg-gray-100 flex items-center justify-center"
                              style={{
                                background: `linear-gradient(135deg, ${"var(--primary)"}20, ${"var(--primary)"}20)`,
                              }}
                            >
                              <svg
                                className="w-8 h-8"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke={"var(--primary)"}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                />
                              </svg>
                            </div>
                            <h4
                              className="text-sm font-semibold mb-1"
                              style={{ color: "var(--black)" }}
                            >
                              Browse Products
                            </h4>
                            <p
                              className="text-xs mb-2"
                              style={{ color: "var(--black)", opacity: 0.7 }}
                            >
                              Discover more items
                            </p>
                          </div>
                          <div
                            className="bg-white rounded-lg p-3 shadow-sm border text-center cursor-pointer hover:shadow-md transition-shadow"
                            style={{ borderColor: `${"var(--primary)"}20` }}
                            onClick={fetchRecommendedProducts}
                          >
                            <div
                              className="aspect-square mb-2 rounded-lg bg-gray-100 flex items-center justify-center"
                              style={{
                                background: `linear-gradient(135deg, ${"var(--primary)"}20, ${"var(--primary)"}20)`,
                              }}
                            >
                              <svg
                                className="w-8 h-8"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke={"var(--primary)"}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                />
                              </svg>
                            </div>
                            <h4
                              className="text-sm font-semibold mb-1"
                              style={{ color: "var(--black)" }}
                            >
                              Refresh
                            </h4>
                            <p
                              className="text-xs mb-2"
                              style={{ color: "var(--black)", opacity: 0.7 }}
                            >
                              Get new suggestions
                            </p>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mt-3 flex justify-center gap-2">
                      <CustomButton
                        title="🔄 New suggestions"
                        onClick={fetchRecommendedProducts}
                        loading={recommendedLoading}
                        loadingText="Loading..."
                        disabled={recommendedLoading}
                        className="text-sm font-medium px-3 py-2 rounded-lg transition-colors hover:opacity-90 text-white bg-secondary hover:bg-secondary/80"
                      />
                      <CustomButton
                        title="View all products →"
                        onClick={handleViewAllProducts}
                        className="text-sm font-medium px-3 py-2 rounded-lg transition-colors hover:opacity-90 text-primary bg-primary  hover:bg-primary/10"
                      />
                    </div>
                  </div>

                  {orderError && (
                    <div
                      className="mb-4 p-3 rounded-lg"
                      style={{
                        background: `${"var(--primary)"}10`,
                        border: `1px solid ${"var(--primary)"}40`,
                      }}
                    >
                      <p
                        className="text-sm"
                        style={{ color: "var(--primary)" }}
                      >
                        {orderError}
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <CustomButton
                      title="Complete Purchase"
                      onClick={checkout}
                      loading={orderLoading}
                      loadingText="Placing Order..."
                      disabled={orderLoading}
                      className="w-full font-semibold py-3.5 sm:py-4 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 text-sm sm:text-base bg-gradient-to-r from-primary to-secondary text-white border-0"
                    />

                    <CustomButton
                      title="Clear Cart"
                      onClick={handleClearCart}
                      loading={clearCartLoading}
                      loadingText="Clearing..."
                      disabled={clearCartLoading}
                      className="w-full font-semibold py-3 rounded-xl transition-all duration-200 hover:opacity-90 text-primary  hover:bg-primary/5 hover:text-secondary"
                    />
                  </div>

                  <div
                    className="mt-4 sm:mt-6 p-3 sm:p-4 rounded-lg"
                    style={{
                      background: `${"var(--primary)"}10`,
                    }}
                  >
                    <div className="flex items-start">
                      <svg
                        className="w-4 h-4 sm:w-5 sm:h-5 mt-0.5 mr-2 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke={"var(--primary)"}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p
                        className="text-xs sm:text-sm"
                        style={{ color: "var(--black)", opacity: 0.8 }}
                      >
                        Secure checkout powered by industry-standard encryption.
                        Your payment information is protected.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </VerificationGuard>
  );
};

export default CartPage;
