'use client'
import React, { useEffect } from 'react';
import { useWishlistStore, WishlistItem } from '@/store/wishlistStore';
import { useCartStore } from '@/store/cartStore';
import { useUser } from '@/hooks/useUser';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, Trash2, ShoppingCart } from 'lucide-react';
import { useRouter } from 'next/navigation';

const ORANGE = '#FF5D39';

const BLACK = '#000000';
const WHITE = '#FFFFFF';

const WishlistPage = () => {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const { 
    items, 
    removeItem, 
    clearWishlist, 
    getItemCount 
  } = useWishlistStore();
  
  const { addItem } = useCartStore();
  const [loadingStates, setLoadingStates] = React.useState<{
    clearAll: boolean;
    movingToCart: { [key: string]: boolean };
    removing: { [key: string]: boolean };
  }>({
    clearAll: false,
    movingToCart: {},
    removing: {}
  });

  // Authentication check
  useEffect(() => {
    if (!userLoading && !user) {
      router.push("/auth/login");
      return;
    }
  }, [user, userLoading, router]);

  const handleMoveToCart = async (item: WishlistItem) => {
    setLoadingStates(prev => ({
      ...prev,
      movingToCart: { ...prev.movingToCart, [item.productId]: true }
    }));
    
    try {
      await addItem({
        productId: item.productId,
        productName: item.productName,
        quantity: 1,
        price: item.price,
        imageUrl: item.imageUrl,
        sku: item.sku
      });
      removeItem(item.productId);
      // Redirect to cart page after successful move
      router.push('/cart');
    } catch {
      alert('Failed to add item to cart. Please try again.');
    } finally {
      setLoadingStates(prev => ({
        ...prev,
        movingToCart: { ...prev.movingToCart, [item.productId]: false }
      }));
    }
  };

  const handleClearAll = async () => {
    setLoadingStates(prev => ({ ...prev, clearAll: true }));
    try {
      await clearWishlist();
    } catch (error) {
      console.error('Error clearing wishlist:', error);
    } finally {
      setLoadingStates(prev => ({ ...prev, clearAll: false }));
    }
  };

  const handleRemoveItem = async (productId: string) => {
    setLoadingStates(prev => ({
      ...prev,
      removing: { ...prev.removing, [productId]: true }
    }));
    
    try {
      await removeItem(productId);
    } catch (error) {
      console.error('Error removing item:', error);
    } finally {
      setLoadingStates(prev => ({
        ...prev,
        removing: { ...prev.removing, [productId]: false }
      }));
    }
  };

  // Show loading while checking authentication
  if (userLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF5D39] mx-auto mb-4"></div>
          <p className="text-black text-lg">Loading wishlist...</p>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-[#FF5D39] to-[#F1A900] bg-clip-text text-transparent">
            My Wishlist
          </h1>
          <p className="text-lg" style={{ color: BLACK, opacity: 0.7 }}>
            Save your favorite products for later
          </p>
        </div>

        {/* Empty State */}
        {items.length === 0 && (
          <div className="text-center py-20">
            <div className="mx-auto h-24 w-24 mb-4 flex items-center justify-center">
              <Heart className="w-16 h-16" style={{ color: '#E5E5E5' }} />
            </div>
            <h3 className="text-xl font-semibold mb-2" style={{ color: BLACK }}>
              Your wishlist is empty
            </h3>
            <p className="mb-6" style={{ color: BLACK, opacity: 0.7 }}>
              Start adding products to your wishlist while shopping.
            </p>
            <Link 
              href="/shop"
              className="inline-block bg-[#FF5D39] text-white font-bold px-8 py-3 rounded-lg shadow-lg hover:opacity-90 transition-all"
            >
              Start Shopping
            </Link>
          </div>
        )}

        {/* Wishlist Items */}
        {items.length > 0 && (
          <>
            {/* Actions */}
            <div className="flex justify-between items-center mb-6">
              <p className="text-black">
                {getItemCount()} item{getItemCount() !== 1 ? 's' : ''} in your wishlist
              </p>
              <button
                onClick={handleClearAll}
                disabled={loadingStates.clearAll}
                className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loadingStates.clearAll ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                    Clearing...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Clear All
                  </>
                )}
              </button>
            </div>

            {/* Items Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl shadow-lg border overflow-hidden hover:shadow-xl transition-all duration-300"
                  style={{
                    borderColor: '#F3F3F3',
                  }}
                >
                  {/* Product Image */}
                  <div className="relative">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.productName}
                        width={400}
                        height={300}
                        className="w-full h-48 object-cover"
                      />
                    ) : (
                      <div className="w-full h-48 bg-gray-100 flex items-center justify-center">
                        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke={BLACK} style={{ opacity: 0.3 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <button
                      onClick={() => handleRemoveItem(item.productId)}
                      disabled={loadingStates.removing[item.productId]}
                      className="absolute top-3 right-3 p-2 bg-white rounded-full shadow-md hover:bg-red-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {loadingStates.removing[item.productId] ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                      ) : (
                        <Trash2 className="w-4 h-4 text-red-600" />
                      )}
                    </button>
                  </div>

                  {/* Product Details */}
                  <div className="p-6">
                    <h3 className="text-xl font-semibold mb-2 text-black line-clamp-2">
                      {item.productName}
                    </h3>
                    
                    {item.category && (
                      <span
                        className="inline-block text-xs px-2 py-1 rounded-full mb-3"
                        style={{
                          background: item.category === "Traditional" ? "#8B4513" : 
                                     item.category === "Sour" ? "#FF6B35" : 
                                     item.category === "Sweet" ? "#FF69B4" : ORANGE,
                          color: WHITE
                        }}
                      >
                        {item.category}
                      </span>
                    )}

                    <div className="flex items-center justify-between mb-4">
                      <span className="text-2xl font-bold text-[#FF5D39]">
                        ${item.price.toFixed(2)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => handleMoveToCart(item)}
                        disabled={loadingStates.movingToCart[item.productId]}
                        className="w-full sm:flex-1 flex items-center justify-center gap-2 bg-[#FF5D39] text-white font-semibold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {loadingStates.movingToCart[item.productId] ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Moving...
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="w-4 h-4" />
                            Move to Cart
                          </>
                        )}
                      </button>
                      <Link
                        href={`/products/${item.productId}`}
                        className="w-full sm:flex-1 text-center border border-[#FF5D39] text-[#FF5D39] font-semibold py-3 rounded-lg hover:bg-[#FF5D39] hover:text-white transition-colors"
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WishlistPage;
