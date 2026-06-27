import express from "express";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import { PrismaClient } from "../generated/prisma";
import {
  sendOrderConfirmationEmail,
  sendAdminOrderNotification,
} from "../utils/mailer";

const router = express.Router();
const prisma = new PrismaClient();

// Lazy Stripe init to allow running without keys in dev/demo
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2024-06-20" } as any);
}

const GUEST_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const getDefaultParcels = () => [
  {
    length: "6",
    width: "4",
    height: "2",
    weight: "0.5",
    massUnit: "lb" as const,
    distanceUnit: "in" as const,
  },
];

const appendQueryParam = (url: string, key: string, value: string) => {
  const preserveStripeCheckoutPlaceholder = (nextUrl: string) =>
    nextUrl.replace(
      /%7BCHECKOUT_SESSION_ID%7D/gi,
      "{CHECKOUT_SESSION_ID}"
    );

  try {
    const parsed = new URL(url);
    parsed.searchParams.set(key, value);
    return preserveStripeCheckoutPlaceholder(parsed.toString());
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return preserveStripeCheckoutPlaceholder(
      `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(
        value
      )}`
    );
  }
};

const normalizeStoredShippingAddress = (address: any) => {
  if (!address || typeof address !== "object") {
    return null;
  }

  const nestedAddress = address.address || {};
  const street1 = address.street1 || address.street || nestedAddress.line1 || "";
  const street2 = address.street2 || nestedAddress.line2 || "";

  const normalized: any = {
    name: address.name || "",
    email: address.email || "",
    phone: address.phone || "",
    street1,
    street2,
    city: address.city || nestedAddress.city || "",
    state: address.state || nestedAddress.state || "",
    zip: address.zip || address.zipCode || nestedAddress.postal_code || "",
    country: address.country || nestedAddress.country || "US",
  };

  const shippingRate = address.shippingRate || address.selectedShippingRate;
  if (shippingRate) {
    normalized.shippingRate = shippingRate;
  }

  return normalized;
};

const buildCheckoutShippingAddress = (
  session: Stripe.Checkout.Session,
  existingShippingAddress: any
) => {
  const existing = normalizeStoredShippingAddress(existingShippingAddress) || {};
  const sessionAny = session as any;
  const shippingDetails = sessionAny.shipping_details || sessionAny.shipping;
  const customerDetails = session.customer_details as any;
  const sessionAddress = shippingDetails?.address || customerDetails?.address;

  const incoming: any = {};
  const name = shippingDetails?.name || customerDetails?.name;
  const email = customerDetails?.email;
  const phone = customerDetails?.phone || shippingDetails?.phone;

  if (name) incoming.name = name;
  if (email) incoming.email = email;
  if (phone) incoming.phone = phone;

  if (sessionAddress) {
    if (sessionAddress.line1) incoming.street1 = sessionAddress.line1;
    if (sessionAddress.line2) incoming.street2 = sessionAddress.line2;
    if (sessionAddress.city) incoming.city = sessionAddress.city;
    if (sessionAddress.state) incoming.state = sessionAddress.state;
    if (sessionAddress.postal_code) incoming.zip = sessionAddress.postal_code;
    if (sessionAddress.country) incoming.country = sessionAddress.country;
  }

  if (existing.shippingRate) {
    incoming.shippingRate = existing.shippingRate;
  }

  const merged = {
    ...existing,
    ...incoming,
  };

  return Object.keys(merged).length > 0 ? merged : null;
};

const hasDeliverableAddressFields = (address: any) =>
  Boolean(address?.street1 || address?.city || address?.state || address?.zip);

const pickShippingAddressForEmail = (...addresses: any[]) => {
  let fallback: any = null;

  for (const address of addresses) {
    const normalized = normalizeStoredShippingAddress(address);
    if (!normalized) continue;

    if (!fallback) {
      fallback = normalized;
    }

    if (hasDeliverableAddressFields(normalized)) {
      return normalized;
    }
  }

  return fallback || {};
};

const buildEmailShippingAddress = (...addresses: any[]) => {
  const shippingAddress = pickShippingAddressForEmail(...addresses);
  const hasAddress = hasDeliverableAddressFields(shippingAddress);

  return {
    name: shippingAddress.name || "",
    email: shippingAddress.email || "",
    phone: shippingAddress.phone || "",
    street1: shippingAddress.street1 || "",
    street2: shippingAddress.street2 || "",
    city: shippingAddress.city || "",
    state: shippingAddress.state || "",
    zip: shippingAddress.zip || "",
    country: hasAddress ? shippingAddress.country || "" : "",
  };
};

const buildOrderNotes = (baseNotes: string, orderItems: any[]) => {
  let finalNotes = baseNotes || "";

  for (const item of orderItems) {
    if (item.packProductId) {
      const packInfo = `Pack Product: ${
        item.packProductName || "Unknown"
      } (ID: ${item.packProductId})`;
      if (!finalNotes.includes(packInfo)) {
        finalNotes = finalNotes ? `${finalNotes}\n${packInfo}` : packInfo;
      }
    }

    if (item.variationName) {
      const variationInfo = `Variation: ${item.variationName} (Product: ${
        item.productName || item.productId || "Unknown"
      }, Pack Size: ${item.packSize || "N/A"})`;
      if (!finalNotes.includes(variationInfo)) {
        finalNotes = finalNotes
          ? `${finalNotes}\n${variationInfo}`
          : variationInfo;
      }
    }
  }

  return finalNotes;
};

const buildPersistedOrderItems = async (orderItems: any[]) => {
  return Promise.all(
    orderItems.map(async (item: any) => {
      let validVariationId = null;

      if (item.variationId) {
        try {
          const variation = await prisma.productVariation.findUnique({
            where: { id: item.variationId },
            select: { id: true },
          });

          if (variation) {
            validVariationId = item.variationId;
          }
        } catch (error) {
          console.error(
            `❌ Error validating variationId ${item.variationId}:`,
            error
          );
        }
      }

      const quantity = Math.max(1, Number(item.quantity || 1));
      const price = Number(item.price || 0);

      return {
        productId: item.productId || null,
        quantity,
        price,
        total: Number(item.total ?? price * quantity),
        flavorIds: Array.isArray(item.flavorIds)
          ? item.flavorIds.filter(Boolean)
          : [],
        customPackName: item.customPackName || null,
        variationId: validVariationId,
      };
    })
  );
};

const createPendingOrderFromCheckout = async ({
  orderData,
  selectedShippingRate,
  customerEmail,
  guestId,
}: {
  orderData: any;
  selectedShippingRate?: any;
  customerEmail?: string;
  guestId?: string | null;
}) => {
  const normalizedShippingAddress = normalizeStoredShippingAddress({
    ...(orderData?.shippingAddress || {}),
    email: orderData?.shippingAddress?.email || customerEmail || "",
    shippingRate: selectedShippingRate,
  });

  const email =
    normalizedShippingAddress?.email || customerEmail || orderData?.guestEmail;

  const user = email
    ? await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      })
    : null;

  const persistedOrderItems = await buildPersistedOrderItems(
    orderData?.orderItems || []
  );

  return prisma.order.create({
    data: {
      userId: user?.id || null,
      guestId: user ? null : guestId || `guest_${randomUUID()}`,
      guestEmail: user ? null : email || null,
      status: "pending",
      paymentStatus: "pending",
      total: Number(orderData?.total || 0),
      shippingAddress: normalizedShippingAddress,
      orderNotes: buildOrderNotes(
        orderData?.orderNotes || "Order from website",
        orderData?.orderItems || []
      ),
      orderItems: {
        create: persistedOrderItems,
      },
    },
    include: {
      orderItems: true,
    },
  });
};

const decrementInventoryForOrderItems = async (orderItems: any[]) => {
  for (const item of orderItems) {
    try {
      if (!item.productId && item.flavorIds && item.flavorIds.length > 0) {
        for (const flavorId of item.flavorIds) {
          await prisma.flavorInventory.update({
            where: { flavorId },
            data: {
              onHand: { decrement: item.quantity },
              reserved: { decrement: item.quantity },
            },
          });
        }
      } else if (item.productId) {
        await prisma.product.update({
          where: { id: item.productId },
          data: {
            stock: { decrement: item.quantity },
          },
        });
      }
    } catch (error) {
      console.error(
        `❌ Error updating inventory for order item ${item.id || item.productId}:`,
        error
      );
    }
  }
};

const getOrderShipmentDetails = async (orderId: string) => {
  const orderWithShipment = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      trackingNumber: true,
      trackingUrl: true,
      shippingCarrier: true,
      shippingCost: true,
    },
  });

  if (!orderWithShipment) {
    return undefined;
  }

  return {
    trackingNumber: orderWithShipment.trackingNumber,
    trackingUrl: orderWithShipment.trackingUrl,
    carrier: orderWithShipment.shippingCarrier,
    shippingCost: orderWithShipment.shippingCost,
  };
};

const createShipmentForOrder = async (order: any) => {
  if (order.shipmentId) {
    return getOrderShipmentDetails(order.id);
  }

  const shippingAddress = normalizeStoredShippingAddress(order.shippingAddress);

  if (
    !shippingAddress?.name ||
    !shippingAddress.street1 ||
    !shippingAddress.city ||
    !shippingAddress.state ||
    !shippingAddress.zip ||
    !shippingAddress.country
  ) {
    console.log("⚠️ Skipping shipment creation due to incomplete address", {
      orderId: order.id,
      shippingAddress,
    });
    return undefined;
  }

  const { getShippingRates, createShipment } = await import(
    "../services/shippoService"
  );

  const storedRate = shippingAddress.shippingRate;
  let selectedRate: any = null;
  let isFlatRateShipping = false;
  let flatRateCost = 0;

  if (storedRate?.objectId) {
    isFlatRateShipping = String(storedRate.objectId).startsWith("flat-rate-");
    flatRateCost = Number(storedRate.amount || 0);

    if (isFlatRateShipping) {
      const shippoRates = await getShippingRates(
        shippingAddress as any,
        getDefaultParcels()
      );
      selectedRate = shippoRates[0] || null;
    } else {
      selectedRate = storedRate;
    }
  } else {
    const rates = await getShippingRates(
      shippingAddress as any,
      getDefaultParcels()
    );
    selectedRate = rates[0] || null;
  }

  if (!selectedRate) {
    console.log("⚠️ No shipping rate available for order", { orderId: order.id });
    return undefined;
  }

  await createShipment(
    {
      orderId: order.id,
      toAddress: shippingAddress as any,
      parcels: getDefaultParcels(),
    },
    selectedRate.objectId,
    {
      carrier: selectedRate.carrier,
      amount: isFlatRateShipping
        ? flatRateCost
        : Number(storedRate?.amount || selectedRate.amount || 0),
      serviceName: storedRate?.serviceName || selectedRate.serviceName,
    }
  );

  if (isFlatRateShipping) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        shippingCost: flatRateCost,
      },
    });
  }

  const shipmentDetails = await getOrderShipmentDetails(order.id);
  if (!shipmentDetails) {
    return undefined;
  }

  return {
    ...shipmentDetails,
    shippingCost: isFlatRateShipping
      ? flatRateCost
      : Number(
          storedRate?.amount ||
            shipmentDetails.shippingCost ||
            selectedRate.amount ||
            0
        ),
  };
};

