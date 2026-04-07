create table if not exists users (
  id text primary key,
  telegram_id text not null unique,
  first_name text not null default '',
  username text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists stores (
  id text primary key,
  name text not null default '',
  description text not null default '',
  location text not null default '',
  address text not null default '',
  cover_image text not null default '',
  logo text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists products (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  category text not null default 'Other',
  price numeric(12, 2) not null default 0,
  old_price numeric(12, 2) not null default 0,
  image text not null default '',
  sizes text[] not null default '{}',
  remaining_quantity integer not null default 0,
  views integer not null default 0,
  expiration_date date null,
  created_at timestamptz not null default now()
);

create table if not exists favorites (
  id text primary key,
  telegram_id text not null,
  product_id text not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (telegram_id, product_id)
);

create table if not exists activations (
  id text primary key,
  telegram_id text not null,
  store_id text not null references stores(id) on delete cascade,
  product_ids text[] not null default '{}',
  activated_at timestamptz not null default now(),
  expires_at bigint not null,
  redeemed boolean not null default false,
  redeemed_at timestamptz null
);

create index if not exists idx_products_store_id on products(store_id);
create index if not exists idx_favorites_telegram_id on favorites(telegram_id);
create index if not exists idx_activations_telegram_id on activations(telegram_id);
create index if not exists idx_activations_store_id on activations(store_id);
