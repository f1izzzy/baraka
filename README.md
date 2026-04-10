# Baraka

Baraka is a Telegram-first retail deals MVP for local fashion stores.

Customers browse store offers in a Telegram Mini App, activate a store-level QR, and redeem the offer in person. Merchants confirm redemption in a dedicated panel. Admins manage stores, products, merchant accounts, analytics, and audit history.

## Stack

- `backend/`: Express + Postgres on Render
- `miniapp/`: customer-facing Telegram Mini App on Vercel
- `merchant/`: merchant login + redeem panel on Vercel
- `admin/`: admin dashboard on Vercel
- `backend/sql/`: database schema and follow-up migrations

## Live Services

- Backend: `https://baraka-backend-71az.onrender.com`
- Mini App: `https://baraka-miniapp.vercel.app`
- Merchant: `https://baraka-merchant.vercel.app`
- Admin: `https://baraka-admin-eight.vercel.app`

## Core Flows

1. Customer opens Mini App from Telegram.
2. Customer browses stores and products.
3. Customer selects items from one store and activates them.
4. Backend creates a short-lived activation and QR payload.
5. Merchant logs in, scans the QR, previews items, and redeems the activation.
6. Admin monitors store performance, activations, merchant access, and audit events.

## Required Backend Environment Variables

See [backend/.env.example](/C:/Users/user/Documents/New%20project/baraka-project/baraka/backend/.env.example).

Required in production:

- `DATABASE_URL`
- `ADMIN_API_KEY`
- `MERCHANT_API_KEY`
- `MERCHANT_TOKEN_SECRET`
- `BOT_TOKEN`
- `WEBHOOK_BASE_URL`
- `CORS_ORIGINS`

## Database Setup

Run these SQL files in Supabase SQL Editor:

1. [backend/sql/001_init_schema.sql](/C:/Users/user/Documents/New%20project/baraka-project/baraka/backend/sql/001_init_schema.sql)
2. [backend/sql/002_merchant_and_audit.sql](/C:/Users/user/Documents/New%20project/baraka-project/baraka/backend/sql/002_merchant_and_audit.sql)

## Launch Checklist

- Confirm Render backend is `Live`
- Confirm `GET /api/health` returns `ok: true`
- Confirm Vercel projects are deployed from the latest commit
- Confirm Telegram bot `/start` responds
- Confirm admin login key works
- Confirm merchant login works for at least one store
- Confirm product activation and redeem flow works end-to-end
- Confirm audit log records merchant login and redemption
- Confirm store analytics and redeem history are visible in admin

## Incident Checks

If something breaks, check in this order:

1. Render backend logs and `/api/health`
2. Supabase availability and `DATABASE_URL`
3. Vercel deployment status for `miniapp`, `merchant`, `admin`
4. `BOT_TOKEN`, `WEBHOOK_BASE_URL`, and `CORS_ORIGINS`
5. Merchant account status in admin

## Operations Notes

- Admin sections are collapsible and remember open/closed state in the browser.
- Merchant access is store-based, not shared-key only.
- Audit logs track operational actions such as merchant login and account changes.
- Health endpoint: `GET /api/health`