const buildEmailItemsForOrder = async (orderId: string) => {
  const orderWithItems = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      orderItems: {
        include: {
          product: {
            select: {
              name: true,
            },
          },
          variation: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!orderWithItems) {
    return null;
  }

  return {
    order: orderWithItems,
    items: orderWithItems.orderItems.map((item: any) => ({
      name:
        item.customPackName ||
        item.product?.name ||
        `Product #${item.productId || item.id}`,
      productName:
        item.customPackName ||
        item.product?.name ||
        `Product #${item.productId || item.id}`,
      quantity: item.quantity,
      price: item.price,
      variationName: item.variation?.name || null,
    })),
  };
};

const finalizeExistingCheckoutOrder = async (
  fullSession: Stripe.Checkout.Session,
  source: string
) => {
  const orderId = fullSession.metadata?.orderId;
  if (!orderId) {
    throw new Error("Order ID missing from Stripe session metadata");
  }

  const existingOrder = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!existingOrder) {
    const notFoundError = new Error("Order not found");
    (notFoundError as any).statusCode = 404;
    throw notFoundError;
  }

  const wasAlreadyPaid = existingOrder.paymentStatus === "paid";
  const normalizedShippingAddress = buildCheckoutShippingAddress(
    fullSession,
    existingOrder.shippingAddress
  );

  const updateData: any = {
    stripeSessionId: fullSession.id,
    updatedAt: new Date(),
  };

  if (
    fullSession.amount_total &&
    fullSession.amount_total !== Math.round(existingOrder.total * 100)
  ) {
    updateData.total = fullSession.amount_total / 100;
  }

  if (normalizedShippingAddress) {
    updateData.shippingAddress = normalizedShippingAddress;
  }

  let updatedOrder;
  let claimedFinalization = false;

  if (wasAlreadyPaid) {
    updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        ...updateData,
        ...(existingOrder.status === "pending" ? { status: "confirmed" } : {}),
      },
    });
  } else {
    const claimResult = await prisma.order.updateMany({
      where: {
        id: orderId,
        paymentStatus: {
          not: "paid",
        },
      },
      data: {
        ...updateData,
        paymentStatus: "paid",
        status: "confirmed",
      },
    });

    claimedFinalization = claimResult.count > 0;

    updatedOrder = await prisma.order.findUnique({
      where: { id: orderId },
    });
  }

  if (!updatedOrder) {
    throw new Error("Updated order not found after finalization");
  }

  if (!wasAlreadyPaid && claimedFinalization) {
    const orderWithItems = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (orderWithItems) {
      await decrementInventoryForOrderItems(orderWithItems.orderItems);
    }
  }

  let shippingDetails: any = undefined;
  try {
    shippingDetails = await createShipmentForOrder(updatedOrder);
  } catch (shipmentError) {
    console.error(`⚠️ Failed to create shipment during ${source}:`, shipmentError);
  }

  if (!shippingDetails && updatedOrder.shipmentId) {
    shippingDetails = await getOrderShipmentDetails(updatedOrder.id);
  }

  if (!wasAlreadyPaid && claimedFinalization) {
    try {
      const refreshedOrderForEmail = await prisma.order.findUnique({
        where: { id: orderId },
      });
      const shippingAddress = buildEmailShippingAddress(
        refreshedOrderForEmail?.shippingAddress,
        updatedOrder.shippingAddress,
        normalizedShippingAddress
      );
      const customerEmail =
        shippingAddress.email ||
        normalizedShippingAddress?.email ||
        fullSession.customer_details?.email;
      const emailPayload = await buildEmailItemsForOrder(orderId);

      if (customerEmail && emailPayload) {
        await sendOrderConfirmationEmail(customerEmail, {
          orderId: refreshedOrderForEmail?.id || updatedOrder.id,
          customerName: shippingAddress.name || "Customer",
          total: refreshedOrderForEmail?.total || updatedOrder.total,
          items: emailPayload.items,
          shippingAddress,
          shippingDetails,
        });

        try {
          await sendAdminOrderNotification({
            orderId: refreshedOrderForEmail?.id || updatedOrder.id,
            customerName: shippingAddress.name || "Customer",
            customerEmail,
            total: refreshedOrderForEmail?.total || updatedOrder.total,
            items: emailPayload.items,
            shippingAddress,
            shippingDetails,
          });
        } catch (adminEmailError) {
          console.error(
            `❌ Error sending admin order notification during ${source}:`,
            adminEmailError
          );
        }
      }
    } catch (emailError) {
      console.error(`❌ Error sending order confirmation during ${source}:`, emailError);
    }
  }

  return {
    orderId: updatedOrder.id,
    status: updatedOrder.status,
    paymentStatus: updatedOrder.paymentStatus,
    alreadyPaid: wasAlreadyPaid || !claimedFinalization,
    shippingDetails,
  };
};

router.post("/create-checkout-session", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    const {
      orderId,
      orderData,
      customerEmail,
      referralCode,
      items,
      successUrl,
      cancelUrl,
      selectedShippingRate,
    } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No items provided" });
    }

    const line_items = items.map((it: any) => ({
      price_data: {
        currency: "usd",
        product_data: { name: String(it.productName || it.name || "Item") },
        unit_amount: Math.max(0, Math.round(Number(it.price || 0) * 100)),
      },
      quantity: Math.max(1, Number(it.quantity || 1)),
    }));

    const metadata: any = { referralCode: referralCode || "" };
    let draftOrderId: string | null = null;
    let createdSessionId: string | null = null;

    if (orderId) {
      // Existing order (retry payment)
      metadata.orderId = String(orderId);
    } else if (orderData) {
      let guestId = req.cookies?.guestId || null;
      if (!guestId) {
        guestId = `guest_${randomUUID()}`;
        res.cookie("guestId", guestId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: GUEST_COOKIE_MAX_AGE,
        });
      }

      const draftOrder = await createPendingOrderFromCheckout({
        orderData,
        selectedShippingRate,
        customerEmail,
        guestId,
      });

      draftOrderId = draftOrder.id;
      metadata.orderId = draftOrder.id;
    }

    const hasPreCollectedAddress = Boolean(
      normalizeStoredShippingAddress(orderData?.shippingAddress)?.street1
    );
    const baseSuccessUrl =
      successUrl ||
      `${process.env.CLIENT_URL}/orders/success?session_id={CHECKOUT_SESSION_ID}`;
    const finalSuccessUrl = metadata.orderId
      ? appendQueryParam(baseSuccessUrl, "order", String(metadata.orderId))
      : baseSuccessUrl;

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"], // Only accept credit/debit cards
        line_items,
        success_url: finalSuccessUrl,
        cancel_url: cancelUrl || `${process.env.CLIENT_URL}/cart`,
        metadata,
        billing_address_collection: "required",
        payment_intent_data: {
          metadata: {
            referralCode: referralCode || "",
            ...(metadata.orderId ? { orderId: String(metadata.orderId) } : {}),
          },
        },
        // Only collect shipping address if not pre-collected on frontend
        ...(hasPreCollectedAddress
          ? {}
          : {
              shipping_address_collection: {
                allowed_countries: ["US", "CA", "GB", "AU"],
              },
              phone_number_collection: {
                enabled: true,
              },
            }),
        // No shipping options - shipping is included as a line item
      });

      createdSessionId = session.id;

      if (draftOrderId) {
        try {
          await prisma.order.update({
            where: { id: draftOrderId },
            data: {
              stripeSessionId: session.id,
            },
          });
        } catch (updateError) {
          console.error(
            "⚠️ Checkout session created, but failed to persist session id on draft order:",
            updateError
          );
        }
      }

      return res.json({ url: session.url, orderId: metadata.orderId || null });
    } catch (sessionError) {
      if (draftOrderId && !createdSessionId) {
        try {
          await prisma.order.delete({
            where: { id: draftOrderId },
          });
        } catch (cleanupError) {
          console.error("⚠️ Failed to clean up draft order:", cleanupError);
        }
      }

      throw sessionError;
    }
  } catch (err) {
    console.error("Stripe session error:", err);
    return res
      .status(500)
      .json({ message: "Failed to create checkout session" });
  }
});

router.post("/retry-payment", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    const { orderId, successUrl, cancelUrl } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    // Fetch the existing order with its items
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: true,
      },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if order payment is actually failed
    if (order.paymentStatus !== "failed") {
      return res.status(400).json({
        message: "Can only retry payment for failed orders",
        currentStatus: order.paymentStatus,
      });
    }

    // Convert order items to Stripe line items
    const line_items = order.orderItems.map((item: any) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: String(item.productName || item.productId || "Item"),
          description: item.isCustomPack
            ? `Custom 3-Pack: ${item.flavorIds?.join(", ") || "Custom flavors"}`
            : undefined,
        },
        unit_amount: Math.max(0, Math.round(Number(item.price || 0) * 100)),
      },
      quantity: Math.max(1, Number(item.quantity || 1)),
    }));

    // Create new Stripe checkout session
    const retrySuccessUrl = appendQueryParam(
      successUrl ||
        `${process.env.CLIENT_URL}/orders/success?session_id={CHECKOUT_SESSION_ID}`,
      "order",
      String(orderId)
    );

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"], // Only accept credit/debit cards
      line_items,
      success_url: retrySuccessUrl,
      cancel_url: cancelUrl || `${process.env.CLIENT_URL}/profile`,
      metadata: {
        orderId: String(orderId),
        isRetry: "true",
      },
      payment_intent_data: {
        metadata: {
          orderId: String(orderId),
          isRetry: "true",
        },
      },
      billing_address_collection: "required",
      shipping_address_collection: {
        allowed_countries: ["US", "CA", "GB", "AU"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            display_name: "Standard Shipping",
            type: "fixed_amount",
            fixed_amount: { amount: 0, currency: "usd" },
          },
        },
      ],
      phone_number_collection: {
        enabled: true,
      },
    });

    // Update order status to pending while payment is being retried
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "pending",
        updatedAt: new Date(),
      },
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("Payment retry error:", err);
    return res
      .status(500)
      .json({ message: "Failed to create retry payment session" });
  }
});

// Verify payment status for stuck payments
router.post("/verify-payment-status", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    // Get order from database
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // If payment has been pending for more than 1 hour, check with Stripe
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (order.paymentStatus === "pending" && order.updatedAt < oneHourAgo) {
      // Search for recent checkout sessions for this order
      const sessions = await stripe.checkout.sessions.list({
        limit: 10,
      });

      const orderSession = sessions.data.find(
        (session) => session.metadata?.orderId === orderId
      );

      if (orderSession) {
        if (orderSession.payment_status === "paid") {
          const fullSession = await stripe.checkout.sessions.retrieve(
            orderSession.id,
            {
              expand: ["line_items", "payment_intent"],
            }
          );

          const finalizedOrder = await finalizeExistingCheckoutOrder(
            fullSession,
            "verify_payment_status"
          );

          return res.json({
            message: "Payment status updated to paid",
            paymentStatus: finalizedOrder.paymentStatus,
            fixed: true,
            orderId: finalizedOrder.orderId,
          });
        } else if (orderSession.payment_status === "unpaid") {
          // Payment failed or was cancelled
          await prisma.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: "failed",
              updatedAt: new Date(),
            },
          });

          return res.json({
            message: "Payment status updated to failed",
            paymentStatus: "failed",
            fixed: true,
          });
        }
      } else {
        // No session found, likely expired - mark as failed
        await prisma.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: "failed",
            updatedAt: new Date(),
          },
        });

        return res.json({
          message: "No payment session found, marked as failed",
          paymentStatus: "failed",
          fixed: true,
        });
      }
    }

    return res.json({
      message: "Payment status is current",
      paymentStatus: order.paymentStatus,
      fixed: false,
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(500).json({ message: "Failed to verify payment status" });
  }
});

router.post("/confirm-session/:sessionId", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ message: "Session ID is required" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "payment_intent"],
    });

    if (session.payment_status !== "paid") {
      return res.status(202).json({
        message: "Payment is still processing",
        paymentStatus: session.payment_status,
        orderId: session.metadata?.orderId || null,
      });
    }

    if (!session.metadata?.orderId) {
      return res.status(202).json({
        message:
          "Legacy checkout session detected. Webhook processing is still required.",
        paymentStatus: session.payment_status,
        orderId: null,
      });
    }

    const finalizedOrder = await finalizeExistingCheckoutOrder(
      session,
      "success_page_confirmation"
    );

    return res.json({
      message: finalizedOrder.alreadyPaid
        ? "Order already confirmed"
        : "Order confirmed successfully",
      orderId: finalizedOrder.orderId,
      paymentStatus: finalizedOrder.paymentStatus,
      status: finalizedOrder.status,
      alreadyPaid: finalizedOrder.alreadyPaid,
    });
  } catch (error: any) {
    console.error("Confirm session error:", error);
    const statusCode = error?.statusCode || 500;
    return res.status(statusCode).json({
      message: error?.message || "Failed to confirm checkout session",
    });
  }
});

