"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import AnimatedText from "@/components/custom/AnimatedText";
import AnimatedSection from "@/components/custom/AnimatedSection";
import CustomButton from "@/components/custom/CustomButton";

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
};

// Product option type
type ProductOption = {
  id: string;
  title: string;
  kind: "Traditional" | "Sour" | "Sweet";
  active: boolean;
};

// Empty fallback - will show loading state instead
const fallbackProductOptions: ProductOption[] = [];

const ShopOur = () => {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [productOptions, setProductOptions] = useState<ProductOption[]>(fallbackProductOptions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyNowLoading, setBuyNowLoading] = useState(false);

  // Fetch products from backend API
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch('/api/products', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
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
          const options = data.map((product: Product) => ({
            id: product.id,
            title: product.name,
            kind: product.category as "Traditional" | "Sour" | "Sweet",
            active: product.isActive || true
          }));
          setProductOptions(options);
        } else if (data && Array.isArray(data.products)) {
          const options = data.products.map((product: Product) => ({
            id: product.id,
            title: product.name,
            kind: product.category as "Traditional" | "Sour" | "Sweet",
            active: product.isActive || true
          }));
          setProductOptions(options);
        } else if (data && Array.isArray(data.data)) {
          const options = data.data.map((product: Product) => ({
            id: product.id,
            title: product.name,
            kind: product.category as "Traditional" | "Sour" | "Sweet",
            active: product.isActive || true
          }));
          setProductOptions(options);
        } else {
          console.error('Unexpected API response format:', data);
          throw new Error('Invalid API response format');
        }
      } catch (err) {
        console.error('Failed to fetch products:', err);
        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            setError('Request timed out. Please try again.');
          } else {
            setError('Failed to load products. Please try again later.');
          }
        } else {
          setError('Failed to load products. Please try again later.');
        }
        // Don't use fallback data - keep empty array to show error state
        setProductOptions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const handlePrevious = () => {
    // Show 4 at a time; allow scrolling only if more than 4
    if (productOptions.length <= 4) return;
    setCurrentIndex((prevIndex) =>
      prevIndex === 0 ? productOptions.length - 4 : prevIndex - 1
    );
  };

  const handleNext = () => {
    // Show 4 at a time; allow scrolling only if more than 4
    if (productOptions.length <= 4) return;
    setCurrentIndex((prevIndex) =>
      prevIndex >= productOptions.length - 4 ? 0 : prevIndex + 1
    );
  };

  const handleCheckboxChange = (index: number) => {
    if (selectedOption === index) {
      setSelectedOption(null); // Unselect if already selected
    } else {
      setSelectedOption(index);
    }
  };

  const handleBuyNow = () => {
    if (selectedOption !== null) {
      setBuyNowLoading(true);
      const selectedProduct = productOptions[selectedOption];
      // Navigate to the specific product page
      router.push(`/products/${selectedProduct.id}`);
      // Reset loading after navigation
      setTimeout(() => setBuyNowLoading(false), 1000);
    }
  };

  return (
    <section className="h-full w-full bg-white flex flex-col justify-center items-center">
      <AnimatedSection 
        className="h-fit w-full layout py-6 md:py-8 lg:py-10 px-4"
        animationType="fadeIn"
        duration={0.8}
        delay={0.4}
      >
        <AnimatedText
          text="Shop Our Licorice Ropes"
          className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-center md:text-left text-black w-full md:w-2/3 lg:w-1/3"
          splitBy="word"
        />
      </AnimatedSection>
      <AnimatedSection 
        className="h-full w-full layout gap-6 md:gap-8 lg:gap-10 flex flex-col lg:flex-row justify-between items-center px-4"
        animationType="slideLeft"
        duration={1.2}
        delay={0.6}
        staggerChildren={true}
        stagger={0.15}
        staggerDirection="left"
      >
        <div className="h-full w-full lg:w-[40%] flex justify-center">
          <Image
            src="/assets/images/slider.png"
            alt="slider"
            width={750}
            height={500}
            className="w-full max-w-md md:max-w-lg lg:max-w-none"
          />
        </div>
        <div className="h-full w-full lg:w-[60%] p-4 md:p-6">
          <h3 className="text-2xl md:text-3xl font-bold text-black py-3 md:py-5">
            3 pack $27
          </h3>
          <h5 className="text-lg md:text-xl lg:text-2xl py-2 md:py-3 text-black">
            Choose One of the following 3 packs:
          </h5>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-3 text-gray-600">Loading products...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              <p className="font-bold">Error Loading Products</p>
              <p>{error}</p>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-4 mt-4">
            {/* Checkbox List with Sliding Animation */}
            <div className="flex-1 overflow-hidden">
              {productOptions.length === 0 && !loading && !error && (
                <div className="flex items-center justify-center py-8">
                  <p className="text-gray-500">No products available</p>
                </div>
              )}
              {productOptions.length > 0 && (
                <div
                  className="transition-transform duration-300 ease-in-out h-[160px]"
                  style={{ transform: `translateY(-${currentIndex * 40}px)` }}
                >
                  {productOptions.map((option, index) => {
                    const isSelected = selectedOption === index;
                    const isDisabled = selectedOption !== null && selectedOption !== index;

                    return (
                    <div
                      key={option.id}
                      className={`flex items-center gap-3 cursor-pointer hover:bg-gray-50 px-2 rounded transition-colors h-10
                        ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}
                      `}
                      onClick={() => {
                        if (!isDisabled) handleCheckboxChange(index);
                      }}
                    >
                      <div
                        className={`w-5 h-5 border-2 rounded flex items-center justify-center ${
                          isSelected
                            ? "border-green-500 bg-green-500"
                            : "border-gray-300"
                        } ${isDisabled ? "bg-gray-200" : ""}`}
                      >
                        {isSelected && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                      <span
                        className={`text-sm ${
                          isSelected
                            ? "font-semibold text-black"
                            : "text-gray-700"
                        }`}
                      >
                        {option.title}
                      </span>
                    </div>
                  );
                })}
              </div>
              )}
            </div>

            {/* Vertical Navigation Buttons */}
            <div className="flex flex-row md:flex-col gap-2 justify-center md:justify-start">
              <button
                onClick={handlePrevious}
                className="w-10 h-10 md:w-12 md:h-12 bg-secondary rounded-full flex items-center justify-center text-white transition-colors"
              >
                <svg
                  className="w-6 h-6 md:w-8 md:h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 15l7-7 7 7"
                  />
                </svg>
              </button>
              <button
                onClick={handleNext}
                className="w-10 h-10 md:w-12 md:h-12 bg-secondary rounded-full flex items-center justify-center text-white transition-colors"
              >
                <svg
                  className="w-6 h-6 md:w-8 md:h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            </div>
          </div>
          {/* Buy Now Button */}
          <div className="mt-8 flex justify-center">
            <CustomButton
              title="Buy Now"
              className="bg-primary text-white px-8 py-3 text-lg font-semibold"
              disabled={selectedOption === null || buyNowLoading}
              loading={buyNowLoading}
              loadingText="Redirecting..."
              onClick={handleBuyNow}
            />
          </div>
        </div>
      </AnimatedSection>
    </section>
  );
};

export default ShopOur;
