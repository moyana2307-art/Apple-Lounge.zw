import { supabase } from './supabase';
import type { DashboardStats, Order, OrderItem, Product } from '@/types';

function fail(error: { message: string } | null): never {
  throw new Error(error?.message || 'Something went wrong');
}

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    model: String(row.model ?? ''),
    storage: String(row.storage ?? ''),
    price: Number(row.price ?? 0),
    price_label: (row.price_label as string | null) ?? null,
    description: String(row.description ?? ''),
    category: String(row.category ?? ''),
    image: (row.image as string | null) ?? null,
    stock: Number(row.stock ?? 0),
    featured: Boolean(row.featured),
    colors: String(row.colors ?? ''),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

function mapOrder(row: Record<string, unknown>): Order {
  return {
    id: Number(row.id),
    customer_name: String(row.customer_name ?? ''),
    customer_email: (row.customer_email as string | undefined) ?? undefined,
    customer_phone: String(row.customer_phone ?? ''),
    total_amount: Number(row.total_amount ?? 0),
    status: row.status as Order['status'],
    payment_status: row.payment_status as Order['payment_status'],
    delivery_method: row.delivery_method as Order['delivery_method'],
    delivery_address: (row.delivery_address as string | undefined) ?? undefined,
    order_notes: (row.order_notes as string | undefined) ?? undefined,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

const SORT_MAP: Record<string, { column: string; ascending: boolean }> = {
  price_asc: { column: 'price', ascending: true },
  price_desc: { column: 'price', ascending: false },
  newest: { column: 'created_at', ascending: false },
  popular: { column: 'stock', ascending: false },
  name: { column: 'name', ascending: true },
};

export async function getProducts(params?: Record<string, string>) {
  const page = parseInt(params?.page || '1', 10);
  const limit = parseInt(params?.limit || '100', 10);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.from('products').select('*', { count: 'exact' });

  if (params?.model) query = query.eq('model', params.model);
  if (params?.category) query = query.ilike('category', `%${params.category}%`);
  if (params?.featured === 'true') query = query.eq('featured', true);
  if (params?.minPrice) query = query.gte('price', Number(params.minPrice));
  if (params?.maxPrice) query = query.lte('price', Number(params.maxPrice));
  if (params?.storage) query = query.eq('storage', params.storage);
  if (params?.search) {
    const term = params.search.replace(/,/g, ' ').trim();
    query = query.or(`name.ilike.%${term}%,model.ilike.%${term}%,description.ilike.%${term}%`);
  }

  const sort = SORT_MAP[params?.sort || ''] || null;
  if (sort) {
    query = query.order(sort.column, { ascending: sort.ascending });
  } else {
    query = query.order('featured', { ascending: false }).order('created_at', { ascending: false });
  }

  const { data, error, count } = await query.range(from, to);
  if (error) fail(error);

  const total = count ?? 0;
  return {
    success: true,
    data: (data || []).map((row) => mapProduct(row as Record<string, unknown>)),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getProduct(id: number) {
  const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  if (error) fail(error);
  if (!data) throw new Error('Product not found');
  return { success: true, data: mapProduct(data as Record<string, unknown>) };
}

export async function getFeaturedProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('featured', true)
    .order('created_at', { ascending: false });
  if (error) fail(error);
  return { success: true, data: (data || []).map((row) => mapProduct(row as Record<string, unknown>)) };
}

export async function getProductsByCategory(category: string) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('category', category)
    .order('featured', { ascending: false })
    .order('price', { ascending: true });
  if (error) fail(error);
  return { success: true, data: (data || []).map((row) => mapProduct(row as Record<string, unknown>)) };
}

export async function getModels() {
  const { data, error } = await supabase.from('products').select('model, category').order('model');
  if (error) fail(error);
  const seen = new Set<string>();
  const models: { model: string; category: string }[] = [];
  for (const row of data || []) {
    const key = `${row.model}::${row.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    models.push({ model: row.model, category: row.category });
  }
  return { success: true, data: models };
}

export async function createProduct(payload: Partial<Product> & Record<string, unknown>) {
  const { data, error } = await supabase
    .from('products')
    .insert({
      name: payload.name,
      model: payload.model,
      storage: payload.storage ?? null,
      price: payload.price,
      price_label: payload.price_label ?? null,
      description: payload.description ?? null,
      category: payload.category || 'iphones',
      image: payload.image || null,
      stock: payload.stock ?? 0,
      featured: Boolean(payload.featured),
      colors: payload.colors || 'Black,Silver',
    })
    .select()
    .single();
  if (error) fail(error);
  return { success: true, data: mapProduct(data as Record<string, unknown>) };
}

export async function updateProduct(id: number, payload: Partial<Product> & Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  const keys = [
    'name', 'model', 'storage', 'price', 'price_label', 'description',
    'category', 'image', 'stock', 'featured', 'colors',
  ] as const;
  for (const key of keys) {
    if (payload[key] !== undefined) patch[key] = payload[key];
  }

  const { data, error } = await supabase.from('products').update(patch).eq('id', id).select().single();
  if (error) fail(error);
  return { success: true, data: mapProduct(data as Record<string, unknown>) };
}

export async function deleteProduct(id: number) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) fail(error);
  return { success: true, message: 'Product deleted successfully' };
}

export async function createOrder(orderData: {
  customer_name: string;
  customer_email?: string;
  customer_phone: string;
  delivery_method?: string;
  delivery_address?: string;
  order_notes?: string;
  items: { product_id: number; quantity: number; color?: string }[];
}) {
  const { data, error } = await supabase.rpc('place_order', {
    p_customer_name: orderData.customer_name,
    p_customer_email: orderData.customer_email || null,
    p_customer_phone: orderData.customer_phone,
    p_delivery_method: orderData.delivery_method || 'pickup',
    p_delivery_address: orderData.delivery_address || null,
    p_order_notes: orderData.order_notes || null,
    p_items: orderData.items,
  });
  if (error) fail(error);

  const result = data as {
    id: number;
    customer_name: string;
    total_amount: number;
    status: string;
    items: { name: string; quantity: number; color?: string; price: number }[];
    customer_email?: string;
    customer_phone?: string;
    delivery_method?: string;
    delivery_address?: string;
    order_notes?: string;
  };

  fetch('/api/orders/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order: {
        id: result.id,
        customer_name: result.customer_name,
        customer_email: result.customer_email,
        customer_phone: result.customer_phone,
        delivery_method: result.delivery_method,
        delivery_address: result.delivery_address,
        order_notes: result.order_notes,
        total_amount: result.total_amount,
      },
      items: result.items || [],
    }),
  }).catch(() => {});

  return {
    success: true,
    data: {
      id: Number(result.id),
      customer_name: result.customer_name,
      total_amount: Number(result.total_amount),
      status: result.status || 'pending',
      items: result.items,
    },
  };
}

export async function getOrders() {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) fail(error);
  return { success: true, data: (data || []).map((row) => mapOrder(row as Record<string, unknown>)) };
}

export async function getOrder(id: number) {
  const { data: order, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
  if (error) fail(error);
  if (!order) throw new Error('Order not found');

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('*, products(name, model, storage)')
    .eq('order_id', id);
  if (itemsError) fail(itemsError);

  const mappedItems: OrderItem[] = (items || []).map((row) => {
    const product = row.products as { name?: string; model?: string; storage?: string } | null;
    return {
      id: Number(row.id),
      order_id: Number(row.order_id),
      product_id: Number(row.product_id),
      quantity: Number(row.quantity),
      price: Number(row.price),
      color: row.color ?? undefined,
      name: product?.name,
      model: product?.model,
      storage: product?.storage,
    };
  });

  return { success: true, data: { ...mapOrder(order as Record<string, unknown>), items: mappedItems } };
}

export async function updateOrderStatus(id: number, payload: { status?: string; payment_status?: string }) {
  const patch: Record<string, unknown> = {};
  if (payload.status) patch.status = payload.status;
  if (payload.payment_status) patch.payment_status = payload.payment_status;

  const { data, error } = await supabase.from('orders').update(patch).eq('id', id).select().single();
  if (error) fail(error);
  return { success: true, data: mapOrder(data as Record<string, unknown>) };
}

export async function getDashboardStats() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);

  const [productsRes, ordersRes] = await Promise.all([
    supabase.from('products').select('id, category'),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
  ]);
  if (productsRes.error) fail(productsRes.error);
  if (ordersRes.error) fail(ordersRes.error);

  const products = productsRes.data || [];
  const orders = (ordersRes.data || []).map((row) => mapOrder(row as Record<string, unknown>));
  const paid = orders.filter((o) => o.payment_status === 'paid');
  const categoryMap = new Map<string, number>();
  for (const p of products) {
    const cat = p.category || 'other';
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
  }

  const monthlyMap = new Map<string, { total: number; orders: number }>();
  for (const order of orders) {
    if (new Date(order.created_at) < cutoff) continue;
    const month = order.created_at.slice(0, 7);
    const current = monthlyMap.get(month) || { total: 0, orders: 0 };
    current.total += order.total_amount;
    current.orders += 1;
    monthlyMap.set(month, current);
  }

  const data: DashboardStats = {
    totalProducts: products.length,
    totalOrders: orders.length,
    pendingOrders: orders.filter((o) => o.status === 'pending').length,
    totalSales: paid.reduce((sum, o) => sum + o.total_amount, 0),
    recentOrders: orders.slice(0, 10),
    categoryCounts: Array.from(categoryMap.entries()).map(([category, count]) => ({ category, count })),
    monthlySales: Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, stats]) => ({ month, total: stats.total, orders: stats.orders })),
  };

  return { success: true, data };
}

export async function uploadImage(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
  const { error } = await supabase.storage.from('product-images').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) fail(error);

  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return { success: true, data: { url: data.publicUrl } };
}
