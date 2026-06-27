'use client'
import React, { useEffect, useState } from 'react';
import { useUser } from '@/hooks/useUser';
import { useOrdersStore } from '@/store/ordersStore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import VerificationGuard from '@/components/auth/VerificationGuard';

const BLACK = '#000000';

const ProfilePage = () => {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const { orders, loading: ordersLoading, fetchOrders } = useOrdersStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'orders'>('profile');
  const [editMode, setEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [updatingProfile] = useState(false);

  // Authentication check
  useEffect(() => {
    if (!userLoading && !user) {
      router.push("/auth/login");
      return;
    }
  }, [user, userLoading, router]);

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || '',
        email: user.email || '',
        phone: (user as { phone?: string }).phone || '',
      });
    }
  }, [user]);

  useEffect(() => {
    if (user && !userLoading) {
      fetchOrders({ page: 1, limit: 50 }); // Increased limit to get more orders
    }
  }, [user, userLoading, fetchOrders]);

  // Refresh orders when switching to orders tab
  useEffect(() => {
    if (activeTab === 'orders' && user && !userLoading) {
      fetchOrders({ page: 1, limit: 50 });
    }
  }, [activeTab, user, userLoading, fetchOrders]);

  // Show loading while checking authentication
  if (userLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF5D39] mx-auto mb-4"></div>
          <p className="text-black text-lg">Loading profile...</p>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated
  if (!user) {
    return null;
  }

  const handleProfileUpdate = async () => {
    try {
      const response = await fetch('/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: profileForm.name,
          phone: profileForm.phone,
        }),
      });

      if (response.ok) {
        // Update the user data in the store or refetch
        setEditMode(false);
        // Optionally refresh the page or update local state
        window.location.reload();
      } else {
        const errorData = await response.json();
        console.error('Profile update error:', errorData.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'delivered': return 'bg-green-100 text-green-700';
      case 'shipped': return 'bg-blue-100 text-blue-700';
      case 'confirmed': return 'bg-yellow-100 text-yellow-700';
      case 'pending': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <VerificationGuard>
      <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-[#FF5D39] to-[#F1A900] bg-clip-text text-transparent">
            My Account
          </h1>
          <p className="text-lg" style={{ color: BLACK, opacity: 0.7 }}>
            Manage your profile and view your order history
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 mb-8">
          {[
            { id: 'profile', label: 'Profile', icon: '👤' },
            { id: 'orders', label: 'Order History', icon: '📦' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'profile' | 'orders')}
              className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-[#FF5D39] text-[#FF5D39]'
                  : 'text-gray-500 hover:text-[#FF5D39]'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-2xl shadow-lg border p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-black">Profile Information</h2>
              {/* <button
                onClick={() => setEditMode(!editMode)}
                className="px-4 py-2 rounded-lg border border-[#FF5D39] text-[#FF5D39] hover:bg-[#FF5D39] hover:text-white transition-colors cursor-pointer"
              >
                {editMode ? 'Cancel' : 'Edit Profile'}
              </button> */}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-black">Name</label>
                {editMode ? (
                  <input
                    type="text"
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF5D39] text-black"
                  />
                ) : (
                  <p className="text-black">{user.name || 'Not provided'}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-black">Email</label>
                <p className="text-black">{user.email}</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-black">Phone</label>
                {editMode ? (
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF5D39] text-black"
                  />
                ) : (
                  <p className="text-black">{(user as { phone?: string }).phone || 'Not provided'}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-black">Member Since</label>
                <p className="text-black">Unknown</p>
              </div>
            </div>

            {editMode && (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleProfileUpdate}
                  disabled={updatingProfile}
                  className="px-6 py-2 bg-[#FF5D39] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {updatingProfile ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </div>
                  ) : (
                    "Save Changes"
                  )}
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="px-6 py-2 border border-gray-300 text-black rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-2xl shadow-lg border p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-black">Order History</h2>
                <span className="block sm:inline text-sm text-gray-600 mt-1 sm:mt-0 sm:ml-2">
                  {orders.length} order{orders.length !== 1 ? 's' : ''} found
                </span>
              </div>
              <button
                onClick={() => fetchOrders({ page: 1, limit: 50 })}
                disabled={ordersLoading}
                className="w-full sm:w-auto px-4 py-2 bg-[#FF5D39] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {ordersLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            
            {ordersLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF5D39] mx-auto mb-4"></div>
                <p className="text-black">Loading orders...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">📦</div>
                <h3 className="text-xl font-semibold mb-2 text-black">No orders yet</h3>
                <p className="text-black opacity-70 mb-6">Start shopping to see your order history here.</p>
                <Link 
                  href="/shop"
                  className="inline-block bg-[#FF5D39] text-white font-bold px-6 py-3 rounded-lg shadow-lg hover:opacity-90 transition-all"
                >
                  Start Shopping
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <div key={order.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-black">Order #{order.id?.slice(0, 8) || 'Unknown'}</h3>
                        <p className="text-sm text-gray-600">
                          {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Date not available'}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${getStatusColor(order.status || 'pending')}`}>
                          {order.status || 'pending'}
                        </span>
                        <p className="text-lg font-bold text-[#FF5D39] mt-1">
                          ${order.total.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <p className="text-sm text-gray-600">
                        {order.orderItems?.length || 0} item{order.orderItems?.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}


      </div>
    </div>
    </VerificationGuard>
  );
};

export default ProfilePage;