// Stripe webhook handler
router.post("/webhook", async (req, res) => {
  const webhookStartTime = Date.now();
  console.log("🔔 Webhook received:", {
    timestamp: new Date().toISOString(),
    headers: {
      "stripe-signature": req.headers["stripe-signature"]
        ? "present"
        : "missing",
      "content-type": req.headers["content-type"],
      "user-agent": req.headers["user-agent"],
    },
    bodySize: req.body ? Buffer.byteLength(req.body) : 0,
    ip: req.ip,
    method: req.method,
    url: req.originalUrl,
  });

  const stripe = getStripe();
  if (!stripe) {
    console.error("❌ Stripe not configured");
    return res.status(503).send("Stripe not configured");
  }

  const sig = req.headers["stripe-signature"] as string | undefined;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  console.log("🔐 Webhook security check:", {
    hasSignature: !!sig,
    hasSecret: !!webhookSecret,
    secretLength: webhookSecret ? webhookSecret.length : 0,
    secretPrefix: webhookSecret
      ? webhookSecret.substring(0, 10) + "..."
      : "none",
  });

  if (!sig || !webhookSecret) {
    console.error("❌ Missing webhook signature or secret", {
      hasSignature: !!sig,
      hasSecret: !!webhookSecret,
    });
    return res.status(400).send("Missing webhook signature or secret");
  }

  let event: Stripe.Event | undefined;
  try {
    console.log("🔍 Verifying webhook signature...");
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log("✅ Webhook event verified successfully:", {
      type: event.type,
      id: event.id,
      created: new Date(event.created * 1000).toISOString(),
      livemode: event.livemode,
      apiVersion: event.api_version,
    });
  } catch (err: any) {
    console.error("❌ Webhook signature verification failed:", {
      error: err.message,
      type: err.type,
      detail: err.detail,
      headers: err.headers,
      requestId: err.requestId,
      statusCode: err.statusCode,
      userMessage: err.userMessage,
      header: sig,
      payload: req.body?.toString(),
    });
    return res.status(400).send("Webhook Error");
  }

  if (!event) {
    return res.status(400).send("Event not verified");
  }

  // ACKNOWLEDGE STRIPE IMMEDIATELY
  res.status(200).json({ received: true });

  // Process in background
  (async () => {
    try {
      // Check if event already processed
      const existingEvent = await prisma.stripeEvent.findUnique({
        where: { id: event.id },
      });

      if (existingEvent) {
        console.log(`ℹ️ Stripe event ${event.id} already processed. Skipping.`);
        return;
      }

      // Record event before processing to ensure idempotency
      await prisma.stripeEvent.create({
        data: {
          id: event.id,
          type: event.type,
        },
      });

      console.log(`🎯 Processing webhook event: ${event.type}`);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // Retrieve the full session to get shipping details
      // The webhook event payload doesn't include shipping_details by default
      const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items", "payment_intent"],
      });

      const orderId = fullSession.metadata?.orderId;
      const isRetry = fullSession.metadata?.isRetry === "true";

      console.log("💳 Processing checkout.session.completed:", {
        sessionId: fullSession.id,
        orderId,
        isRetry,
        paymentStatus: fullSession.payment_status,
        amountTotal: fullSession.amount_total,
        currency: fullSession.currency,
        customerEmail: fullSession.customer_details?.email,
        paymentIntentId: fullSession.payment_intent,
        hasShippingDetails: !!(fullSession as any).shipping_details,
        hasShippingCost: !!(fullSession as any).shipping_cost,
      });

      if (orderId) {
        const finalizedOrder = await finalizeExistingCheckoutOrder(
          fullSession,
          "stripe_webhook"
        );

        console.log("✅ Existing checkout order finalized:", {
          orderId: finalizedOrder.orderId,
          status: finalizedOrder.status,
          paymentStatus: finalizedOrder.paymentStatus,
          alreadyPaid: finalizedOrder.alreadyPaid,
          processingTime: Date.now() - webhookStartTime + "ms",
        });
      } else if (fullSession.metadata?.orderData) {
        // Create new order from metadata (ONLY after successful payment)
        console.log(
          "🆕 Creating order from payment metadata - PAYMENT SUCCESSFUL"
        );

        try {
          const compressedData = JSON.parse(fullSession.metadata.orderData);
          const customerEmail = fullSession.customer_details?.email;

          if (!customerEmail) {
            console.error("❌ No customer email in session");
            return;
          }

          // Find user by email (optional for guest checkout)
          const user = await prisma.user.findUnique({
            where: { email: customerEmail },
          });

          if (!user) {
            console.log(
              "ℹ️ User not found, creating guest order for email:",
              customerEmail
            );
          }

          // Get shipping address - either from metadata or Stripe-collected details
          let shippingAddressData;

          if (compressedData.address && compressedData.address.name) {
            // Address was provided in metadata
            shippingAddressData = {
              name: compressedData.address.name,
              email: compressedData.address.email,
              phone: compressedData.address.phone,
              street1: compressedData.address.street,
              city: compressedData.address.city,
              state: compressedData.address.state,
              zip: compressedData.address.zip,
              country: compressedData.address.country,
            };
          } else {
            // Address was collected by Stripe - extract from fullSession
            const sessionAny = fullSession as any; // Cast to access shipping_details
            const stripeShipping =
              sessionAny.shipping_details || sessionAny.shipping;
            const stripeCustomer = fullSession.customer_details;

            if (!stripeShipping || !stripeShipping.address) {
              console.error("❌ No shipping address found in session:", {
                hasShippingDetails: !!sessionAny.shipping_details,
                hasShipping: !!sessionAny.shipping,
                hasCustomerDetails: !!session.customer_details,
              });
              throw new Error("Shipping address not found in Stripe session");
            }

            // Combine address lines if line2 exists
            const street = stripeShipping.address.line2
              ? `${stripeShipping.address.line1}, ${stripeShipping.address.line2}`
              : stripeShipping.address.line1 || "";

            shippingAddressData = {
              name: stripeShipping.name || stripeCustomer?.name || "",
              email: stripeCustomer?.email || customerEmail,
              phone: stripeCustomer?.phone || stripeShipping.phone || "",
              street1: street,
              city: stripeShipping.address.city || "",
              state: stripeShipping.address.state || "",
              zip: stripeShipping.address.postal_code || "",
              country: stripeShipping.address.country || "",
            };

            console.log(
              "📍 Extracted shipping address from Stripe:",
              shippingAddressData
            );
          }

          // Reconstruct full order data from compressed format
          const orderItems: any[] = [];

          compressedData.items.forEach((item: any) => {
            // Handle ultra-compressed format (p, q, pr, t) or regular format (pack, qty, price, total)
            const isUltraCompressed = item.p !== undefined;
            const packType = isUltraCompressed ? item.p : item.pack;
            const quantity = isUltraCompressed ? item.q : item.qty;
            const price = isUltraCompressed ? item.pr : item.price;
            const total = isUltraCompressed ? item.t : item.total;

            if (packType === "platinum" || packType === "plat") {
              // This is a Platinum pack - expand to 4 variations
              const variationsPerPack = 4;
              const pricePerVariation = price / variationsPerPack;
              const totalPerVariation = total / variationsPerPack;

              // Create 4 items for the 4 variations
              for (let i = 0; i < variationsPerPack; i++) {
                orderItems.push({
                  productId: null, // Pack products don't have a single productId
                  quantity: quantity,
                  price: pricePerVariation,
                  total: totalPerVariation,
                  flavorIds: [],
                  customPackName: "12 Pack Best Seller and Classic Platinum",
                  variationId: item.vids && item.vids[i] ? item.vids[i] : null,
                });
              }
            } else if (packType === "gold") {
              // This is a Gold pack - expand to 2 variations
              const variationsPerPack = 2;
              const pricePerVariation = price / variationsPerPack;
              const totalPerVariation = total / variationsPerPack;

              // Create 2 items for the 2 variations
              for (let i = 0; i < variationsPerPack; i++) {
                orderItems.push({
                  productId: null,
                  quantity: quantity,
                  price: pricePerVariation,
                  total: totalPerVariation,
                  flavorIds: [],
                  customPackName: "7 Pack Sweet and Sour collection Gold",
                  variationId: item.vids && item.vids[i] ? item.vids[i] : null,
                });
              }
            } else {
              // Regular item
              orderItems.push({
                productId: isUltraCompressed ? item.pid : item.pid,
                quantity: quantity,
                price: price,
                total: total,
                flavorIds: isUltraCompressed
                  ? item.f || []
                  : item.flavors || [],
                customPackName: isUltraCompressed
                  ? item.c
                  : item.custom || null,
                variationId: isUltraCompressed ? item.vid : item.vid || null,
              });
            }
          });

          const orderData = {
            total: compressedData.total,
            orderNotes: compressedData.notes,
            orderItems: orderItems,
            shippingAddress: shippingAddressData,
          };

          // Validate variationIds before creating order
          const validatedOrderItems = await Promise.all(
            orderData.orderItems.map(async (item: any) => {
              let validVariationId = null;

              // If variationId is provided, verify it exists in the database
              if (item.variationId) {
                try {
                  const variation = await prisma.productVariation.findUnique({
                    where: { id: item.variationId },
                    select: { id: true },
                  });

                  if (variation) {
                    validVariationId = item.variationId;
                  } else {
                    console.warn(
                      `⚠️ Variation ${item.variationId} not found in database, skipping variationId`
                    );
                  }
                } catch (err) {
                  console.error(
                    `❌ Error validating variationId ${item.variationId}:`,
                    err
                  );
                }
              }

              return {
                productId: item.productId,
                quantity: item.quantity,
                price: item.price,
                total: item.total,
                flavorIds: item.flavorIds || [],
                customPackName: item.customPackName || null,
                variationId: validVariationId, // Only include if valid
              };
            })
          );

          // Create order with confirmed status and paid payment status
          // Support both registered users and guest checkout
          const newOrder = await prisma.order.create({
            data: {
              userId: user?.id || null, // NULL for guest checkout
              guestId: user ? null : `guest_${customerEmail}`, // Guest ID if no user
              guestEmail: user ? null : customerEmail, // Guest email if no user
              status: "confirmed",
              paymentStatus: "paid",
              stripeSessionId: session.id,
              total: orderData.total,
              shippingAddress: orderData.shippingAddress,
              orderNotes: orderData.orderNotes,
              orderItems: {
                create: validatedOrderItems,
              },
            },
            include: {
              orderItems: {
                include: {
                  variation: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          });

          console.log("✅ Order created from payment:", {
            orderId: newOrder.id,
            status: newOrder.status,
            paymentStatus: newOrder.paymentStatus,
            total: newOrder.total,
            itemsCount: newOrder.orderItems.length,
            isGuestOrder: !user,
            customerEmail: customerEmail,
          });

          // Log order items details for debugging
          console.log("📋 Order items details:");
          newOrder.orderItems.forEach((item, index) => {
            console.log(
              `   ${index + 1}. ProductID: ${item.productId}, Qty: ${
                item.quantity
              }, FlavorIDs: ${JSON.stringify(item.flavorIds)}`
            );
          });

          // Decrement inventory for the order
          console.log("📦 Decrementing inventory for order items...");
          console.log(
            `   Total items to process: ${newOrder.orderItems.length}`
          );

          for (const item of newOrder.orderItems) {
            console.log(
              `\n   Processing item: ${JSON.stringify({
                productId: item.productId,
                quantity: item.quantity,
                flavorIds: item.flavorIds,
                isCustomPack: !item.productId,
              })}`
            );

            try {
              // For custom pack products (null productId), we need to deduct from flavor inventory
              if (
                !item.productId &&
                item.flavorIds &&
                item.flavorIds.length > 0
              ) {
                console.log(
                  `   → Custom Pack detected (null productId), processing ${item.flavorIds.length} flavors...`
                );
                // Handle custom packs - decrement flavor inventory
                for (const flavorId of item.flavorIds) {
                  const flavorBefore = await prisma.flavorInventory.findUnique({
                    where: { flavorId },
                    select: { onHand: true, reserved: true, flavorId: true },
                  });
                  console.log(
                    `   → Flavor ${flavorId} before: onHand=${flavorBefore?.onHand}, reserved=${flavorBefore?.reserved}`
                  );

                  await prisma.flavorInventory.update({
                    where: { flavorId },
                    data: {
                      onHand: { decrement: item.quantity },
                      reserved: { decrement: item.quantity },
                    },
                  });

                  const flavorAfter = await prisma.flavorInventory.findUnique({
                    where: { flavorId },
                    select: { onHand: true, reserved: true },
                  });
                  console.log(
                    `   ✓ Flavor ${flavorId} after: onHand=${flavorAfter?.onHand}, reserved=${flavorAfter?.reserved}`
                  );
                }
              } else if (item.productId) {
                console.log(`   → Regular Product detected, updating stock...`);
                // Handle regular products - decrement product stock
                const productBefore = await prisma.product.findUnique({
                  where: { id: item.productId },
                  select: { id: true, name: true, stock: true },
                });
                console.log(
                  `   → Product BEFORE: ${JSON.stringify(productBefore)}`
                );

                if (!productBefore) {
                  console.error(
                    `   ❌ Product ${item.productId} not found in database!`
                  );
                  continue;
                }

                const updatedProduct = await prisma.product.update({
                  where: { id: item.productId },
                  data: {
                    stock: { decrement: item.quantity },
                  },
                  select: { id: true, name: true, stock: true },
                });
                console.log(
                  `   ✓ Product AFTER: ${JSON.stringify(updatedProduct)}`
                );
                console.log(
                  `   ✓ Stock decreased from ${productBefore.stock} to ${updatedProduct.stock}`
                );
              }
            } catch (invError) {
              console.error(
                `   ❌ Error updating inventory for item ${item.id}:`,
                invError
              );
              console.error(
                `   ❌ Error details:`,
                invError instanceof Error ? invError.message : invError
              );
              // Continue with other items even if one fails
            }
          }
          console.log("\n✅ Inventory decrementation complete");

          // Create Shippo shipment for the new order FIRST
          let shippingDetails: any = undefined;
          try {
            const { getShippingRates, createShipment } = await import(
              "../services/shippoService"
            );

            console.log("🔍 Getting shipping rates for address:", {
              name: orderData.shippingAddress.name,
              street1: orderData.shippingAddress.street1,
              city: orderData.shippingAddress.city,
              state: orderData.shippingAddress.state,
              zip: orderData.shippingAddress.zip,
              country: orderData.shippingAddress.country,
            });

            // Check if pre-selected shipping rate exists in metadata
            console.log("🔍 Checking for pre-selected rate in metadata:", {
              hasShippingRate: !!compressedData.shippingRate,
              shippingRateData: compressedData.shippingRate,
              fullCompressedData: JSON.stringify(compressedData, null, 2),
            });

            const preSelectedRate = compressedData.shippingRate;
            let selectedRate;
            let isFlatRateShipping = false;
            let flatRateCost = 0;

            if (preSelectedRate && preSelectedRate.objectId) {
              // Check if this is a flat-rate shipping (starts with "flat-rate-")
              isFlatRateShipping =
                preSelectedRate.objectId.startsWith("flat-rate-");

              if (isFlatRateShipping) {
                // Store flat-rate cost (customer already paid this)
                flatRateCost = preSelectedRate.amount || 0;
                console.log(
                  "📦 Flat-rate shipping detected, will use Shippo rates for tracking only:",
                  {
                    flatRateCost: flatRateCost,
                    flatRateId: preSelectedRate.objectId,
                    carrier: preSelectedRate.carrier,
                    serviceName: preSelectedRate.serviceName,
                  }
                );

                // Get real Shippo rates for actual shipment creation (for tracking)
                console.log(
                  "⚠️ Getting Shippo rates for actual shipment tracking..."
                );
                const shippoRates = await getShippingRates(
                  orderData.shippingAddress as any,
                  [
                    {
                      length: "6",
                      width: "4",
                      height: "2",
                      weight: "0.5",
                      massUnit: "lb" as const,
                      distanceUnit: "in" as const,
                    },
                  ]
                );

                if (shippoRates.length > 0) {
                  // Use the first Shippo rate for actual shipment (just for tracking)
                  // But we'll store the flat-rate cost the customer paid
                  selectedRate = shippoRates[0];
                  console.log("✅ Using Shippo rate for tracking:", {
                    carrier: selectedRate.carrier,
                    serviceName: selectedRate.serviceName,
                    amount: selectedRate.amount,
                  });
                } else {
                  console.log(
                    "⚠️ No Shippo rates available, skipping shipment creation"
                  );
                  selectedRate = null;
                }
              } else {
                // Regular Shippo rate - use as is
                console.log(
                  "✅ Using pre-selected shipping rate from frontend:",
                  {
                    carrier: preSelectedRate.carrier,
                    amount: preSelectedRate.amount,
                    serviceName: preSelectedRate.serviceName,
                    objectId: preSelectedRate.objectId,
                  }
                );
                selectedRate = preSelectedRate;
                flatRateCost = preSelectedRate.amount || 0;
              }
            } else {
              // Fallback: Calculate shipping rates (old behavior)
              console.log("⚠️ No pre-selected rate, calculating shipping...");
              const rates = await getShippingRates(
                orderData.shippingAddress as any,
                [
                  {
                    length: "6",
                    width: "4",
                    height: "2",
                    weight: "0.5",
                    massUnit: "lb" as const,
                    distanceUnit: "in" as const,
                  },
                ]
              );

              console.log("📊 Shippo rates response:", {
                ratesCount: rates.length,
                rates: rates.map((r) => ({
                  serviceName: r.serviceName,
                  carrier: r.carrier,
                  amount: r.amount,
                  estimatedDays: r.estimatedDays,
                })),
              });

              if (rates.length === 0) {
                console.log("⚠️ No shipping rates available");
                selectedRate = null;
              } else {
                selectedRate = rates[0];
              }
            }

            if (selectedRate && !isFlatRateShipping) {
              // Regular Shippo shipment - create with actual rate
              const shipmentResult = await createShipment(
                {
                  orderId: newOrder.id,
                  toAddress: orderData.shippingAddress as any,
                  parcels: [
                    {
                      length: "6",
                      width: "4",
                      height: "2",
                      weight: "0.5",
                      massUnit: "lb" as const,
                      distanceUnit: "in" as const,
                    },
                  ],
                },
                selectedRate.objectId,
                {
                  carrier: selectedRate.carrier,
                  amount: selectedRate.amount,
                  serviceName: selectedRate.serviceName,
                }
              );
            } else if (selectedRate && isFlatRateShipping) {
              // Flat-rate shipping - create Shippo shipment but store flat-rate cost
              const shipmentResult = await createShipment(
                {
                  orderId: newOrder.id,
                  toAddress: orderData.shippingAddress as any,
                  parcels: [
                    {
                      length: "6",
                      width: "4",
                      height: "2",
                      weight: "0.5",
                      massUnit: "lb" as const,
                      distanceUnit: "in" as const,
                    },
                  ],
                },
                selectedRate.objectId,
                {
                  carrier: selectedRate.carrier,
                  amount: flatRateCost, // Use flat-rate cost customer paid, not Shippo rate
                  serviceName:
                    preSelectedRate?.serviceName || selectedRate.serviceName,
                }
              );

              // Update order with flat-rate cost (override Shippo's cost)
              await prisma.order.update({
                where: { id: newOrder.id },
                data: {
                  shippingCost: flatRateCost, // Store the flat-rate cost customer paid
                },
              });
            }

            // Fetch shipment details for email (if shipment was created)
            let shippingDetails: any = undefined;
            if (selectedRate) {
              console.log("📦 Shippo shipment created for new order");

              // Fetch the updated order with shipment details
              const orderWithShipment = await prisma.order.findUnique({
                where: { id: newOrder.id },
                select: {
                  trackingNumber: true,
                  trackingUrl: true,
                  shippingCarrier: true,
                  shippingCost: true,
                },
              });

              if (orderWithShipment) {
                // IMPORTANT: Use the rate that customer SELECTED and PAID FOR
                const customerPaidShippingCost = isFlatRateShipping
                  ? flatRateCost
                  : preSelectedRate?.amount || selectedRate.amount;

                shippingDetails = {
                  trackingNumber: orderWithShipment.trackingNumber,
                  trackingUrl: orderWithShipment.trackingUrl,
                  carrier: orderWithShipment.shippingCarrier,
                  shippingCost: customerPaidShippingCost, // Use customer-selected/flat rate
                };

                console.log("📦 Shipping details prepared for email:", {
                  ...shippingDetails,
                  note: preSelectedRate
                    ? "Using customer-selected rate"
                    : "Using calculated rate",
                });
              }
            } else {
              console.log(
                "⚠️ No shipping rate available, skipping shipment creation"
              );
            }
          } catch (shipmentError) {
            console.error(
              "⚠️ Failed to create Shippo shipment:",
              shipmentError
            );
            // Don't fail the webhook for shipment errors
          }

          // Send order confirmation email with shipping details
          try {
            // Fetch product names for order items with variation details
            const itemsWithNames = await Promise.all(
              newOrder.orderItems.map(async (item: any) => {
                // Check if this is a pack product (has customPackName and null productId)
                if (!item.productId && item.customPackName) {
                  // This is a pack product - determine packSize from customPackName
                  let packSize: number | null = null;
                  let variationName: string | null = null;

                  if (item.customPackName.includes("Platinum")) {
                    // Platinum pack: all items are 3-pack
                    packSize = 3;
                  } else if (item.customPackName.includes("Gold")) {
                    // Gold pack: need to determine if 3-pack or 4-pack from variation
                    packSize = null; // Will be determined from variation
                  }

                  // Fetch variation name if variationId is available
                  if (item.variationId) {
                    try {
                      const variation =
                        await prisma.productVariation.findUnique({
                          where: { id: item.variationId },
                          select: {
                            name: true,
                            product: {
                              select: { packSize: true },
                            },
                          },
                        });
                      variationName = variation?.name || null;

                      // For Gold pack, determine packSize from variation's product
                      if (!packSize && variation?.product?.packSize) {
                        packSize = variation.product.packSize;
                      }
                    } catch (variationErr) {
                      console.error(
                        `Error fetching variation for pack product ${item.variationId}:`,
                        variationErr
                      );
                    }
                  }

                  return {
                    name: item.customPackName,
                    quantity: item.quantity,
                    price: item.price,
                    variationName: variationName,
                    productName: item.customPackName,
                    packSize: packSize,
                    variationId: item.variationId || null,
                  };
                }

                // Check if this is a pack product (has customPackName and null productId)
                if (!item.productId && item.customPackName) {
                  // This is a pack product - determine packSize from customPackName
                  let packSize: number | null = null;
                  let variationName: string | null = null;

                  if (item.customPackName.includes("Platinum")) {
                    // Platinum pack: all items are 3-pack
                    packSize = 3;
                  } else if (item.customPackName.includes("Gold")) {
                    // Gold pack: need to determine if 3-pack or 4-pack from variation
                    // We'll determine this from the variation if available
                    packSize = null; // Will be determined from variation
                  }

                  // Fetch variation name if variationId is available
                  if (item.variationId) {
                    try {
                      const variation =
                        await prisma.productVariation.findUnique({
                          where: { id: item.variationId },
                          select: { name: true },
                        });
                      variationName = variation?.name || null;

                      // For Gold pack, determine packSize from variation's product
                      if (!packSize && item.variationId) {
                        const variationWithProduct =
                          await prisma.productVariation.findUnique({
                            where: { id: item.variationId },
                            select: {
                              product: {
                                select: { packSize: true },
                              },
                            },
                          });
                        packSize =
                          variationWithProduct?.product?.packSize || null;
                      }
                    } catch (variationErr) {
                      console.error(
                        `Error fetching variation for pack product ${item.variationId}:`,
                        variationErr
                      );
                    }
                  }

                  return {
                    name: item.customPackName,
                    quantity: item.quantity,
                    price: item.price,
                    variationName: variationName,
                    productName: item.customPackName,
                    packSize: packSize,
                    variationId: item.variationId || null,
                  };
                }

                // Regular product - fetch from database
                try {
                  const product = await prisma.product.findUnique({
                    where: { id: item.productId },
                    select: {
                      name: true,
                      packSize: true,
                      isPackProduct: true,
                      packType: true,
                    },
                  });

                  // Use variation from included relation or fetch separately
                  let variationName = null;
                  if (item.variation?.name) {
                    variationName = item.variation.name;
                  } else if (item.variationId) {
                    try {
                      const variation =
                        await prisma.productVariation.findUnique({
                          where: { id: item.variationId },
                          select: { name: true },
                        });
                      variationName = variation?.name || null;
                    } catch (variationErr) {
                      console.error(
                        `Error fetching variation name for ${item.variationId}:`,
                        variationErr
                      );
                    }
                  }

                  const productName =
                    product?.name || `Product #${item.productId}`;

                  // Debug logging for pack products
                  if (product?.packSize === 3 || product?.packSize === 4) {
                    console.log(
                      `📦 Pack product item: ${productName}, Variation: ${
                        variationName || "None"
                      }, PackSize: ${product?.packSize}`
                    );
                  }

                  return {
                    name: productName,
                    quantity: item.quantity,
                    price: item.price,
                    variationName: variationName,
                    productName: productName,
                    packSize: product?.packSize || null,
                    variationId: item.variationId || null, // Include variationId for reference
                  };
                } catch (err) {
                  console.error(
                    `Error fetching product name for ${item.productId}:`,
                    err
                  );
                  return {
                    name: `Product #${item.productId}`,
                    quantity: item.quantity,
                    price: item.price,
                    variationName: null,
                    productName: null,
                    packSize: null,
                  };
                }
              })
            );

            // Group pack product items together intelligently
            // Strategy: Group items by quantity and pack size to identify pack products
            // For Gold: 2 items (one 3-pack + one 4-pack) with same quantity
            // For Platinum: 4 items (all 3-pack variations: Sweet Best Sellers, Sweet Classics, Sour Best Sellers, Sour Classics) with same quantity
            const groupedItems: any[] = [];
            const processed = new Set<number>();

            console.log(
              "📋 Starting pack product grouping. Total items:",
              itemsWithNames.length
            );

            // Group items by quantity to find pack products
            const itemsByQuantity = new Map<number, any[]>();
            itemsWithNames.forEach((item: any, index: number) => {
              if (!itemsByQuantity.has(item.quantity)) {
                itemsByQuantity.set(item.quantity, []);
              }
              itemsByQuantity.get(item.quantity)!.push({ item, index });
            });

            // Process each quantity group
            itemsByQuantity.forEach((itemsWithIndices, quantity) => {
              // Filter to only pack-size items
              // Include all pack-size items (packSize 3 or 4), even if variationName is missing
              const packItems = itemsWithIndices.filter(
                ({ item }) => item.packSize === 3 || item.packSize === 4
              );

              // Log pack items for debugging
              if (packItems.length > 0) {
                console.log(
                  `📦 Found ${packItems.length} pack items for quantity ${quantity}:`,
                  packItems.map(({ item }) => ({
                    packSize: item.packSize,
                    variationName: item.variationName || "NO VARIATION",
                    variationId: item.variationId || "NO VARIATION ID",
                    productName: item.productName || item.name,
                  }))
                );
              }

              if (packItems.length === 0) {
                // No pack items, add all items individually
                itemsWithIndices.forEach(({ item, index }) => {
                  if (!processed.has(index)) {
                    groupedItems.push(item);
                    processed.add(index);
                  }
                });
                return;
              }

              // Separate items by pack size
              const threePackItems = packItems.filter(
                ({ item }) => item.packSize === 3
              );
              const fourPackItems = packItems.filter(
                ({ item }) => item.packSize === 4
              );

              // Check for Gold pack: has both 3-pack and 4-pack items (can have multiple variations each)
              if (threePackItems.length > 0 && fourPackItems.length > 0) {
                // Gold 7-pack! Group all 3-pack and 4-pack items together
                const allGoldItems = [...threePackItems, ...fourPackItems];
                allGoldItems.forEach(({ index }) => processed.add(index));

                const totalPrice = allGoldItems.reduce(
                  (sum, { item }) => sum + item.price * quantity,
                  0
                );

                const goldPackItem = {
                  name: "7 Pack Sweet and Sour collection Gold",
                  quantity: quantity,
                  price: totalPrice / quantity,
                  variationName: null,
                  productName: "7 Pack Sweet and Sour collection Gold",
                  packItems: allGoldItems.map(({ item }) => ({
                    name: item.productName || item.name,
                    variation: item.variationName || "No variation",
                    variationName: item.variationName || "No variation", // Add variationName for email template
                    packSize: item.packSize,
                    price: item.price,
                  })),
                  isPack: true,
                };

                groupedItems.push(goldPackItem);

                console.log(
                  `✅ Grouped Gold 7-pack (Qty: ${quantity}) with ${allGoldItems.length} variations:`,
                  allGoldItems
                    .map(
                      ({ item }) =>
                        `${item.packSize}-Pack: ${
                          item.variationName || "NO VARIATION"
                        }`
                    )
                    .join(", ")
                );
                console.log(
                  `📦 Gold pack packItems:`,
                  JSON.stringify(goldPackItem.packItems, null, 2)
                );
                return;
              }

              // Check for Platinum pack: only 3-pack items (should be 4 variations: Sweet Best Sellers, Sweet Classics, Sour Best Sellers, Sour Classics)
              if (threePackItems.length > 0 && fourPackItems.length === 0) {
                // For Platinum, we expect 4 variations per pack
                // Calculate how many complete packs we have
                const variationsPerPack = 4;
                const totalVariations = threePackItems.length;
                const completePacks = Math.floor(
                  totalVariations / variationsPerPack
                );

                // Only group if we have at least one complete pack (4 variations)
                if (completePacks > 0) {
                  // Group variations into complete packs
                  for (
                    let packIndex = 0;
                    packIndex < completePacks;
                    packIndex++
                  ) {
                    const packVariations = threePackItems.slice(
                      packIndex * variationsPerPack,
                      (packIndex + 1) * variationsPerPack
                    );

                    // Mark all variations in this pack as processed
                    packVariations.forEach(({ index }) => processed.add(index));

                    // Calculate total price: sum of all variation prices * quantity
                    // Each variation has the same quantity, so we multiply by quantity
                    const totalPrice = packVariations.reduce(
                      (sum, { item }) => sum + item.price * quantity,
                      0
                    );

                    // For Platinum pack, quantity is the quantity of each variation
                    // (4 variations with qty=1 = 1 complete 12-pack)
                    // (4 variations with qty=2 = 2 complete 12-packs)
                    const platinumPackItem = {
                      name: "12 Pack Best Seller and Classic Platinum",
                      quantity: quantity, // Use the quantity from the grouped items
                      price: totalPrice / quantity, // Price per pack (total / quantity)
                      variationName: null,
                      productName: "12 Pack Best Seller and Classic Platinum",
                      packItems: packVariations.map(({ item }) => ({
                        name: item.productName || item.name,
                        variation: item.variationName || "No variation",
                        variationName: item.variationName || "No variation", // Add variationName for email template
                        packSize: 3,
                        price: item.price,
                      })),
                      isPack: true,
                    };

                    groupedItems.push(platinumPackItem);

                    console.log(
                      `✅ Grouped Platinum 12-pack #${
                        packIndex + 1
                      } (Qty: 1) with ${packVariations.length} variations:`,
                      packVariations
                        .map(({ item }) => item.variationName || "NO VARIATION")
                        .join(", ")
                    );
                  }

                  // If there are leftover variations that don't form a complete pack, add them individually
                  const remainingVariations = threePackItems.slice(
                    completePacks * variationsPerPack
                  );
                  if (remainingVariations.length > 0) {
                    console.warn(
                      `⚠️ Warning: ${remainingVariations.length} leftover 3-pack variations that don't form a complete Platinum pack. Adding individually.`
                    );
                    remainingVariations.forEach(({ item, index }) => {
                      if (!processed.has(index)) {
                        groupedItems.push(item);
                        processed.add(index);
                      }
                    });
                  }

                  return;
                } else {
                  // Not enough variations for a complete pack, add individually
                  console.warn(
                    `⚠️ Warning: Only ${totalVariations} 3-pack variations found, need ${variationsPerPack} for Platinum pack. Adding individually.`
                  );
                }
              }

              // If we get here, couldn't group as pack product, add individually
              packItems.forEach(({ item, index }) => {
                if (!processed.has(index)) {
                  groupedItems.push(item);
                  processed.add(index);
                }
              });
            });

            // Add remaining unprocessed items
            for (let i = 0; i < itemsWithNames.length; i++) {
              if (!processed.has(i)) {
                groupedItems.push(itemsWithNames[i]);
              }
            }

            console.log(`📦 Final grouped items count: ${groupedItems.length}`);
            groupedItems.forEach((item, idx) => {
              if (item.isPack && item.packItems) {
                console.log(
                  `   Pack item ${idx + 1}: ${item.name} (Qty: ${
                    item.quantity
                  }) with ${item.packItems.length} variations`
                );
                item.packItems.forEach((pi: any, pidx: number) => {
                  console.log(
                    `     Variation ${pidx + 1}: ${pi.packSize}-Pack - ${
                      pi.variation || "NO VARIATION"
                    }`
                  );
                });
              } else {
                console.log(
                  `   Regular item ${idx + 1}: ${item.name}${
                    item.variationName ? ` - ${item.variationName}` : ""
                  } (Qty: ${item.quantity})`
                );
              }
            });
            const finalItems = groupedItems;

            // Debug: Log final items before sending email
            console.log(
              `📧 Preparing to send email with ${finalItems.length} items`
            );
            console.log(
              `📧 Full finalItems array:`,
              JSON.stringify(finalItems, null, 2)
            );
            finalItems.forEach((item, idx) => {
              if (item.isPack && item.packItems) {
                console.log(
                  `   Email item ${idx + 1}: ${
                    item.name
                  } (isPack: true, packItems count: ${item.packItems.length})`
                );
                console.log(
                  `   📦 Full packItems for ${item.name}:`,
                  JSON.stringify(item.packItems, null, 2)
                );
                item.packItems.forEach((pi: any, pidx: number) => {
                  console.log(
                    `     Pack item ${pidx + 1}: ${
                      pi.packSize
                    }-Pack, variation="${pi.variation}", variationName="${
                      pi.variationName
                    }", name="${pi.name}"`
                  );
                });
              } else {
                console.log(
                  `   Email item ${idx + 1}: ${
                    item.name || item.productName
                  } (isPack: false, variationName: ${
                    item.variationName || "none"
                  })`
                );
              }
            });
            const emailShippingAddress = buildEmailShippingAddress(
              newOrder.shippingAddress,
              orderData.shippingAddress
            );

            await sendOrderConfirmationEmail(customerEmail, {
              orderId: newOrder.id,
              customerName: emailShippingAddress.name || "Customer",
              total: newOrder.total,
              items: finalItems,
              shippingAddress: emailShippingAddress,
              shippingDetails: shippingDetails,
            });
            console.log(
              "📧 Order confirmation email sent successfully with shipping details"
            );

            // Send admin order notification
            try {
              await sendAdminOrderNotification({
                orderId: newOrder.id,
                customerName: emailShippingAddress.name || "Customer",
                customerEmail: customerEmail,
                total: newOrder.total,
                items: finalItems,
                shippingAddress: emailShippingAddress,
                shippingDetails: shippingDetails,
              });
              console.log("📧 Admin order notification sent successfully");
            } catch (adminEmailError) {
              console.error(
                "❌ Error sending admin order notification:",
                adminEmailError
              );
              // Don't fail if admin email fails
            }
          } catch (emailError) {
            console.error(
              "❌ Error sending order confirmation email:",
              emailError
            );
            // Don't fail the order creation if email fails
          }

          return;
        } catch (parseError) {
          console.error("❌ Failed to parse order data:", parseError);
          return;
        }
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = (pi.metadata as any)?.orderId;

      console.log("💥 Processing payment_intent.payment_failed:", {
        paymentIntentId: pi.id,
        orderId,
        failureReason: pi.last_payment_error?.message,
      });

      // If this is an existing order (retry payment), mark it as failed
      if (orderId) {
        try {
          await prisma.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: "failed",
              updatedAt: new Date(),
            },
          });
          console.log("❌ Order marked as failed:", orderId);
        } catch (updateError) {
          console.error("❌ Failed to update order:", updateError);
        }
      } else {
        console.log(
          "ℹ️ No order to update - order was not created yet (as expected)"
        );
      }
    } else if (event.type === "payment_intent.succeeded") {
      // Handle mobile app payments (Payment Intent API)
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const orderId = paymentIntent.metadata?.orderId;
      const isRetry = paymentIntent.metadata?.isRetry === "true";
      const isMobile = paymentIntent.metadata?.source === "mobile";
      const orderDataString = paymentIntent.metadata?.orderData;

      console.log("📱 Processing payment_intent.succeeded (Mobile Payment):", {
        paymentIntentId: paymentIntent.id,
        orderId,
        isRetry,
        isMobile,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        hasOrderData: !!orderDataString,
      });

      // Retrieve full payment intent to get customer details
      const fullPaymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntent.id,
        {
          expand: ["customer", "payment_method"],
        }
      );

      if (orderId) {
        // Existing order (retry payment) - update payment status
        console.log(`🔍 Looking up order: ${orderId}`);
        const existingOrder = await prisma.order.findUnique({
          where: { id: orderId },
        });

        if (!existingOrder) {
          console.error("❌ Order not found for mobile payment:", orderId);
          return;
        }

        console.log("📋 Found existing order:", {
          orderId: existingOrder.id,
          currentStatus: existingOrder.status,
          currentPaymentStatus: existingOrder.paymentStatus,
        });

        const updateData: any = {
          paymentStatus: "paid",
          status: "confirmed",
          updatedAt: new Date(),
        };

        // Only update total if it's different
        if (
          paymentIntent.amount &&
          paymentIntent.amount !== Math.round(existingOrder.total * 100)
        ) {
          updateData.total = paymentIntent.amount / 100;
        }

        const updatedOrder = await prisma.order.update({
          where: { id: orderId },
          data: updateData,
        });

        console.log("✅ Mobile payment order updated successfully:", {
          orderId,
          oldStatus: existingOrder.status,
          newStatus: updatedOrder.status,
        });

        // Decrement inventory for retry payment (only if payment was previously pending/failed)
        if (existingOrder.paymentStatus !== "paid") {
          console.log("📦 Decrementing inventory for mobile retry payment...");
          const orderWithItems = await prisma.order.findUnique({
            where: { id: orderId },
            include: { orderItems: true },
          });

          if (orderWithItems) {
            for (const item of orderWithItems.orderItems) {
              try {
                if (!item.productId && item.flavorIds && item.flavorIds.length > 0) {
                  // Custom pack - decrement flavor inventory
                  for (const flavorId of item.flavorIds) {
                    await prisma.flavorInventory.update({
                      where: { flavorId },
                      data: {
                        onHand: { decrement: item.quantity },
                        reserved: { decrement: item.quantity },
                      },
                    });
                  }
                } else if (item.productId) {
                  // Regular product - decrement product stock
                  await prisma.product.update({
                    where: { id: item.productId },
                    data: {
                      stock: { decrement: item.quantity },
                    },
                  });
                }
              } catch (invError) {
                console.error(
                  `❌ Error updating inventory for item ${item.id}:`,
                  invError
                );
              }
            }
          }
        }

        // Create Shippo shipment and send emails (similar to webhook checkout.session.completed)
        // This code is similar to the retry payment section above
        let retryShippingDetails: any = undefined;
        if (!updatedOrder.shipmentId) {
          try {
            const { getShippingRates, createShipment } = await import(
              "../services/shippoService"
            );

            const shippingAddress = updatedOrder.shippingAddress as any;
            if (shippingAddress) {
              const rates = await getShippingRates(shippingAddress, [
                {
                  length: "6",
                  width: "4",
                  height: "2",
                  weight: "0.5",
                  massUnit: "lb" as const,
                  distanceUnit: "in" as const,
                },
              ]);

              if (rates.length > 0) {
                const selectedRate = rates[0];
                await createShipment(
                  {
                    orderId: updatedOrder.id,
                    toAddress: shippingAddress,
                    parcels: [
                      {
                        length: "6",
                        width: "4",
                        height: "2",
                        weight: "0.5",
                        massUnit: "lb" as const,
                        distanceUnit: "in" as const,
                      },
                    ],
                  },
                  selectedRate.objectId,
                  {
                    carrier: selectedRate.carrier,
                    amount: selectedRate.amount,
                    serviceName: selectedRate.serviceName,
                  }
                );

                const orderWithShipment = await prisma.order.findUnique({
                  where: { id: orderId },
                  select: {
                    trackingNumber: true,
                    trackingUrl: true,
                    shippingCarrier: true,
                    shippingCost: true,
                  },
                });

                if (orderWithShipment) {
                  retryShippingDetails = {
                    trackingNumber: orderWithShipment.trackingNumber,
                    trackingUrl: orderWithShipment.trackingUrl,
                    carrier: orderWithShipment.shippingCarrier,
                    shippingCost: orderWithShipment.shippingCost ?? selectedRate.amount,
                  };
                }
              }
            }
          } catch (shipmentError) {
            console.error(
              "⚠️ Failed to create Shippo shipment for mobile payment:",
              shipmentError
            );
          }
        }

        // Send order confirmation email
        try {
          const customerEmail = (fullPaymentIntent as any).charges?.data?.[0]?.billing_details?.email;
          if (customerEmail) {
            const orderWithItems = await prisma.order.findUnique({
              where: { id: orderId },
              include: { orderItems: true },
            });

            if (orderWithItems) {
              const shippingAddr = buildEmailShippingAddress(
                orderWithItems.shippingAddress,
                updatedOrder.shippingAddress
              );
              const retryItemsWithNames = await Promise.all(
                orderWithItems.orderItems.map(async (item: any) => {
                  if (item.customPackName) {
                    return {
                      name: item.customPackName,
                      quantity: item.quantity,
                      price: item.price,
                    };
                  }

                  try {
                    const product = await prisma.product.findUnique({
                      where: { id: item.productId },
                      select: { name: true },
                    });

                    return {
                      name: product?.name || `Product #${item.productId}`,
                      quantity: item.quantity,
                      price: item.price,
                    };
                  } catch (err) {
                    return {
                      name: `Product #${item.productId}`,
                      quantity: item.quantity,
                      price: item.price,
                    };
                  }
                })
              );

              await sendOrderConfirmationEmail(customerEmail, {
                orderId: updatedOrder.id,
                customerName: shippingAddr?.name || "Customer",
                total: updatedOrder.total,
                items: retryItemsWithNames,
                shippingAddress: shippingAddr,
                shippingDetails: retryShippingDetails,
              });

              // Send admin notification
              try {
                await sendAdminOrderNotification({
                  orderId: updatedOrder.id,
                  customerName: shippingAddr?.name || "Customer",
                  customerEmail: customerEmail,
                  total: updatedOrder.total,
                  items: retryItemsWithNames,
                  shippingAddress: shippingAddr,
                  shippingDetails: retryShippingDetails,
                });
              } catch (adminEmailError) {
                console.error(
                  "❌ Error sending admin order notification:",
                  adminEmailError
                );
              }
            }
          }
        } catch (emailError) {
          console.error(
            "❌ Error sending order confirmation email:",
            emailError
          );
        }
      } else if (orderDataString) {
        // Create new order from metadata (mobile payment)
        console.log(
          "🆕 Creating order from mobile payment metadata - PAYMENT SUCCESSFUL"
        );

        try {
          const compressedData = JSON.parse(orderDataString);

          // Get customer email from payment intent charges
          const charges = await stripe.charges.list({
            payment_intent: paymentIntent.id,
            limit: 1,
          });

          const customerEmail =
            charges.data[0]?.billing_details?.email ||
            (fullPaymentIntent as any).charges?.data?.[0]?.billing_details?.email;

          if (!customerEmail) {
            console.error("❌ No customer email in payment intent");
            return;
          }

          // Find user by email (optional for guest checkout)
          const user = await prisma.user.findUnique({
            where: { email: customerEmail },
          });

          // Get shipping address from metadata or payment intent
          let shippingAddressData;
          if (compressedData.address && compressedData.address.name) {
            shippingAddressData = {
              name: compressedData.address.name,
              email: compressedData.address.email,
              phone: compressedData.address.phone,
              street1: compressedData.address.street,
              city: compressedData.address.city,
              state: compressedData.address.state,
              zip: compressedData.address.zip,
              country: compressedData.address.country,
            };
          } else {
            // Try to get from payment intent billing details
            const billingDetails = charges.data[0]?.billing_details;
            if (billingDetails && billingDetails.address) {
              shippingAddressData = {
                name: billingDetails.name || "",
                email: customerEmail,
                phone: billingDetails.phone || "",
                street1: billingDetails.address.line1 || "",
                city: billingDetails.address.city || "",
                state: billingDetails.address.state || "",
                zip: billingDetails.address.postal_code || "",
                country: billingDetails.address.country || "",
              };
            } else {
              console.error("❌ No shipping address found in payment intent");
              throw new Error("Shipping address not found");
            }
          }

          // Reconstruct order items from compressed format (same logic as checkout.session.completed)
          const orderItems: any[] = [];

          compressedData.items.forEach((item: any) => {
            const isUltraCompressed = item.p !== undefined;
            const packType = isUltraCompressed ? item.p : item.pack;
            const quantity = isUltraCompressed ? item.q : item.qty;
            const price = isUltraCompressed ? item.pr : item.price;
            const total = isUltraCompressed ? item.t : item.total;

            if (packType === "platinum" || packType === "plat") {
              const variationsPerPack = 4;
              const pricePerVariation = price / variationsPerPack;
              const totalPerVariation = total / variationsPerPack;

              for (let i = 0; i < variationsPerPack; i++) {
                orderItems.push({
                  productId: null,
                  quantity: quantity,
                  price: pricePerVariation,
                  total: totalPerVariation,
                  flavorIds: [],
                  customPackName: "12 Pack Best Seller and Classic Platinum",
                  variationId: item.vids && item.vids[i] ? item.vids[i] : null,
                });
              }
            } else if (packType === "gold") {
              const variationsPerPack = 2;
              const pricePerVariation = price / variationsPerPack;
              const totalPerVariation = total / variationsPerPack;

              for (let i = 0; i < variationsPerPack; i++) {
                orderItems.push({
                  productId: null,
                  quantity: quantity,
                  price: pricePerVariation,
                  total: totalPerVariation,
                  flavorIds: [],
                  customPackName: "7 Pack Sweet and Sour collection Gold",
                  variationId: item.vids && item.vids[i] ? item.vids[i] : null,
                });
              }
            } else {
              orderItems.push({
                productId: isUltraCompressed ? item.pid : item.pid,
                quantity: quantity,
                price: price,
                total: total,
                flavorIds: isUltraCompressed
                  ? item.f || []
                  : item.flavors || [],
                customPackName: isUltraCompressed
                  ? item.c
                  : item.custom || null,
                variationId: isUltraCompressed ? item.vid : item.vid || null,
              });
            }
          });

          // Validate variationIds
          const validatedOrderItems = await Promise.all(
            orderItems.map(async (item: any) => {
              let validVariationId = null;

              if (item.variationId) {
                try {
                  const variation = await prisma.productVariation.findUnique({
                    where: { id: item.variationId },
                    select: { id: true },
                  });

                  if (variation) {
                    validVariationId = item.variationId;
                  }
                } catch (err) {
                  console.error(
                    `❌ Error validating variationId ${item.variationId}:`,
                    err
                  );
                }
              }

              return {
                productId: item.productId,
                quantity: item.quantity,
                price: item.price,
                total: item.total,
                flavorIds: item.flavorIds || [],
                customPackName: item.customPackName || null,
                variationId: validVariationId,
              };
            })
          );

          // Create order
          const newOrder = await prisma.order.create({
            data: {
              userId: user?.id || null,
              guestId: user ? null : `guest_${customerEmail}`,
              guestEmail: user ? null : customerEmail,
              status: "confirmed",
              paymentStatus: "paid",
              total: compressedData.total,
              shippingAddress: shippingAddressData,
              orderNotes: compressedData.notes,
              orderItems: {
                create: validatedOrderItems,
              },
            },
            include: {
              orderItems: true,
            },
          });

          console.log("✅ Mobile payment order created:", {
            orderId: newOrder.id,
            status: newOrder.status,
            paymentStatus: newOrder.paymentStatus,
            total: newOrder.total,
            itemsCount: newOrder.orderItems.length,
          });

          // Decrement inventory (same logic as checkout.session.completed)
          for (const item of newOrder.orderItems) {
            try {
              if (!item.productId && item.flavorIds && item.flavorIds.length > 0) {
                for (const flavorId of item.flavorIds) {
                  await prisma.flavorInventory.update({
                    where: { flavorId },
                    data: {
                      onHand: { decrement: item.quantity },
                      reserved: { decrement: item.quantity },
                    },
                  });
                }
              } else if (item.productId) {
                await prisma.product.update({
                  where: { id: item.productId },
                  data: {
                    stock: { decrement: item.quantity },
                  },
                });
              }
            } catch (invError) {
              console.error(
                `❌ Error updating inventory for item ${item.id}:`,
                invError
              );
            }
          }

          // Create Shippo shipment (same logic as checkout.session.completed)
          let shippingDetails: any = undefined;
          try {
            const { getShippingRates, createShipment } = await import(
              "../services/shippoService"
            );

            const preSelectedRate = compressedData.shippingRate;
            let selectedRate;
            let isFlatRateShipping = false;
            let flatRateCost = 0;

            if (preSelectedRate && preSelectedRate.objectId) {
              isFlatRateShipping = preSelectedRate.objectId.startsWith("flat-rate-");

              if (isFlatRateShipping) {
                flatRateCost = preSelectedRate.amount || 0;
                const shippoRates = await getShippingRates(
                  shippingAddressData as any,
                  [
                    {
                      length: "6",
                      width: "4",
                      height: "2",
                      weight: "0.5",
                      massUnit: "lb" as const,
                      distanceUnit: "in" as const,
                    },
                  ]
                );

                if (shippoRates.length > 0) {
                  selectedRate = shippoRates[0];
                }
              } else {
                selectedRate = preSelectedRate;
                flatRateCost = preSelectedRate.amount || 0;
              }
            } else {
              const rates = await getShippingRates(shippingAddressData as any, [
                {
                  length: "6",
                  width: "4",
                  height: "2",
                  weight: "0.5",
                  massUnit: "lb" as const,
                  distanceUnit: "in" as const,
                },
              ]);

              if (rates.length > 0) {
                selectedRate = rates[0];
              }
            }

            if (selectedRate && !isFlatRateShipping) {
              await createShipment(
                {
                  orderId: newOrder.id,
                  toAddress: shippingAddressData as any,
                  parcels: [
                    {
                      length: "6",
                      width: "4",
                      height: "2",
                      weight: "0.5",
                      massUnit: "lb" as const,
                      distanceUnit: "in" as const,
                    },
                  ],
                },
                selectedRate.objectId,
                {
                  carrier: selectedRate.carrier,
                  amount: selectedRate.amount,
                  serviceName: selectedRate.serviceName,
                }
              );
            } else if (selectedRate && isFlatRateShipping) {
              await createShipment(
                {
                  orderId: newOrder.id,
                  toAddress: shippingAddressData as any,
                  parcels: [
                    {
                      length: "6",
                      width: "4",
                      height: "2",
                      weight: "0.5",
                      massUnit: "lb" as const,
                      distanceUnit: "in" as const,
                    },
                  ],
                },
                selectedRate.objectId,
                {
                  carrier: selectedRate.carrier,
                  amount: flatRateCost,
                  serviceName: preSelectedRate?.serviceName || selectedRate.serviceName,
                }
              );

              await prisma.order.update({
                where: { id: newOrder.id },
                data: {
                  shippingCost: flatRateCost,
                },
              });
            }

            if (selectedRate) {
              const orderWithShipment = await prisma.order.findUnique({
                where: { id: newOrder.id },
                select: {
                  trackingNumber: true,
                  trackingUrl: true,
                  shippingCarrier: true,
                  shippingCost: true,
                },
              });

              if (orderWithShipment) {
                const customerPaidShippingCost = isFlatRateShipping
                  ? flatRateCost
                  : preSelectedRate?.amount || selectedRate.amount;

                shippingDetails = {
                  trackingNumber: orderWithShipment.trackingNumber,
                  trackingUrl: orderWithShipment.trackingUrl,
                  carrier: orderWithShipment.shippingCarrier,
                  shippingCost: customerPaidShippingCost,
                };
              }
            }
          } catch (shipmentError) {
            console.error(
              "⚠️ Failed to create Shippo shipment for mobile payment:",
              shipmentError
            );
          }

          // Send order confirmation email (same logic as checkout.session.completed)
          try {
            const orderWithItems = await prisma.order.findUnique({
              where: { id: newOrder.id },
              include: {
                orderItems: {
                  include: {
                    variation: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            });

            if (orderWithItems) {
              // Fetch product names for order items (same grouping logic as checkout.session.completed)
              const itemsWithNames = await Promise.all(
                orderWithItems.orderItems.map(async (item: any) => {
                  if (!item.productId && item.customPackName) {
                    let packSize: number | null = null;
                    let variationName: string | null = null;

                    if (item.customPackName.includes("Platinum")) {
                      packSize = 3;
                    } else if (item.customPackName.includes("Gold")) {
                      packSize = null;
                    }

                    if (item.variationId) {
                      try {
                        const variation =
                          await prisma.productVariation.findUnique({
                            where: { id: item.variationId },
                            select: {
                              name: true,
                              product: {
                                select: { packSize: true },
                              },
                            },
                          });
                        variationName = variation?.name || null;

                        if (!packSize && variation?.product?.packSize) {
                          packSize = variation.product.packSize;
                        }
                      } catch (variationErr) {
                        console.error(
                          `Error fetching variation for pack product ${item.variationId}:`,
                          variationErr
                        );
                      }
                    }

                    return {
                      name: item.customPackName,
                      quantity: item.quantity,
                      price: item.price,
                      variationName: variationName,
                      productName: item.customPackName,
                      packSize: packSize,
                      variationId: item.variationId || null,
                    };
                  }

                  try {
                    const product = await prisma.product.findUnique({
                      where: { id: item.productId },
                      select: {
                        name: true,
                        packSize: true,
                        isPackProduct: true,
                        packType: true,
                      },
                    });

                    let variationName = null;
                    if (item.variation?.name) {
                      variationName = item.variation.name;
                    } else if (item.variationId) {
                      try {
                        const variation =
                          await prisma.productVariation.findUnique({
                            where: { id: item.variationId },
                            select: { name: true },
                          });
                        variationName = variation?.name || null;
                      } catch (variationErr) {
                        console.error(
                          `Error fetching variation name for ${item.variationId}:`,
                          variationErr
                        );
                      }
                    }

                    const productName =
                      product?.name || `Product #${item.productId}`;

                    return {
                      name: productName,
                      quantity: item.quantity,
                      price: item.price,
                      variationName: variationName,
                      productName: productName,
                      packSize: product?.packSize || null,
                      variationId: item.variationId || null,
                    };
                  } catch (err) {
                    console.error(
                      `Error fetching product name for ${item.productId}:`,
                      err
                    );
                    return {
                      name: `Product #${item.productId}`,
                      quantity: item.quantity,
                      price: item.price,
                      variationName: null,
                      productName: null,
                      packSize: null,
                    };
                  }
                })
              );

              // Group pack products (same logic as checkout.session.completed)
              const groupedItems: any[] = [];
              const processed = new Set<number>();

              const itemsByQuantity = new Map<number, any[]>();
              itemsWithNames.forEach((item: any, index: number) => {
                if (!itemsByQuantity.has(item.quantity)) {
                  itemsByQuantity.set(item.quantity, []);
                }
                itemsByQuantity.get(item.quantity)!.push({ item, index });
              });

              itemsByQuantity.forEach((itemsWithIndices, quantity) => {
                const packItems = itemsWithIndices.filter(
                  ({ item }) => item.packSize === 3 || item.packSize === 4
                );

                if (packItems.length === 0) {
                  itemsWithIndices.forEach(({ item, index }) => {
                    if (!processed.has(index)) {
                      groupedItems.push(item);
                      processed.add(index);
                    }
                  });
                  return;
                }

                const threePackItems = packItems.filter(
                  ({ item }) => item.packSize === 3
                );
                const fourPackItems = packItems.filter(
                  ({ item }) => item.packSize === 4
                );

                if (threePackItems.length > 0 && fourPackItems.length > 0) {
                  const allGoldItems = [...threePackItems, ...fourPackItems];
                  allGoldItems.forEach(({ index }) => processed.add(index));

                  const totalPrice = allGoldItems.reduce(
                    (sum, { item }) => sum + item.price * quantity,
                    0
                  );

                  groupedItems.push({
                    name: "7 Pack Sweet and Sour collection Gold",
                    quantity: quantity,
                    price: totalPrice / quantity,
                    variationName: null,
                    productName: "7 Pack Sweet and Sour collection Gold",
                    packItems: allGoldItems.map(({ item }) => ({
                      name: item.productName || item.name,
                      variation: item.variationName || "No variation",
                      variationName: item.variationName || "No variation",
                      packSize: item.packSize,
                      price: item.price,
                    })),
                    isPack: true,
                  });
                  return;
                }

                if (threePackItems.length > 0 && fourPackItems.length === 0) {
                  const variationsPerPack = 4;
                  const totalVariations = threePackItems.length;
                  const completePacks = Math.floor(
                    totalVariations / variationsPerPack
                  );

                  if (completePacks > 0) {
                    for (
                      let packIndex = 0;
                      packIndex < completePacks;
                      packIndex++
                    ) {
                      const packVariations = threePackItems.slice(
                        packIndex * variationsPerPack,
                        (packIndex + 1) * variationsPerPack
                      );

                      packVariations.forEach(({ index }) => processed.add(index));

                      const totalPrice = packVariations.reduce(
                        (sum, { item }) => sum + item.price * quantity,
                        0
                      );

                      groupedItems.push({
                        name: "12 Pack Best Seller and Classic Platinum",
                        quantity: quantity,
                        price: totalPrice / quantity,
                        variationName: null,
                        productName: "12 Pack Best Seller and Classic Platinum",
                        packItems: packVariations.map(({ item }) => ({
                          name: item.productName || item.name,
                          variation: item.variationName || "No variation",
                          variationName: item.variationName || "No variation",
                          packSize: 3,
                          price: item.price,
                        })),
                        isPack: true,
                      });
                    }

                    const remainingVariations = threePackItems.slice(
                      completePacks * variationsPerPack
                    );
                    if (remainingVariations.length > 0) {
                      remainingVariations.forEach(({ item, index }) => {
                        if (!processed.has(index)) {
                          groupedItems.push(item);
                          processed.add(index);
                        }
                      });
                    }
                    return;
                  }
                }

                packItems.forEach(({ item, index }) => {
                  if (!processed.has(index)) {
                    groupedItems.push(item);
                    processed.add(index);
                  }
                });
              });

              for (let i = 0; i < itemsWithNames.length; i++) {
                if (!processed.has(i)) {
                  groupedItems.push(itemsWithNames[i]);
                }
              }

              const finalItems = groupedItems;
              const emailShippingAddress = buildEmailShippingAddress(
                newOrder.shippingAddress,
                shippingAddressData
              );

              await sendOrderConfirmationEmail(customerEmail, {
                orderId: newOrder.id,
                customerName: emailShippingAddress.name || "Customer",
                total: newOrder.total,
                items: finalItems,
                shippingAddress: emailShippingAddress,
                shippingDetails: shippingDetails,
              });

              // Send admin notification
              try {
                await sendAdminOrderNotification({
                  orderId: newOrder.id,
                  customerName: emailShippingAddress.name || "Customer",
                  customerEmail: customerEmail,
                  total: newOrder.total,
                  items: finalItems,
                  shippingAddress: emailShippingAddress,
                  shippingDetails: shippingDetails,
                });
              } catch (adminEmailError) {
                console.error(
                  "❌ Error sending admin order notification:",
                  adminEmailError
                );
              }
            }
          } catch (emailError) {
            console.error(
              "❌ Error sending order confirmation email:",
              emailError
            );
          }

          return;
        } catch (parseError) {
          console.error("❌ Failed to parse mobile payment order data:", parseError);
          return;
        }
      }
    } else if (event.type === "charge.updated") {
      const charge = event.data.object as Stripe.Charge;

      console.log("⚡ Processing charge.updated:", {
        chargeId: charge.id,
        amount: charge.amount,
        status: charge.status,
        paid: charge.paid,
        paymentIntentId: charge.payment_intent,
        currency: charge.currency,
        created: new Date(charge.created * 1000).toISOString(),
      });

      // For charge.updated, we need to find the order by payment intent
      if (charge.payment_intent) {
        console.log(
          `🔍 Searching for checkout session with payment intent: ${charge.payment_intent}`
        );

        // Search for checkout sessions with this payment intent
        const sessions = await stripe.checkout.sessions.list({
          limit: 10,
        });

        const session = sessions.data.find(
          (s) => s.payment_intent === charge.payment_intent
        );

        if (session && session.metadata?.orderId) {
          const orderId = session.metadata.orderId;
          console.log(`📋 Found session for order: ${orderId}`);

          if (charge.status === "succeeded" && charge.paid) {
            console.log(`🔄 Updating order from charge.updated: ${orderId}`);
            await prisma.order.update({
              where: { id: orderId },
              data: {
                paymentStatus: "paid",
                status: "confirmed",
                updatedAt: new Date(),
              },
            });
            console.log("✅ Order updated from charge.updated:", {
              orderId,
              chargeId: charge.id,
              status: "confirmed",
              processingTime: Date.now() - webhookStartTime + "ms",
            });
          } else {
            console.log("ℹ️ Charge not succeeded, skipping order update:", {
              chargeStatus: charge.status,
              chargePaid: charge.paid,
            });
          }
        } else {
          console.warn(
            "⚠️ No session found for payment intent:",
            charge.payment_intent
          );
        }
      } else {
        console.warn("⚠️ No payment intent in charge:", charge.id);
      }
    } else {
      console.log("ℹ️ Unhandled webhook event type:", {
        type: event.type,
        id: event.id,
        created: new Date(event.created * 1000).toISOString(),
      });
    }

    console.log("🎉 Webhook processed successfully:", {
      eventType: event.type,
      eventId: event.id,
      totalProcessingTime: Date.now() - webhookStartTime + "ms",
    });
  } catch (err) {
    console.error("❌ Webhook handling error:", {
      error: err,
      eventType: event?.type,
      eventId: event?.id,
      processingTime: Date.now() - (webhookStartTime as any) + "ms",
    });
  }
})();
});

