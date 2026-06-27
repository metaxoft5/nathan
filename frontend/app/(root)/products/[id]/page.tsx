"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useCartStore } from "@/store/cartStore";
import { useWishlistStore } from "@/store/wishlistStore";
const ORANGE = "#FF5D39";
const BLACK = "#111111";

// Product data structure matching the backend API
type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  description?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
  stock?: number;
  flavors?: Array<{ name: string; quantity: number }>;
  sku?: string;
  updatedAt?: string;
};

const ProductDetailPage = () => {
  const params = useParams();
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const id = typeof params?.id === "string" ? params.id : "";

  const normalizeImageSrc = (src?: string | null, updatedAt?: string) => {
    if (!src) return "/assets/images/slider.png";
    const path = src.startsWith("/uploads")
      ? src
      : src.startsWith("uploads")
      ? `/${src}`
      : src;
    const cacheBuster = updatedAt ? `?t=${new Date(updatedAt).getTime()}` : "";
    return `${path}${cacheBuster}`;
  };

  // Fetch product from backend API
  useEffect(() => {
    const fetchProduct = async () => {
      if (!id) {
        setError("Product ID is required");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/products/${id}`, {
          credentials: "include",
        });

        if (!response.ok) {
          if (response.status === 404) {
            setError("Product not found");
          } else {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          setLoading(false);
          return;
        }

        const data = await response.json();

        // Handle different response formats
        if (data && data.id) {
          setProduct(data);
        } else if (data && data.product) {
          setProduct(data.product);
        } else {
          console.error("Unexpected product API response format:", data);
          throw new Error("Invalid product API response format");
        }
      } catch (err) {
        console.error("Failed to fetch product:", err);
        setError("Failed to load product. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  const router = useRouter();
  const { addItem } = useCartStore();
  const {
    addItem: addToWishlist,
    removeItem: removeFromWishlist,
    isInWishlist,
  } = useWishlistStore();

  const handleAddToCart = async () => {
    if (!product) return;

    setAddingToCart(true);
    try {
      await addItem({
        productId: product.id,
        productName: product.name,
        quantity,
        price: product.price,
        imageUrl: product.imageUrl || undefined,
        sku: product.sku,
      });

      // Redirect to cart page after successful addition
      router.push("/cart");
    } catch (error) {
      console.error("Failed to add to cart:", error);
    } finally {
      setAddingToCart(false);
    }
  };

  const handleWishlistToggle = () => {
    if (!product) return;

    if (isInWishlist(product.id)) {
      removeFromWishlist(product.id);
    } else {
      addToWishlist({
        productId: product.id,
        productName: product.name,
        price: product.price,
        imageUrl: product.imageUrl || undefined,
        sku: product.sku,
        category: product.category,
      });
    }
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen layout py-10 bg-shop-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading product...</p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center py-20">
          <h3 className="text-2xl font-bold mb-2" style={{ color: BLACK }}>
            {error || "Product not found"}
          </h3>
          <p className="mb-6" style={{ color: BLACK, opacity: 0.7 }}>
            {error || "The product you're looking for doesn't exist."}
          </p>
          {!error && (
            <div className="mb-6 p-4 bg-gray-100 rounded-lg text-sm text-left">
              <div>
                <strong>Requested ID:</strong> {id}
              </div>
            </div>
          )}
          <Link
            href="/shop"
            className="inline-block bg-primary text-white font-bold px-8 py-3 rounded-lg shadow-lg hover:opacity-90 transition-all"
          >
            Back to Shop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen layout py-10 bg-shop-bg">
      <div className="max-w-6xl mx-auto px-4">
        {/* Navigation */}
        <nav className="text-xs sm:text-sm mb-6 flex items-center gap-2 text-white">
          <Link href="/shop" className="hover:underline">
            Shop
          </Link>
          <span className="mx-1 text-gray-400">/</span>
          <span className="text-white font-semibold">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 bg-white rounded-2xl shadow-lg p-6 md:p-10">
          {/* Product Image */}
          <div className="relative">
            <div className="rounded-2xl overflow-hidden border-2 border-gray-100 shadow-md bg-white relative group">
              <Image
                src={normalizeImageSrc(product.imageUrl, product.updatedAt)}
                alt={product.name}
                width={1000}
                height={750}
                className="w-full h-64 sm:h-80 md:h-[28rem] object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 768px) 80vw, 600px"
                priority
              />
              <span
                className="absolute top-4 left-4 text-white text-xs px-3 py-1 rounded-full shadow font-semibold"
                style={{
                  background:
                    product.category === "Traditional"
                      ? "#8B4513"
                      : product.category === "Sour"
                      ? "#FF6B35"
                      : product.category === "Sweet"
                      ? "#FF69B4"
                      : ORANGE,
                }}
              >
                {product.category}
              </span>
            </div>
          </div>

          {/* Product Details */}
          <div className="flex flex-col justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black mb-3">
                {product.name}
              </h1>

              {/* SKU */}
              <div className="text-xs sm:text-sm text-gray-500 mb-4 font-mono">
                SKU: {product.sku}
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-center gap-4 mb-2">
                  <span
                    className="text-2xl sm:text-3xl font-bold"
                    style={{ color: ORANGE }}
                  >
                    ${product.price.toFixed(2)}
                  </span>
                  <span className="text-xs sm:text-sm text-gray-500">
                    {/* per 3-pack */}
                    per pack 3 flavors
                  </span>
                  {product.stock !== undefined && (
                    <span
                      className={`text-xs sm:text-sm font-semibold px-3 py-1 rounded-full ${
                        product.stock > 20
                          ? "bg-green-100 text-green-700"
                          : product.stock > 10
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {product.stock > 20
                        ? "In Stock"
                        : product.stock > 10
                        ? "Low Stock"
                        : "Limited Stock"}{" "}
                      ({product.stock})
                    </span>
                  )}
                </div>
                {/* Total Price Display */}
                <div
                  className={`rounded-lg p-3 border transition-all ${
                    quantity > 1
                      ? "bg-orange-50 border-orange-200 shadow-sm"
                      : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">
                      Total for {quantity} pack{quantity > 1 ? "s" : ""}:
                    </span>
                    <span
                      className={`text-xl font-bold transition-all ${
                        quantity > 1 ? "text-orange-600" : ""
                      }`}
                      style={{ color: quantity > 1 ? ORANGE : "#374151" }}
                    >
                      ${(product.price * quantity).toFixed(2)}
                    </span>
                  </div>
                  {quantity > 1 && (
                    <div className="mt-1 text-xs text-orange-600 font-medium">
                      Great choice! You&lsquo;re getting {quantity} packs.
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <p className="text-gray-700 mb-6 leading-relaxed text-base sm:text-lg">
                {product.description}
              </p>

              {/* Flavors */}
              <div className="mb-6">
                <h3 className="font-semibold text-black mb-3 text-sm sm:text-base">
                  Contains:
                </h3>
                <div className="space-y-2">
                  {Array.isArray(product.flavors) &&
                  product.flavors.length > 0 ? (
                    product.flavors.map((flavor, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="w-2 h-2 rounded-full bg-primary"></span>
                        <span className="text-gray-700">
                          {flavor.name}{" "}
                          {flavor.quantity > 1 && `×${flavor.quantity}`}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-gray-500 text-sm">
                      No flavors listed.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Add to Cart Section */}
            <div>
              <div className="flex items-center gap-3 sm:gap-4 mb-6">
                <span className="text-black font-medium text-sm sm:text-base">
                  Quantity
                </span>
                <div className="flex items-center border-2 border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                  <button
                    type="button"
                    className="px-3 sm:px-4 py-2 text-lg sm:text-xl hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-[#FF5D39] cursor-pointer"
                    style={{ color: ORANGE }}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={product.stock || 99}
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(
                        Math.max(
                          1,
                          Math.min(
                            product.stock || 99,
                            Number(e.target.value) || 1
                          )
                        )
                      )
                    }
                    className="w-14 sm:w-16 text-center text-black bg-white focus:outline-none focus:ring-2 focus:ring-[#FF5D39] text-base sm:text-lg font-semibold"
                  />
                  <button
                    type="button"
                    className="px-3 sm:px-4 py-2 text-lg sm:text-xl hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-[#FF5D39] cursor-pointer"
                    style={{ color: ORANGE }}
                    onClick={() =>
                      setQuantity((q) => Math.min(product.stock || 99, q + 1))
                    }
                  >
                    +
                  </button>
                </div>
                {product.stock !== undefined && (
                  <span className="text-xs sm:text-sm text-gray-500">
                    Max: {product.stock}
                  </span>
                )}
              </div>

              <div className="flex gap-3 mb-4">
                <button
                  type="button"
                  disabled={
                    addingToCart ||
                    (product.stock !== undefined && product.stock <= 0)
                  }
                  onClick={handleAddToCart}
                  className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg text-white font-bold text-base sm:text-lg shadow-lg hover:opacity-90 transition-all disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#FF5D39]"
                  style={{ background: ORANGE }}
                >
                  {addingToCart
                    ? "Adding..."
                    : product.stock !== undefined && product.stock <= 0
                    ? "Out of Stock"
                    : `Add to Cart - $${(product.price * quantity).toFixed(2)}`}
                </button>
                <button
                  type="button"
                  onClick={handleWishlistToggle}
                  className={`px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg border-2 transition-all focus:outline-none focus:ring-2 focus:ring-[#FF5D39] cursor-pointer ${
                    isInWishlist(product.id)
                      ? "border-red-500 text-red-500 hover:bg-red-50"
                      : "border-gray-300 text-gray-600 hover:border-[#FF5D39] hover:text-[#FF5D39]"
                  }`}
                >
                  <svg
                    className="w-5 h-5 sm:w-6 sm:h-6"
                    fill={isInWishlist(product.id) ? "currentColor" : "none"}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                </button>
              </div>

              {/* Features */}
              <div className="mt-6 grid grid-cols-1 gap-3 text-sm text-gray-600">
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                  <span className="text-green-600">✓</span>
                  Free shipping on orders over $50
                </div>
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                  <span className="text-green-600">✓</span>
                  30-day money-back guarantee
                </div>
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3">
                  <span className="text-green-600">✓</span>
                  Secure checkout
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailPage;
