"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useUser } from "@/hooks/useUser";
import Image from "next/image";

type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  description?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
  stock?: number;
  sku?: string;
  flavors?: Array<{
    id: string;
    name: string;
    quantity: number;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

type Flavor = {
  id: string;
  name: string;
  quantity: number;
};

type FlavorDTO = {
  id: string;
  name?: string | null;
  quantity?: number | null;
};

const AddProductsPage = () => {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState<{ page: number; limit: number; total: number; pages: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Product>>({
    name: "",
    price: 0,
    stock: 0,
    category: "",
    isActive: true,
    sku: "",
    flavors: [],
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<{ [key: string]: boolean }>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [preview, setPreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [availableFlavors, setAvailableFlavors] = useState<Array<{ id: string; name: string }>>([]);
  const [showNewFlavorForm, setShowNewFlavorForm] = useState<boolean>(false);
  const [newFlavor, setNewFlavor] = useState({
    name: "",
    aliases: "",
  });
  const [creatingFlavor, setCreatingFlavor] = useState<boolean>(false);
  const [deletingFlavor, setDeletingFlavor] = useState<{ [key: string]: boolean }>({});

  const getFlavorNameById = (id: string): string => {
    const found = availableFlavors.find((f) => f.id === id);
    return found ? found.name : id;
  };

  const formatFlavors = (flavors?: Array<FlavorDTO>): string => {
    if (!Array.isArray(flavors) || flavors.length === 0) return "-";
    return flavors
      .map((f) => {
        const name = (f.name && String(f.name).trim() !== "")
          ? String(f.name)
          : getFlavorNameById(String(f.id));
        const qtyRaw = typeof f.quantity === "number" ? f.quantity : Number(f.quantity || 1);
        const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Number(qtyRaw) : 1;
        return `${name} (${quantity})`;
      })
      .join(", ");
  };

  // Extract/normalize flavors from various backend shapes
  type UnknownFlavor = { id?: string; name?: string; flavor?: string; quantity?: number; qty?: number };
  const extractFlavors = (raw: unknown): FlavorDTO[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      // Could be string[] or object[]
      if (raw.length === 0) return [];
      if (typeof raw[0] === "string") {
        return (raw as string[]).map((name, idx) => ({ id: String(idx), name, quantity: 1 }));
      }
      return (raw as Array<UnknownFlavor>).map((f, idx) => ({
        id: String(f?.id ?? idx),
        name: (typeof f?.name === 'string' && f.name) ? f.name : (typeof f?.flavor === 'string' ? f.flavor : undefined),
        quantity: typeof f?.quantity === 'number' ? f.quantity : Number(f?.qty ?? 1),
      }));
    }
    if (typeof raw === 'string') {
      const str = raw.trim();
      // Try JSON first
      try {
        const parsed = JSON.parse(str);
        return extractFlavors(parsed);
      } catch {}
      // Fallback: comma-separated names
      return str.split(',').map((s, idx) => ({ id: String(idx), name: s.trim(), quantity: 1 }));
    }
    // Unknown shape
    return [];
  };

  const normalizeFlavorsForSave = (flavors?: Array<FlavorDTO | Flavor>): Flavor[] => {
    if (!Array.isArray(flavors)) return [];
    return flavors.map((f) => {
      const id = String((f as FlavorDTO).id);
      const name = (f as FlavorDTO).name && String((f as FlavorDTO).name).trim() !== ""
        ? String((f as FlavorDTO).name)
        : getFlavorNameById(id);
      const qtyRaw = (f as FlavorDTO).quantity;
      const quantity = typeof qtyRaw === "number" ? qtyRaw : Number(qtyRaw || 1);
      return { id, name, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1 };
    });
  };

  //

  useEffect(() => {
    if (!userLoading && (!user || user.role !== "admin")) {
      router.replace("/");
    }
  }, [user, userLoading, router]);


  const fetchProducts = async () => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      const q = String(search || "").trim();
      if (q) params.set("search", q);
      const cat = String(categoryFilter || "").trim();
      if (cat) params.set("category", cat);

      const { data } = await axios.get<{ products: Product[]; pagination?: { page: number; limit: number; total: number; pages: number } }>(
        `${API_URL}/products/admin/all?${params.toString()}`,
        { withCredentials: true }
      );
      setProducts(Array.isArray(data.products) ? data.products : []);
      setPagination(data.pagination || null);
    } catch (e) {
      // Fallback: try alternate mount
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        try {
          const params = new URLSearchParams();
          params.set("page", String(page));
          params.set("limit", String(limit));
          const q = String(search || "").trim();
          if (q) params.set("search", q);
          const cat = String(categoryFilter || "").trim();
          if (cat) params.set("category", cat);
          const { data } = await axios.get<{ products: Product[]; pagination?: { page: number; limit: number; total: number; pages: number } }>(
            `${API_URL}/admin/all?${params.toString()}`,
            { withCredentials: true }
          );
          setProducts(Array.isArray(data.products) ? data.products : []);
          setPagination(data.pagination || null);
          setError(null);
        } catch (e2) {
          const message =
            (e2 as { message?: string })?.message || "Unable to load products. Please try again.";
          setError(message);
          setProducts([]);
          setPagination(null);
        }
      } else {
        const message =
          (e as { message?: string })?.message || "Unable to load products. Please try again.";
        setError(message);
        setProducts([]);
        setPagination(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchFlavors = async () => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    try {
      const { data } = await axios.get(
        `${API_URL}/3pack/admin/flavors`,
        {
          withCredentials: true,
        }
      );
      // Filter only active flavors and map to the expected format
      const activeFlavors = data
        .filter((flavor: { active: boolean }) => flavor.active)
        .map((flavor: { id: string; name: string }) => ({
          id: flavor.id,
          name: flavor.name,
        }));
      setAvailableFlavors(activeFlavors);
    } catch (e) {
      console.error("Failed to load flavors:", e);
      // Fallback to empty array if flavors can't be loaded
      setAvailableFlavors([]);
    }
  };

  const createNewFlavor = async () => {
    if (!newFlavor.name.trim()) {
      setError("Flavor name is required");
      return;
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    setCreatingFlavor(true);
    setError(null);
    try {
      const aliasesArray = newFlavor.aliases
        .split(",")
        .map((alias) => alias.trim())
        .filter((alias) => alias.length > 0);

      const { data } = await axios.post(
        `${API_URL}/3pack/admin/flavors`,
        {
          name: newFlavor.name.trim(),
          aliases: aliasesArray,
          active: true,
        },
        {
          withCredentials: true,
        }
      );

      // Add the new flavor to the available flavors list
      setAvailableFlavors((prev) => [
        ...prev,
        { id: data.id, name: data.name },
      ]);

      // Reset form
      setNewFlavor({ name: "", aliases: "" });
      setShowNewFlavorForm(false);
    } catch (e) {
      const message =
        (e as { message?: string })?.message || "Unable to create flavor. Please try again.";
      setError(message);
    } finally {
      setCreatingFlavor(false);
    }
  };

  const deleteFlavor = async (flavorId: string) => {
    if (!confirm("Are you sure you want to delete this flavor? This action cannot be undone and will affect any products using this flavor.")) {
      return;
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    setDeletingFlavor((prev) => ({ ...prev, [flavorId]: true }));
    setError(null);
    try {
      await axios.delete(`${API_URL}/3pack/admin/flavors/${flavorId}`, {
        withCredentials: true,
      });

      // Remove the flavor from the available flavors list
      setAvailableFlavors((prev) => prev.filter((f) => f.id !== flavorId));

      // Remove the flavor from any products that are using it
      setForm((prev) => ({
        ...prev,
        flavors: prev.flavors?.filter((f) => f.id !== flavorId) || [],
      }));
    } catch (e) {
      const message =
        (e as { message?: string })?.message || "Unable to delete flavor. Please try again.";
      setError(message);
    } finally {
      setDeletingFlavor((prev) => ({ ...prev, [flavorId]: false }));
    }
  };

  const fetchCategories = async () => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    try {
      const { data } = await axios.get<string[]>(
        `${API_URL}/products/categories`,
        { withCredentials: true }
      );
      if (Array.isArray(data)) setCategories(data);
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404) {
        try {
          const { data } = await axios.get<string[]>(
            `${API_URL}/products/categories`,
            { withCredentials: true }
          );
          if (Array.isArray(data)) setCategories(data);
        } catch (e2) {
          if (axios.isAxiosError(e2) && e2.response?.status === 404) {
            try {
              const { data } = await axios.get<string[]>(
                `${API_URL}/products/categories`,
                { withCredentials: true }
              );
              if (Array.isArray(data)) setCategories(data);
            } catch {
              /* ignore */
            }
          }
        }
      }
    }
  };

  useEffect(() => {
    if (user?.role === "admin") {
      fetchProducts();
      fetchCategories();
      fetchFlavors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page, limit, categoryFilter, search]);

  const totalPages = useMemo(
    () => Math.max(1, pagination?.pages || 1),
    [pagination?.pages]
  );

  // Show loading while checking authentication
  if (userLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF5D39] mx-auto mb-4"></div>
          <p className="text-black text-lg">Loading products...</p>
        </div>
      </div>
    );
  }

  const resetForm = () =>
    setForm({
      name: "",
      price: 0,
      category: "",
      description: "",
      imageUrl: "",
      sku: "",
      flavors: [],
    });

  const addFlavor = () => {
    if (form.flavors && form.flavors.length < 3) {
      setForm((prev) => ({
        ...prev,
        flavors: [...(prev.flavors || []), { id: "", name: "", quantity: 1 }],
      }));
    }
  };

  const removeFlavor = (index: number) => {
    setForm((prev) => ({
      ...prev,
      flavors: prev.flavors?.filter((_, i) => i !== index) || [],
    }));
  };

  const updateFlavor = (
    index: number,
    field: keyof Flavor,
    value: string | number
  ) => {
    setForm((prev) => {
      const nextFlavors = [...(prev.flavors || [])];
      const current = nextFlavors[index] || { id: "", name: "", quantity: 1 };
      if (field === "id") {
        const selected = availableFlavors.find((f) => f.id === value);
        nextFlavors[index] = {
          ...current,
          id: String(value || ""),
          name: selected?.name || current.name || "",
        };
      } else {
        nextFlavors[index] = { ...current, [field]: value } as Flavor;
      }
      return { ...prev, flavors: nextFlavors };
    });
  };

  const createProduct = async () => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("name", String(form.name || ""));
      fd.append("price", String(Number(form.price || 0)));
      fd.append("stock", String(Number(form.stock || 0)));
      fd.append("category", String(form.category || ""));
      if (form.description) fd.append("description", form.description);
      fd.append("isActive", String(!!form.isActive));
      if (form.sku) fd.append("sku", form.sku);
      if (Array.isArray(form.flavors)) {
        fd.append("flavors", JSON.stringify(normalizeFlavorsForSave(form.flavors)));
      }
      if (imageFile) fd.append("productImage", imageFile);
      if (!imageFile && form.imageUrl) fd.append("imageUrl", form.imageUrl);

      const { data: dataResp } = await axios.post<Product>(
        `${API_URL}/products/admin/products`,
        fd,
        {
          withCredentials: true,
          // Let browser set correct multipart boundary
        }
      );
      const data = dataResp as Product;
      setProducts((prev) => [data, ...prev]);
      resetForm();
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
      setPreview(null);
      setImageFile(null);
    } catch (e) {
      const message =
        (e as { message?: string })?.message || "Unable to create product. Please try again.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  // removed unused updateProduct function

  // Update using row data to avoid stale form state
  const updateProductByRow = async (
    row: Product,
    overrides: Partial<Product>
  ) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    setSaving(true);
    setError(null);
    try {
      const id = row.id;
      if (!id) {
        setError("Missing product id");
        setSaving(false);
        return;
      }
      const payload = {
        name: overrides.name ?? row.name,
        price: Number(overrides.price ?? row.price ?? 0),
        stock: Number(overrides.stock ?? row.stock ?? 0),
        category: overrides.category ?? row.category,
        description: overrides.description ?? row.description,
        imageUrl: overrides.imageUrl ?? row.imageUrl,
        imageBase64:
          (overrides as { imageBase64?: string }).imageBase64 || undefined,
        isActive: overrides.isActive ?? row.isActive ?? true,
        sku: overrides.sku ?? row.sku,
        flavors: normalizeFlavorsForSave(overrides.flavors ?? row.flavors),
      };

      // Optimistic update
      const prev = products;
      setProducts((cur) =>
        cur.map((p) => (p.id === id ? { ...p, ...payload } : p))
      );

      let dataResp: Product;
      try {
        // Primary route
        const { data } = await axios.put<Product>(
          `${API_URL}/products/admin/${id}`,
          payload,
          {
            withCredentials: true,
            headers: { "Content-Type": "application/json" },
          }
        );
        dataResp = data;
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          // Fallback legacy mount
          const { data } = await axios.put<Product>(
            `${API_URL}/products/admin/products/${id}`,
            payload,
            {
              withCredentials: true,
              headers: { "Content-Type": "application/json" },
            }
          );
          dataResp = data;
        } else {
          // Revert optimistic update
          setProducts(prev);
          throw e;
        }
      }
      const updated = dataResp as Product;
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updated } : p))
      );
    } catch (e) {
      const message =
        (e as { message?: string })?.message || "Failed to update product";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (id: string) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL;
    setDeleting(prev => ({ ...prev, [id]: true }));
    setError(null);
    try {
      try {
        // Primary route (mirrors updateProduct primary)
        await axios.delete(`${API_URL}/products/admin/${id}`, {
          withCredentials: true,
        });
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          // Fallback legacy mount
          await axios.delete(`${API_URL}/products/admin/products/${id}`, {
            withCredentials: true,
          });
        } else {
          throw e;
        }
      }
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      const message =
        (e as { message?: string })?.message || "Unable to delete product. Please try again.";
      setError(message);
    } finally {
      setDeleting(prev => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold text-black mb-6">Products</h1>

      {error && (
        <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-red-700">
          {error}
        </div>
      )}

      {/* Create / Edit form */}
      <div className="rounded-2xl border shadow bg-white p-6 mb-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-black">
            {openId ? "Edit product" : "Add new product"}
          </h2>
          {openId && (
            <button
              onClick={() => {
                setOpenId(null);
                resetForm();
              }}
              className="text-sm text-black underline cursor-pointer"
            >
              Cancel edit
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <div className="text-sm font-semibold text-black/80 mb-2">Product details</div>
              <div className="h-px w-full bg-gray-200 mb-3" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-black/70">Name</label>
              <input
                className="border rounded px-3 py-2 bg-white text-black focus:outline-none focus:ring-2 focus:ring-[#FF5D39]"
                placeholder="Product name"
                value={form.name || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-black/70">Price</label>
              <input
                className="border rounded px-3 py-2 bg-white text-black focus:outline-none focus:ring-2 focus:ring-[#FF5D39]"
                placeholder="0.00"
                type="number"
                value={form.price || 0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price: Number(e.target.value) }))
                }
              />
            </div>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm text-black/70">Stock</label>
                <input
                  className="border rounded px-3 py-2 bg-white text-black focus:outline-none focus:ring-2 focus:ring-[#FF5D39]"
                  placeholder="0"
                  type="number"
                  value={form.stock || 0}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, stock: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-black/70">SKU</label>
                <input
                  className="border rounded px-3 py-2 bg-white text-black focus:outline-none focus:ring-2 focus:ring-[#FF5D39]"
                  placeholder="e.g., 3P-SWE-WAT-BERDEL-CHE"
                  value={form.sku || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sku: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-sm text-black/70">Category</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  className="border rounded px-3 py-2 bg-white text-black focus:outline-none focus:ring-2 focus:ring-[#FF5D39]"
                  value={form.category || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  className="border rounded px-3 py-2 bg-white text-black focus:outline-none focus:ring-2 focus:ring-[#FF5D39]"
                  placeholder="Or type new category"
                  value={form.category || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                />
              </div>
            </div>
            
            <div className="flex flex-col gap-1 md:col-span-2">
              {/* Image URL input removed as per instructions; already provided elsewhere */}
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-sm text-black/70">Description</label>
              <textarea
                className="border rounded px-3 py-2 bg-white text-black focus:outline-none focus:ring-2 focus:ring-[#FF5D39]"
                rows={3}
                placeholder="Optional description"
                value={form.description || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-black/70">Flavors (Max 3)</label>
                <button
                  type="button"
                  onClick={addFlavor}
                  disabled={(form.flavors?.length || 0) >= 3}
                  className="text-sm text-[#FF5D39] hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + Add Flavor
                </button>
              </div>
              <div className="space-y-2">
                {form.flavors?.map((flavor, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-8 sm:col-span-9">
                      <select
                        className="w-full border rounded px-3 py-2 bg-white text-black focus:outline-none focus:ring-2 focus:ring-[#FF5D39]"
                        value={flavor.id}
                        onChange={(e) => {
                          if (e.target.value === "add_new") {
                            setShowNewFlavorForm(true);
                          } else {
                            updateFlavor(index, "id", e.target.value);
                          }
                        }}
                      >
                        <option value="">Select flavor</option>
                        {availableFlavors.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                        <option value="add_new" className="text-[#FF5D39] font-semibold">
                          + Add New Flavor
                        </option>
                      </select>
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <input
                        type="number"
                        min="1"
                        max="3"
                        className="w-full border rounded px-3 py-2 bg-white text-black focus:outline-none focus:ring-2 focus:ring-[#FF5D39]"
                        placeholder="Qty"
                        value={flavor.quantity}
                        onChange={(e) =>
                          updateFlavor(index, "quantity", parseInt(e.target.value) || 1)
                        }
                      />
                    </div>
                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() => removeFlavor(index)}
                        className="px-2 py-2 text-red-500 hover:text-red-700 cursor-pointer"
                        aria-label="Remove flavor"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                {(!form.flavors || form.flavors.length === 0) && (
                  <div className="text-sm text-gray-500 italic">
                    No flavors added. Click &quot;Add Flavor&quot; to add up to 3 flavors.
                  </div>
                )}
              </div>
              
              {/* Add New Flavor Form */}
              {showNewFlavorForm && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="text-sm font-semibold text-black mb-3">Add New Flavor</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Flavor Name *
                      </label>
                      <input
                        type="text"
                        value={newFlavor.name}
                        onChange={(e) => setNewFlavor({ ...newFlavor, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF5D39] text-sm text-black bg-white"
                        placeholder="e.g., Tropical Punch"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Aliases (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={newFlavor.aliases}
                        onChange={(e) => setNewFlavor({ ...newFlavor, aliases: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF5D39] text-sm text-black bg-white"
                        placeholder="e.g., tropical, punch, fruit"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={createNewFlavor}
                      disabled={creatingFlavor || !newFlavor.name.trim()}
                      className="bg-[#FF5D39] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm cursor-pointer"
                    >
                      {creatingFlavor ? "Creating..." : "Create Flavor"}
                    </button>
                    <button
                      onClick={() => {
                        setShowNewFlavorForm(false);
                        setNewFlavor({ name: "", aliases: "" });
                      }}
                      className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity text-sm cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              
              {/* Manage Existing Flavors */}
              {availableFlavors.length > 0 && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="text-sm font-semibold text-black mb-3">Manage Existing Flavors</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {availableFlavors.map((flavor) => (
                      <div
                        key={flavor.id}
                        className="flex items-center justify-between p-2 bg-white rounded border border-gray-200"
                      >
                        <span className="text-sm text-black truncate flex-1 mr-2">
                          {flavor.name}
                        </span>
                        <button
                          onClick={() => deleteFlavor(flavor.id)}
                          disabled={deletingFlavor[flavor.id]}
                          className="px-2 py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {deletingFlavor[flavor.id] ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="lg:col-span-1">
            <div className="rounded-xl border bg-white p-3 flex flex-col items-center justify-center">
              <div className="text-sm text-black/70 mb-2">Preview</div>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt={form.name || "preview"}
                  className="w-full max-w-[260px] aspect-[4/3] object-cover rounded"
                />
              ) : form.imageUrl ? (
                <Image
                  src={form.imageUrl}
                  alt={form.name || "preview"}
                  width={240}
                  height={180}
                  className="w-full max-w-[260px] aspect-[4/3] object-cover rounded"
                />
              ) : (
                <div className="w-full max-w-[260px] aspect-[4/3] bg-gray-100 rounded" />
              )}
            </div>
            <div className="mt-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (file) {
                    setImageFile(file);
                    const blobUrl = URL.createObjectURL(file);
                    setPreview(blobUrl);
                    setForm((f) => ({ ...f, imageUrl: "" }));
                  } else {
                    if (preview?.startsWith("blob:"))
                      URL.revokeObjectURL(preview);
                    setPreview(null);
                    setImageFile(null);
                  }
                }}
                className="block text-black text-sm"
              />
            </div>
            <label className="mt-4 flex items-center gap-2 text-black">
              <input
                type="checkbox"
                checked={!!form.isActive}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isActive: e.target.checked }))
                }
              />
              Active
            </label>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 justify-end">
          <button
            disabled={
              saving ||
              !form.name ||
              !form.category ||
              !form.sku ||
              Number(form.price || 0) <= 0 ||
              !form.flavors ||
              form.flavors.length === 0 ||
              !!openId
            }
            onClick={createProduct}
            className="px-4 py-2 rounded bg-[#FF5D39] text-white cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Add product"}
          </button>
          <button
            disabled={
              saving ||
              !openId ||
              !form.name ||
              !form.category ||
              Number(form.price || 0) <= 0
            }
            onClick={() => {
              if (!openId) return;
              const row = products.find((p) => p.id === openId);
              if (!row) return;
              // Build overrides without empty-string fields to avoid clearing data
              const overrides: Partial<Product> = {
                name: form.name || undefined,
                category: form.category || undefined,
                price:
                  typeof form.price === "number"
                    ? form.price
                    : Number(form.price || 0),
                stock:
                  typeof form.stock === "number"
                    ? form.stock
                    : Number(form.stock || 0),
                description:
                  form.description && form.description.trim() !== ""
                    ? form.description
                    : undefined,
                sku: form.sku && form.sku.trim() !== "" ? form.sku : undefined,
                isActive:
                  typeof form.isActive === "boolean"
                    ? form.isActive
                    : row.isActive,
                flavors:
                  form.flavors && form.flavors.length > 0
                    ? form.flavors
                    : undefined,
                // Do not pass imageUrl here unless explicitly set to avoid wiping existing image
                imageUrl:
                  form.imageUrl && form.imageUrl.trim() !== ""
                    ? form.imageUrl
                    : undefined,
              };
              updateProductByRow(row, overrides);
            }}
            className="px-4 py-2 rounded bg-[#F1A900] text-black cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
          <button
            disabled={saving}
            onClick={resetForm}
            className="px-4 py-2 rounded border border-gray-300 text-black bg-white hover:bg-gray-50 cursor-pointer disabled:cursor-not-allowed"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 mb-4">
        <input
          className="border rounded px-3 py-2 bg-white text-black w-full md:w-auto"
          placeholder="Search products by name"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <select
          className="border rounded px-3 py-2 bg-white text-black"
          value={categoryFilter}
          onChange={(e) => {
            setPage(1);
            setCategoryFilter(e.target.value);
          }}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="border rounded px-3 py-2 bg-white text-black"
          value={limit}
          onChange={(e) => {
            setPage(1);
            setLimit(parseInt(e.target.value) || 10);
          }}
        >
          <option value={10}>10 per page</option>
          <option value={20}>20 per page</option>
          <option value={50}>50 per page</option>
        </select>
      </div>

      {/* Products table */}
      <div className="overflow-x-auto border border-gray-200 rounded">
        <table className="min-w-full text-left">
          <thead className="bg-gray-50 sticky top-0  z-20">
            <tr>
              <th className="px-4 py-2 text-black">Image</th>
              <th className="px-4 py-2 text-black">Name</th>
              <th className="px-4 py-2 text-black">Price</th>
              <th className="px-4 py-2 text-black">Category</th>
              <th className="px-4 py-2 text-black">SKU</th>
              <th className="px-4 py-2 text-black">Stock</th>
              <th className="px-4 py-2 text-black">Flavors</th>
              <th className="px-4 py-2 text-black">Active</th>
              <th className="px-4 py-2 text-black">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map((p, idx) => {
              // Use only 'id' for Product type, remove reference to '_id'
              const pid = p.id || "";
              return (
                <tr
                  key={pid || idx}
                  className={idx % 2 === 0 ? "bg-white" : "bg-gray-50 hover:bg-gray-100"}
                >
                  <td className="px-4 py-2">
                    {p.imageUrl ? (
                      <Image
                        src={p.imageUrl}
                        alt={p.name}
                        width={64}
                        height={48}
                        className="w-16 h-12 object-cover rounded border"
                      />
                    ) : (
                      <div className="w-16 h-12 rounded bg-gray-100 border" />
                    )}
                  </td>
                  <td className="px-4 py-2 text-black">{p.name}</td>
                  <td className="px-4 py-2 text-black">
                    ${Number(p.price || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-black">{p.category}</td>
                  <td className="px-4 py-2 text-black text-sm">
                    {p.sku || "-"}
                  </td>
                  <td className="px-4 py-2 text-black">{p.stock || 0}</td>
                  <td className="px-4 py-2 text-black text-sm">
                    {formatFlavors(
                      extractFlavors(
                        (p as unknown as { flavors?: unknown }).flavors ??
                        (p as unknown as { flavours?: unknown }).flavours ??
                        (p as unknown as { flavor?: unknown }).flavor ??
                        (p as unknown as { options?: unknown }).options
                      )
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded ${
                        p.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {p.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        className="px-3 py-1 rounded border text-white hover:opacity-90 bg-secondary cursor-pointer"
                        onClick={() => {
                          setOpenId(pid);
                          setForm(p);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="px-3 py-1 rounded border text-white hover:opacity-90 bg-primary disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={deleting[pid]}
                        onClick={() => deleteProduct(pid)}
                      >
                        {deleting[pid] ? (
                          <div className="flex items-center">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                            Deleting...
                          </div>
                        ) : (
                          "Delete"
                        )}
                      </button>
                      <button
                        className="px-3 py-1 rounded border bg-secondary cursor-pointer"
                        onClick={() =>
                          updateProductByRow(p as Product, {
                            isActive: !p.isActive,
                          })
                        }
                      >
                        {p.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 mt-6">
          <button
            className="px-3 py-1 rounded border text-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <span className="text-black">
            Page {page} of {totalPages}
          </span>
          <button
            className="px-3 py-1 rounded border text-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      )}
      {loading && <div className="mt-4 text-black">Loading...</div>}
    </div>
  );
};

export default AddProductsPage;