// Get Stripe checkout session details
router.get("/session/:sessionId", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ message: "Session ID is required" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "customer", "payment_intent"],
    });

    res.json({
      session: {
        id: session.id,
        amount_total: session.amount_total,
        amount_subtotal: session.amount_subtotal,
        currency: session.currency,
        status: session.status,
        payment_status: session.payment_status,
        metadata: session.metadata,
        customer_details: session.customer_details,
        shipping_details: (session as any).shipping_details || null,
        line_items: session.line_items?.data || [],
      },
    });
  } catch (error: any) {
    console.error("Error fetching Stripe session:", error);
    res.status(500).json({
      error: "Failed to fetch session",
      message: error.message,
    });
  }
});

// Webhook test endpoint for debugging
router.get("/webhook-test", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    // Test webhook endpoint accessibility
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    res.json({
      message: "Webhook endpoint is accessible",
      timestamp: new Date().toISOString(),
      hasStripe: !!stripe,
      hasWebhookSecret: !!webhookSecret,
      webhookSecretLength: webhookSecret ? webhookSecret.length : 0,
      webhookSecretPrefix: webhookSecret
        ? webhookSecret.substring(0, 10) + "..."
        : "none",
      environment: process.env.NODE_ENV,
    });
  } catch (error) {
    console.error("Webhook test error:", error);
    res.status(500).json({ error: "Webhook test failed" });
  }
});

