# Apple Lounge Zimbabwe

Premium e-commerce website for Apple Lounge Zimbabwe — your destination for brand-new iPhones and Apple products in Victoria Falls, Zimbabwe.

## Tech Stack

**Frontend:**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- React 18
- Framer Motion
- Lucide React

**Backend:**
- Supabase Auth
- Supabase Postgres (Row Level Security)
- Supabase Storage (product images)
- Next.js API route for optional order emails

## Project Structure

```
apple-lounge/
├── frontend/                 # Next.js app
│   ├── app/                  # App Router pages + /api/orders/notify
│   ├── components/
│   ├── context/              # Cart, Auth
│   ├── lib/                  # Supabase client + data helpers
│   ├── public/Pics/          # Catalogue images
│   └── .env.example
└── supabase/
    ├── schema.sql            # Tables, RLS, place_order RPC
    └── seed.sql              # Product catalogue
```

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project

## Setup

### 1. Install

```bash
cd apple-lounge
npm --prefix frontend install
```

### 2. Supabase database

In the Supabase SQL editor:

1. Run `supabase/schema.sql`
2. Run `supabase/seed.sql`
3. Confirm Storage bucket `product-images` exists and is public (the schema script creates it)

### 3. Environment

Copy `frontend/.env.example` to `frontend/.env.local` and set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_WHATSAPP_NUMBER=263771234567
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Optional order emails (server-only):

```env
EMAIL_TO=gotocarlos197@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-gmail-address@gmail.com
SMTP_PASSWORD=your-gmail-app-password
```

### 4. Admin account

1. Create a user in **Supabase Auth** (email + password)
2. Promote that profile:

```sql
update public.profiles
set role = 'admin'
where id = '<auth-user-uuid>';
```

If the profile row is missing (user created before the trigger), insert it:

```sql
insert into public.profiles (id, name, role)
values ('<auth-user-uuid>', 'Admin', 'admin');
```

### 5. Run

```bash
cd apple-lounge
npm run dev
```

The store is at **http://localhost:3000**. Admin is at **http://localhost:3000/admin**.

## Admin Dashboard

Access at **http://localhost:3000/admin**

- Dashboard overview (products, orders, pending orders, sales)
- Product management (add, edit, delete, toggle featured)
- Image upload to Supabase Storage
- Order status and payment status

## Features

- Premium Apple-inspired design
- Responsive (mobile-first)
- Product catalogue with filtering and search
- Shopping cart with localStorage persistence
- Guest checkout with pickup/delivery
- WhatsApp ordering integration
- Admin dashboard with product and order management
- SEO (sitemap, meta tags, structured data)

## WhatsApp Integration

Products include "WhatsApp Us" buttons with a pre-filled message. Set `NEXT_PUBLIC_WHATSAPP_NUMBER`.

## Deployment

Deploy the Next.js app on Vercel (root directory `apple-lounge/frontend` or repo root with `npm run build`). Set the same env vars in the host. No Express server is required.

## License

All rights reserved. Apple Lounge Zimbabwe.
