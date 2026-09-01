
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  phone text,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);

create table if not exists public.products (
  id bigint generated always as identity primary key,
  name text not null,
  model text not null,
  storage text,
  price numeric(10,2) not null,
  price_label text,
  description text,
  category text not null default 'iphones',
  image text,
  stock int not null default 0,
  featured boolean not null default false,
  colors text not null default 'Black,Silver,Blue',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_model on public.products(model);
create index if not exists idx_products_category on public.products(category);
create index if not exists idx_products_featured on public.products(featured);
create index if not exists idx_products_price on public.products(price);
create index if not exists idx_products_stock on public.products(stock);

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text,
  customer_phone text not null,
  total_amount numeric(10,2) not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  delivery_method text not null default 'pickup' check (delivery_method in ('pickup', 'delivery')),
  delivery_address text,
  order_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_payment_status on public.orders(payment_status);
create index if not exists idx_orders_user_id on public.orders(user_id);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  quantity int not null default 1,
  price numeric(10,2) not null,
  color text
);

create index if not exists idx_order_items_order_id on public.order_items(order_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth → profile
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone',
    'customer'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Guest checkout: validates stock, inserts order + items, decrements stock.
create or replace function public.place_order(
  p_customer_name text,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_delivery_method text default 'pickup',
  p_delivery_address text default null,
  p_order_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty int;
  v_total numeric(10,2) := 0;
  v_order_id bigint;
  v_line_items jsonb := '[]'::jsonb;
  v_method text;
begin
  if p_customer_name is null or length(trim(p_customer_name)) = 0 then
    raise exception 'Customer name is required';
  end if;
  if p_customer_phone is null or length(trim(p_customer_phone)) = 0 then
    raise exception 'Customer phone is required';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No items in order';
  end if;

  v_method := coalesce(nullif(trim(p_delivery_method), ''), 'pickup');
  if v_method not in ('pickup', 'delivery') then
    raise exception 'Invalid delivery method. Must be pickup or delivery';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 then
      raise exception 'Invalid quantity';
    end if;

    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::bigint
    for update;

    if not found then
      raise exception 'Product % not found', v_item->>'product_id';
    end if;

    if v_product.stock < v_qty then
      raise exception 'Insufficient stock for %', v_product.name;
    end if;

    v_total := v_total + (v_product.price * v_qty);
    v_line_items := v_line_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'name', v_product.name,
      'quantity', v_qty,
      'color', v_item->>'color',
      'price', v_product.price
    ));
  end loop;

  insert into public.orders (
    user_id,
    customer_name,
    customer_email,
    customer_phone,
    total_amount,
    delivery_method,
    delivery_address,
    order_notes
  ) values (
    auth.uid(),
    trim(p_customer_name),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    trim(p_customer_phone),
    v_total,
    v_method,
    nullif(p_delivery_address, ''),
    nullif(p_order_notes, '')
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(v_line_items)
  loop
    insert into public.order_items (order_id, product_id, quantity, price, color)
    values (
      v_order_id,
      (v_item->>'product_id')::bigint,
      (v_item->>'quantity')::int,
      (v_item->>'price')::numeric,
      nullif(v_item->>'color', '')
    );

    update public.products
    set stock = stock - (v_item->>'quantity')::int
    where id = (v_item->>'product_id')::bigint;
  end loop;

  return jsonb_build_object(
    'id', v_order_id,
    'customer_name', trim(p_customer_name),
    'customer_email', p_customer_email,
    'customer_phone', trim(p_customer_phone),
    'delivery_method', v_method,
    'delivery_address', p_delivery_address,
    'order_notes', p_order_notes,
    'total_amount', v_total,
    'status', 'pending',
    'items', v_line_items
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Admins update profiles" on public.profiles;
create policy "Admins update profiles"
  on public.profiles for update
  using (public.is_admin());

drop policy if exists "Public read products" on public.products;
create policy "Public read products"
  on public.products for select
  using (true);

drop policy if exists "Admins insert products" on public.products;
create policy "Admins insert products"
  on public.products for insert
  with check (public.is_admin());

drop policy if exists "Admins update products" on public.products;
create policy "Admins update products"
  on public.products for update
  using (public.is_admin());

drop policy if exists "Admins delete products" on public.products;
create policy "Admins delete products"
  on public.products for delete
  using (public.is_admin());

drop policy if exists "Admins read orders" on public.orders;
create policy "Admins read orders"
  on public.orders for select
  using (public.is_admin());

drop policy if exists "Admins update orders" on public.orders;
create policy "Admins update orders"
  on public.orders for update
  using (public.is_admin());

drop policy if exists "Admins read order items" on public.order_items;
create policy "Admins read order items"
  on public.order_items for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on table public.products to anon, authenticated;
grant insert, update, delete on table public.products to authenticated;

grant select, update on table public.orders to authenticated;
grant select on table public.order_items to authenticated;

grant select, update on table public.profiles to authenticated;

grant usage, select on all sequences in schema public to anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.place_order(text, text, text, text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: product-images (public read, admin write)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "Admins upload product images" on storage.objects;
create policy "Admins upload product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins update product images" on storage.objects;
create policy "Admins update product images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins delete product images" on storage.objects;
create policy "Admins delete product images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