// Webhook signature test endpoint
router.post(
  "/webhook-signature-test",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        return res.status(503).json({ message: "Stripe not configured" });
      }

      const sig = req.headers["stripe-signature"] as string | undefined;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      console.log("Signature test:", {
        hasSignature: !!sig,
        hasSecret: !!webhookSecret,
        signature: sig,
        bodySize: req.body ? Buffer.byteLength(req.body) : 0,
        bodyType: typeof req.body,
      });

      if (!sig || !webhookSecret) {
        return res.status(400).json({
          error: "Missing signature or secret",
          hasSignature: !!sig,
          hasSecret: !!webhookSecret,
        });
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

        res.json({
          success: true,
          eventType: event.type,
          eventId: event.id,
          message: "Signature verification successful",
        });
      } catch (err: any) {
        console.error("Signature verification failed:", err);
        res.status(400).json({
          error: "Signature verification failed",
          details: err.message,
        });
      }
    } catch (error) {
      console.error("Webhook signature test error:", error);
      res.status(500).json({ error: "Webhook signature test failed" });
    }
  }
);

// Bulk payment status fix endpoint (admin only)
router.post("/fix-payment-status", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    console.log("🔧 Starting bulk payment status fix...");

    // Get all orders with pending payment status
    const pendingOrders = await prisma.order.findMany({
      where: {
        paymentStatus: "pending",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    console.log(
      `📊 Found ${pendingOrders.length} orders with pending payment status`
    );

    if (pendingOrders.length === 0) {
      return res.json({
        message: "No pending orders found",
        fixedCount: 0,
        failedCount: 0,
        noSessionCount: 0,
        totalProcessed: 0,
      });
    }

    let fixedCount = 0;
    let failedCount = 0;
    let noSessionCount = 0;

    // Process each pending order
    for (const order of pendingOrders) {
      console.log(`🔍 Checking order ${order.id}...`);

      try {
        // Search for checkout sessions with this order ID
        const sessions = await stripe.checkout.sessions.list({
          limit: 50, // Get more sessions to find older ones
        });

        const orderSession = sessions.data.find(
          (session) => session.metadata?.orderId === order.id
        );

        if (!orderSession) {
          console.log(`❌ No Stripe session found for order ${order.id}`);

          // If order is older than 24 hours and no session found, mark as failed
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          if (order.createdAt < oneDayAgo) {
            await prisma.order.update({
              where: { id: order.id },
              data: {
                paymentStatus: "failed",
                updatedAt: new Date(),
              },
            });
            console.log(
              `🔄 Marked order ${order.id} as failed (no session found, older than 24h)`
            );
            failedCount++;
          } else {
            console.log(`⏳ Order ${order.id} is recent, keeping as pending`);
            noSessionCount++;
          }
          continue;
        }

        console.log(
          `📋 Found session ${orderSession.id} for order ${order.id}`
        );
        console.log(`   Payment status: ${orderSession.payment_status}`);

        // Update order based on session payment status
        if (orderSession.payment_status === "paid") {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: "paid",
              status: "confirmed",
              updatedAt: new Date(),
            },
          });
          console.log(`✅ Updated order ${order.id} to paid`);
          fixedCount++;
        } else if (orderSession.payment_status === "unpaid") {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: "failed",
              updatedAt: new Date(),
            },
          });
          console.log(`❌ Updated order ${order.id} to failed`);
          failedCount++;
        } else {
          console.log(
            `⏳ Order ${order.id} session status: ${orderSession.payment_status} - keeping pending`
          );
          noSessionCount++;
        }
      } catch (error: any) {
        console.error(`❌ Error processing order ${order.id}:`, error.message);
        noSessionCount++;
      }
    }

    const result = {
      message: "Payment status fix completed",
      fixedCount,
      failedCount,
      noSessionCount,
      totalProcessed: pendingOrders.length,
    };

    console.log("📈 Fix completed:", result);
    res.json(result);
  } catch (error) {
    console.error("❌ Bulk payment status fix failed:", error);
    res.status(500).json({
      error: "Failed to fix payment status",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ============================================
// MOBILE APP PAYMENT ENDPOINTS
// These endpoints use Stripe Payment Intents API for mobile apps
// Mobile apps will show payment popup using Stripe SDK (not browser redirect)
// ============================================

// Create Payment Intent for mobile app checkout
router.post("/mobile/create-payment-intent", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    const {
      orderId,
      orderData,
      items,
      selectedShippingRate,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No items provided" });
    }

    // Calculate total amount
    const amount = items.reduce((sum: number, it: any) => {
      return sum + Math.max(0, Math.round(Number(it.price || 0) * 100)) * Math.max(1, Number(it.quantity || 1));
    }, 0);

    if (amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // Store order data in Stripe metadata for webhook processing
    // NO order created in database until successful payment
    const metadata: any = {};

    if (orderId) {
      // Existing order (retry payment)
      metadata.orderId = String(orderId);
      metadata.isRetry = "true";
    } else if (orderData) {
      // New order - store compressed data in metadata
      // We'll create the order ONLY after successful payment in webhook
      // Group pack products to reduce metadata size
      const packProductGroups = new Map<string, any[]>();
      const regularItems: any[] = [];

      orderData.orderItems.forEach((item: any) => {
        // Check if this is a pack product (Platinum or Gold)
        if (item.packProductId && item.packProductName) {
          const packKey = `${item.packProductId}-${item.quantity}`;
          if (!packProductGroups.has(packKey)) {
            packProductGroups.set(packKey, []);
          }
          packProductGroups.get(packKey)!.push(item);
        } else {
          regularItems.push(item);
        }
      });

      // Compress items: for pack products, use pack name only; for regular items, use shortened names
      const compressedItems: any[] = [];

      // Add pack products as single items with pack name
      packProductGroups.forEach((packItems, packKey) => {
        const firstItem = packItems[0];
        const isPlatinum =
          packItems.every((item: any) => item.packSize === 3) &&
          packItems.length === 4;

        if (isPlatinum) {
          compressedItems.push({
            pid: null,
            qty: firstItem.quantity,
            price: packItems.reduce(
              (sum: number, item: any) => sum + item.price,
              0
            ),
            total: packItems.reduce(
              (sum: number, item: any) => sum + item.total,
              0
            ),
            pack: "platinum",
            vids: packItems
              .map((item: any) => item.variationId)
              .filter(Boolean),
          });
        } else {
          compressedItems.push({
            pid: null,
            qty: firstItem.quantity,
            price: packItems.reduce(
              (sum: number, item: any) => sum + item.price,
              0
            ),
            total: packItems.reduce(
              (sum: number, item: any) => sum + item.total,
              0
            ),
            pack: "gold",
            vids: packItems
              .map((item: any) => item.variationId)
              .filter(Boolean),
          });
        }
      });

      // Add regular items with shortened names
      regularItems.forEach((item: any) => {
        let shortName = item.productName || "";
        if (item.variationName) {
          shortName = item.variationName;
        } else if (shortName.includes(" - ")) {
          shortName = shortName.split(" - ").pop() || shortName;
        }

        compressedItems.push({
          pid: item.productId,
          qty: item.quantity,
          price: item.price,
          total: item.total,
          flavors: item.flavorIds || [],
          custom: item.customPackName || null,
          vid: item.variationId || null,
          name: shortName.length > 30 ? shortName.substring(0, 30) : shortName,
        });
      });

      const compressedData: any = {
        total: orderData.total,
        notes: orderData.orderNotes,
        items: compressedItems,
      };

      // Include shipping address if provided
      if (orderData.shippingAddress && orderData.shippingAddress.name) {
        compressedData.address = {
          name: orderData.shippingAddress.name,
          email: orderData.shippingAddress.email,
          phone: orderData.shippingAddress.phone,
          street: orderData.shippingAddress.street,
          city: orderData.shippingAddress.city,
          state: orderData.shippingAddress.state,
          zip: orderData.shippingAddress.zipCode,
          country: orderData.shippingAddress.country,
        };
      }

      // Include selected shipping rate if provided
      if (selectedShippingRate) {
        compressedData.shippingRate = {
          objectId: selectedShippingRate.objectId,
          carrier: selectedShippingRate.carrier,
          amount: selectedShippingRate.amount,
          serviceName: selectedShippingRate.serviceName,
        };
      }

      let dataString = JSON.stringify(compressedData);

      // If still too large, use ultra-compressed format
      if (dataString.length > 500) {
        const ultraCompressedItems: any[] = [];

        compressedItems.forEach((item: any) => {
          if (item.pack === "platinum") {
            ultraCompressedItems.push({
              p: "plat",
              q: item.qty,
              pr: item.price,
              t: item.total,
            });
          } else if (item.pack === "gold") {
            ultraCompressedItems.push({
              p: "gold",
              q: item.qty,
              pr: item.price,
              t: item.total,
            });
          } else {
            ultraCompressedItems.push({
              pid: item.pid,
              q: item.qty,
              pr: item.price,
              t: item.total,
              f: item.flavors || [],
              c: item.custom || null,
              vid: item.vid || null,
              n: item.name ? item.name.substring(0, 20) : null,
            });
          }
        });

        compressedData.items = ultraCompressedItems;
        dataString = JSON.stringify(compressedData);
      }

      if (dataString.length > 500) {
        console.error(
          "[Mobile Payment] Data still too large after compression:",
          dataString.length
        );
        return res
          .status(400)
          .json({ message: "Order data too large for Stripe metadata" });
      }

      metadata.orderData = dataString;
      metadata.source = "mobile"; // Mark as mobile payment
    }

    // Create Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "usd",
      metadata: metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error("Mobile payment intent error:", err);
    return res
      .status(500)
      .json({ message: "Failed to create payment intent" });
  }
});

// Confirm payment intent (optional - for additional confirmation if needed)
router.post("/mobile/confirm-payment", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe not configured" });
    }

    const { paymentIntentId } = req.body || {};

    if (!paymentIntentId) {
      return res.status(400).json({ message: "Payment Intent ID is required" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    return res.json({
      status: paymentIntent.status,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error("Payment confirmation error:", err);
    return res
      .status(500)
      .json({ message: "Failed to confirm payment" });
  }
});

export default router;
