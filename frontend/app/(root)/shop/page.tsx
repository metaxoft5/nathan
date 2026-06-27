"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import CustomButton from "@/components/custom/CustomButton";
import { useRouter } from "next/navigation";

const ORANGE = "#FF5D39";
const YELLOW = "#F1A900";
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

const ShopPage = () => {
  const router = useRouter();
  const [packages, setPackages] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryLoading, setRetryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizeImageSrc = (src?: string | null, updatedAt?: string) => {
    if (!src) return "/assets/images/slider.png";
    const path = src.startsWith("/uploads") ? src : src.startsWith("uploads") ? `/${src}` : src;
    const cacheBuster = updatedAt ? `?t=${new Date(updatedAt).getTime()}` : "";
    return `${path}${cacheBuster}`;
  };

  // Fetch products from backend API
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch("/api/products", {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Ensure data is an array
        if (Array.isArray(data)) {
          setPackages(data);
        } else if (data && Array.isArray(data.products)) {
          setPackages(data.products);
        } else if (data && Array.isArray(data.data)) {
          setPackages(data.data);
        } else {
          console.error("Unexpected API response format:", data);
          // Use fallback data instead of throwing error
          throw new Error("Invalid API response format");
        }
      } catch (err) {
        console.error("Failed to fetch products:", err);
        if (err instanceof Error) {
          if (err.name === "AbortError") {
            setError("Request timed out. Please try again.");
          } else {
            setError("Failed to load products. Please try again later.");
          }
        } else {
          setError("Failed to load products. Please try again later.");
        }

        setPackages([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const viewPackage = (id: string) => router.push(`/products/${id}`);

  if (loading) {
    return (
      <div className="w-full min-h-screen layout py-10 bg-shop-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading products...</p>
        </div>
      </div>
    );
  }

  if (error && packages.length === 0) {
    return (
      <div className="w-full min-h-screen layout py-10 bg-shop-bg">
        <div className="w-full text-center">
          <h1 className="text-4xl font-extrabold mb-6">
            <span className="inline-block text-shop-gradient font-extrabold drop-shadow text-white">
              Shop Packages
            </span>
          </h1>
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <p className="font-bold">Error Loading Products</p>
            <p>{error}</p>
          </div>
          <button
            onClick={() => {
              setRetryLoading(true);
              window.location.reload();
            }}
            disabled={retryLoading}
            className="bg-white text-black font-bold px-8 py-3 rounded-lg shadow-lg hover:bg-gray-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {retryLoading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2"></div>
                Retrying...
              </div>
            ) : (
              "Try Again"
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full min-h-screen layout py-10 bg-shop-bg"
      style={{
        color: BLACK,
      }}
    >
      <div className="flex items-center gap-3 mb-8 sm:mb-10">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
          <span className="inline-block text-shop-gradient font-extrabold drop-shadow text-white">
            Shop Packages
          </span>
        </h1>
      </div>

      <div className="mb-6 sm:mb-8">
        <p className="text-white text-base sm:text-lg mb-4">
          Choose from our carefully curated licorice rope packages. Each package
          contains 3 delicious flavors for the perfect tasting experience.
        </p>
      </div>

      {/* Package grid: 4 cards per row on large screens, tighter spacing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 w-full">
        {Array.isArray(packages) &&
          packages.map((pkg) => (
            <div
              key={pkg.id}
              className="group rounded-2xl overflow-hidden bg-white border border-[#FF5D39]/20 hover:border-[#FF5D39] shadow-md hover:shadow-2xl transition-all duration-300 transform-gpu hover:-translate-y-1 h-full flex flex-col"
            >
              <div className="relative">
                <Link href={`/products/${pkg.id}`} className="block">
                  {(
                    <Image
                      src={normalizeImageSrc(pkg.imageUrl, pkg.updatedAt)}
                      alt={pkg.name}
                      width={640}
                      height={480}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="w-full aspect-[4/3] object-cover transition-transform duration-300 group-hover:scale-105 rounded-t-2xl"
                    />
                  )}
                </Link>
                <span
                  className="absolute top-3 sm:top-4 left-3 sm:left-4 text-xs sm:text-sm font-bold px-2.5 sm:px-3 py-1 rounded-full shadow"
                  style={{
                    background:
                      pkg.category === "Traditional"
                        ? "#8B4513"
                        : pkg.category === "Sour"
                        ? "#FF6B35"
                        : pkg.category === "Sweet"
                        ? "#FF69B4"
                        : YELLOW,
                    color: "white",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  }}
                >
                  {pkg.category}
                </span>
                <span
                  className="absolute top-3 sm:top-4 right-3 sm:right-4 text-sm sm:text-lg font-bold px-2.5 sm:px-3 py-1 rounded-full shadow"
                  style={{
                    background: ORANGE,
                    color: "white",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  }}
                >
                  ${pkg.price.toFixed(2)}
                </span>
              </div>
              {/* Make the content area grow to push the button to the bottom */}
              <div className="p-4 sm:p-6 flex flex-col flex-1 gap-3 sm:gap-4">
                <div>
                  <h3
                    className="font-extrabold text-lg sm:text-xl mb-2"
                    style={{ color: BLACK }}
                  >
                    {pkg.name}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed mb-3 line-clamp-3">
                    {pkg.description}
                  </p>

                  {/* Stock Status */}
                  {pkg.stock !== undefined && (
                    <div className="mb-3">
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          pkg.stock > 20
                            ? "bg-green-100 text-green-700"
                            : pkg.stock > 10
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {pkg.stock > 20
                          ? "In Stock"
                          : pkg.stock > 10
                          ? "Low Stock"
                          : "Limited Stock"}{" "}
                        ({pkg.stock})
                      </span>
                    </div>
                  )}

                  {/* Flavors */}
                  {Array.isArray(pkg.flavors) && pkg.flavors.length > 0 && (
                    <div className="space-y-1">
                      <h4 className="font-semibold text-xs text-gray-700">
                        Contains:
                      </h4>
                      <div className="space-y-1">
                        {pkg.flavors.slice(0, 3).map((flavor, index) => (
                          <div
                            key={index}
                            className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded flex items-center gap-1"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                            {flavor.name}{" "}
                            {flavor.quantity > 1 && `×${flavor.quantity}`}
                          </div>
                        ))}
                        {pkg.flavors.length > 3 && (
                          <div className="text-xs text-gray-500 italic">
                            +{pkg.flavors.length - 3} more flavors
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {/* The button is always at the bottom due to flex-1 above */}
                <div className="pt-2 sm:pt-4 mt-auto">
                  <CustomButton
                    title="View Details"
                    className="w-full !bg-shop-gradient !text-white font-bold py-2.5 sm:py-3 rounded-lg shadow-lg transition-all hover:opacity-90"
                    onClick={() => viewPackage(pkg.id)}
                  />
                </div>
              </div>
            </div>
          ))}
        {!Array.isArray(packages) && (
          <div className="col-span-full text-center py-12">
            <div className="bg-white rounded-lg p-8 shadow-lg">
              <h3 className="text-xl font-bold text-gray-800 mb-4">
                No Products Available
              </h3>
              <p className="text-gray-600 mb-4">
                Unable to load products at this time.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="bg-primary text-white font-bold px-6 py-2 rounded-lg hover:opacity-90 transition-all"
              >
                Refresh Page
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-12 text-center">
        <p className="text-white text-lg mb-6">
          Each package contains 3 carefully selected licorice rope flavors for
          the perfect tasting experience.
        </p>
        <Link
          href="/Home"
          className="inline-block bg-white text-black font-bold px-8 py-3 rounded-lg shadow-lg hover:bg-gray-100 transition-all"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
};

export default ShopPage;
