"use client";
import React, { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useCartStore } from "@/store/cartStore";
import { trackEcommerce } from "@/hooks/useTrackdeskEvent";
import { 
  CheckCircle2, 
  Package, 
  Truck, 
  ArrowRight, 
  ShoppingBag, 
  ExternalLink,
  Loader2,
  Calendar,
  CreditCard,
  MapPin
} from "lucide-react";
import gsap from "gsap";
import Image from "next/image";

const ORANGE = "#FF5D39";
const YELLOW = "#F1A900";

interface OrderData {
  id: string;
  total: number;
  shippingAddress?: {
    name: string;
    street1?: string;
    street?: string;
    street2?: string;
    line2?: string;
    city: string;
    state: string;
    zip?: string;
    zipCode?: string;
    country: string;
  };
  shippingCarrier?: string;
  shippingService?: string;
  selectedShippingRate?: {
    carrier?: string;
    serviceName?: string;
  };
  orderItems?: {
    productId?: string;
    product_id?: string;
    productName?: string;
    product_name?: string;
    price?: number;
    unit_price?: number;
    quantity?: number;
    qty?: number;
  }[];
}

function OrderSuccessContent() {
  const search = useSearchParams();
  const router = useRouter();
  const [seconds, setSeconds] = useState(15);
  const [resolvedOrderId, setResolvedOrderId] = useState("");
  const [orderDetails, setOrderDetails] = useState<OrderData | null>(null);
  const [syncStatus, setSyncStatus] = useState<
    "syncing" | "ready" | "processing" | "error"
  >("syncing");
  const [syncMessage, setSyncMessage] = useState(
    "Confirming your order..."
  );
  
  const containerRef = useRef<HTMLDivElement>(null);
  const successIconRef = useRef<HTMLDivElement>(null);
  const trackedOrderKeyRef = useRef<string | null>(null);
  const { clearCart } = useCartStore();

  const orderIdFromQuery = search.get("order") || "";
  const sessionIdFromQuery = search.get("session_id") || "";
  const sessionId = sessionIdFromQuery.includes("CHECKOUT_SESSION_ID")
    ? ""
    : sessionIdFromQuery;
  const orderId = resolvedOrderId || orderIdFromQuery;

  useEffect(() => {
    if (orderIdFromQuery) {
      setResolvedOrderId(orderIdFromQuery);
    }
  }, [orderIdFromQuery]);

  // GSAP Animations
  useEffect(() => {
    if (syncStatus === "ready" && containerRef.current) {
      const ctx = gsap.context(() => {
        gsap.from(".animate-fade-in", {
          y: 20,
          opacity: 0,
          duration: 0.6,
          stagger: 0.1,
          ease: "power2.out"
        });

        if (successIconRef.current) {
          gsap.from(successIconRef.current, {
            scale: 0.5,
            opacity: 0,
            rotate: -15,
            duration: 0.8,
            ease: "back.out(1.7)"
          });
        }
      }, containerRef);
      return () => ctx.revert();
    }
  }, [syncStatus]);

  useEffect(() => {
    if (!sessionId) {
      setSyncStatus("ready");
      setSyncMessage("Your order is confirmed.");
      return;
    }

    let isActive = true;

    const confirmSession = async () => {
      try {
        setSyncStatus("syncing");
        setSyncMessage("Confirming your order...");

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/payments/confirm-session/${sessionId}`,
          {
            method: "POST",
            credentials: "include",
          }
        );

        const data = await response.json().catch(() => ({}));
        if (!isActive) return;

        if (data?.orderId) {
          setResolvedOrderId(data.orderId);
        }

        if (response.ok) {
          setSyncStatus("ready");
          setSyncMessage(
            data?.alreadyPaid
              ? "Your order was already confirmed."
              : "Your order is confirmed."
          );
          return;
        }

        if (response.status === 202) {
          setSyncStatus("processing");
          setSyncMessage(
            data?.message ||
              "Payment received. We're still syncing your order details."
          );
          return;
        }

        setSyncStatus("error");
        setSyncMessage(
          data?.message ||
            "Payment received, but automatic order confirmation is taking longer than expected."
        );
      } catch (error) {
        console.error("Error confirming checkout session:", error);
        if (!isActive) return;
        setSyncStatus("error");
        setSyncMessage(
          "Payment received, but automatic order confirmation is taking longer than expected."
        );
      }
    };

    confirmSession();

    return () => {
      isActive = false;
    };
  }, [sessionId]);

  // Track purchase completion and fetch order details
  useEffect(() => {
    if (syncStatus === "syncing") return;
    if (!orderId && !sessionId) return;

    const trackingKey = `${orderId || "no-order"}:${sessionId || "no-session"}`;
    if (trackedOrderKeyRef.current === trackingKey) {
      return;
    }
    trackedOrderKeyRef.current = trackingKey;

    const trackAndFetch = async () => {
      try {
        const getStoredReferralCode = () => {
          try {
            const stored = sessionStorage.getItem("trackdesk_referral_code");
            if (!stored) return null;
            const sessionData = JSON.parse(stored);
            const code = sessionData.code;
            if (!code || typeof code !== "string") {
              sessionStorage.removeItem("trackdesk_referral_code");
              return null;
            }
            const timestamp = new Date(sessionData.timestamp);
            const now = new Date();
            const hoursDiff = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
            if (hoursDiff > 24) {
              sessionStorage.removeItem("trackdesk_referral_code");
              return null;
            }
            return code;
          } catch {
            sessionStorage.removeItem("trackdesk_referral_code");
            return null;
          }
        };

        const referralCode = getStoredReferralCode();
        const apiUrl = process.env.NEXT_PUBLIC_TRACKDESK_API_URL || process.env.NEXT_PUBLIC_API_URL || "";
        const websiteId = process.env.NEXT_PUBLIC_TRACKDESK_WEBSITE_ID || "";

        let orderValue = 0;
        let orderItems: { id: string; name: string; price: number; quantity: number }[] = [];

        if (orderId) {
          try {
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL}/orders/${orderId}`,
              { credentials: "include" }
            );

            if (response.ok) {
              const orderData = await response.json();
              const order = orderData.order || orderData;
              setOrderDetails(order);
              orderValue = order.total || 0;
              orderItems = (order.orderItems || []).map((item: { 
                productId?: string; 
                product_id?: string; 
                productName?: string; 
                product_name?: string; 
                price?: number; 
                unit_price?: number; 
                quantity?: number; 
                qty?: number; 
              }) => ({
                id: item.productId || item.product_id || "",
                name: item.productName || item.product_name || "",
                price: item.price || item.unit_price || 0,
                quantity: item.quantity || item.qty || 1,
              }));
            }
          } catch (error) {
            console.error("[Trackdesk] Failed to fetch order details:", error);
          }
        }

        if (orderValue === 0 && sessionId) {
          try {
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL}/payments/session/${sessionId}`,
              { credentials: "include" }
            );
            if (response.ok) {
              const sessionData = await response.json();
              const session = sessionData.session || sessionData;
              if (session.amount_total) {
                orderValue = session.amount_total / 100;
              }
              if (!orderId && session.metadata?.orderId) {
                setResolvedOrderId(session.metadata.orderId);
              }
            }
          } catch (error) {
            console.error("[Trackdesk] Failed to fetch Stripe session:", error);
          }
        }

        if (typeof window !== "undefined" && window.Trackdesk) {
          trackEcommerce.purchase({
            orderId: orderId || sessionId,
            value: orderValue,
            currency: "USD",
            items: orderItems,
          });
        }

        if (referralCode && orderValue > 0) {
          await fetch(`${apiUrl}/tracking/order`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              referralCode,
              websiteId,
              storeId: websiteId,
              orderId: orderId || sessionId,
              orderValue,
              value: orderValue,
              currency: "USD",
            }),
          });
        }
      } catch (error) {
        console.error("[Trackdesk] Error tracking purchase:", error);
      }
    };

    trackAndFetch();
  }, [orderId, sessionId, syncStatus]);

  // Clear cart
  useEffect(() => {
    const clearCartOnSuccess = async () => {
      try {
        await clearCart();
      } catch (error) {
        console.error("⚠️ Failed to clear cart:", error);
      }
    };
    clearCartOnSuccess();
  }, [clearCart]);

  // Redirect timer
  useEffect(() => {
    if (syncStatus === "syncing") return;
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    const redirect = setTimeout(() => router.replace("/shop"), 15000);
    return () => {
      clearInterval(timer);
      clearTimeout(redirect);
    };
  }, [router, syncStatus]);

  if (syncStatus === "syncing") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
            <div 
              className="absolute inset-0 border-4 rounded-full border-t-transparent animate-spin"
              style={{ borderColor: `${ORANGE} transparent transparent transparent` }}
            ></div>
            <Package className="absolute inset-0 m-auto w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Confirming Order</h2>
          <p className="text-gray-500">{syncMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="min-h-screen bg-gray-50/50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Main Success Card */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 mb-8 animate-fade-in">
          <div className="bg-gradient-to-r from-[#FF5D39] to-[#F1A900] px-8 py-12 text-center text-white relative">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none overflow-hidden">
               {/* Pattern */}
               <div className="absolute top-[-10%] left-[-5%] w-[30%] h-[50%] bg-white rounded-full blur-3xl opacity-30"></div>
               <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[60%] bg-white rounded-full blur-3xl opacity-20"></div>
            </div>
            
            <div ref={successIconRef} className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-md rounded-full mb-6">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-black mb-4 tracking-tight">
              THANK YOU!
            </h1>
            <p className="text-xl opacity-90 font-medium max-w-lg mx-auto">
              Your sweet order has been placed successfully and will be on its way soon.
            </p>
          </div>

          <div className="p-8 sm:p-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {/* Order Info */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <Package className="w-5 h-5 text-[#FF5D39]" />
                  Order Information
                </h3>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="text-gray-500 font-medium">Order Number</span>
                    <span className="text-gray-900 font-bold">#{orderId?.slice(-8).toUpperCase() || "PENDING"}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="text-gray-500 font-medium">Date</span>
                    <span className="text-gray-900 font-bold">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-gray-100">
                    <span className="text-gray-500 font-medium">Payment Status</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                      PAID
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-gray-500 font-medium">Order Total</span>
                    <span className="text-2xl font-black text-[#FF5D39]">${orderDetails?.total?.toFixed(2) || "..."}</span>
                  </div>
                </div>
              </div>

              {/* Shipping Info */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-[#FF5D39]" />
                  Shipping Details
                </h3>
                
                <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                  {orderDetails?.shippingAddress ? (
                    <div className="space-y-3">
                      <p className="font-bold text-gray-900">{orderDetails.shippingAddress.name}</p>
                      <div className="flex gap-2 text-gray-600 text-sm">
                        <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                        <p>
                          {orderDetails.shippingAddress.street1 || orderDetails.shippingAddress.street}
                          {(orderDetails.shippingAddress.street2 || orderDetails.shippingAddress.line2) && (
                            <>
                              <br />
                              {orderDetails.shippingAddress.street2 || orderDetails.shippingAddress.line2}
                            </>
                          )}
                          <br />
                          {orderDetails.shippingAddress.city}, {orderDetails.shippingAddress.state} {orderDetails.shippingAddress.zip || orderDetails.shippingAddress.zipCode}<br />
                          {orderDetails.shippingAddress.country}
                        </p>
                      </div>
                      <div className="pt-4 border-t border-gray-200 mt-4">
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">Shipping Method</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {orderDetails.shippingCarrier || orderDetails.selectedShippingRate?.carrier || "Standard Shipping"} 
                          {(orderDetails.shippingService || orderDetails.selectedShippingRate?.serviceName) && 
                            ` (${orderDetails.shippingService || orderDetails.selectedShippingRate?.serviceName})`
                          }
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4 text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin mb-2" />
                      <p className="text-sm italic">Loading shipping details...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Next Steps */}
            <div className="mt-12 pt-12 border-t border-gray-100">
              <h3 className="text-xl font-bold text-gray-900 mb-6">What&apos;s Next?</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <span className="font-bold text-[#FF5D39]">1</span>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">Confirmation Email</p>
                    <p className="text-xs text-gray-500 mt-1">We&apos;ve sent a receipt to your inbox with all the details.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <span className="font-bold text-[#FF5D39]">2</span>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">Processing</p>
                    <p className="text-xs text-gray-500 mt-1">Our team is carefully packing your licorice right now.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <span className="font-bold text-[#FF5D39]">3</span>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">Shipping</p>
                    <p className="text-xs text-gray-500 mt-1">You&apos;ll receive another email with a tracking number once it ships.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in">
          <button 
            onClick={() => router.push(`/track-order?id=${orderId}`)}
            className="group px-8 py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            Track My Order
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          
          <button 
            onClick={() => router.push("/shop")}
            className="px-8 py-4 bg-white text-gray-900 font-bold rounded-2xl border-2 border-gray-200 hover:border-[#FF5D39] hover:text-[#FF5D39] transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <ShoppingBag className="w-4 h-4" />
            Continue Shopping
          </button>
        </div>

        <p className="text-center mt-12 text-gray-400 text-sm">
          Redirecting to our shop in <span className="font-bold text-gray-600">{seconds}s</span>...
        </p>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center p-4">
          <div className="text-center">
            <div
              className="animate-spin rounded-full h-12 w-2 border-b-2 mx-auto mb-4"
              style={{ borderColor: ORANGE }}
            ></div>
            <p className="text-gray-500 font-medium">Loading your confirmation...</p>
          </div>
        </div>
      }
    >
      <OrderSuccessContent />
    </Suspense>
  );
}
