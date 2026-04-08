create table if not exists merchant_accounts (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  login text not null unique,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_merchant_accounts_store_id
  on merchant_accounts(store_id);

create table if not exists audit_logs (
  id text primary key,
  actor_type text not null,
  actor_id text not null default '',
  action text not null,
  entity_type text not null,
  entity_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at
  on audit_logs(created_at desc);

create index if not exists idx_audit_logs_actor_type
  on audit_logs(actor_type);
