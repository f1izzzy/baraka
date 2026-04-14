# Техническое задание: Baraka

## 1. Краткое описание проекта

Baraka — это Telegram-first MVP платформа для локальных fashion-магазинов. Пользователь открывает Telegram Mini App, просматривает магазины и товары, выбирает интересующие позиции, активирует оффер и получает QR-код для redeem в физическом магазине. Продавец входит в merchant-панель, сканирует или вставляет QR payload, проверяет товары и подтверждает redeem. Администратор управляет магазинами, товарами, merchant-аккаунтами, аналитикой и audit log.

Текущий продукт является MVP-версией. После финансирования планируется развитие в полноценное native mobile приложение для iPhone и Android с картой nearby deals, push-уведомлениями, wishlist alerts, in-app payments и расширением категорий за пределы fashion: кафе, пекарни, готовая еда и end-of-day discounted surplus.

## 2. Цели проекта

- Проверить спрос на локальные офферы через Telegram Mini App.
- Доказать цикл: discovery -> activation -> store visit -> redeem.
- Дать магазинам простой канал для офлайн-конверсии.
- Дать продавцам простой инструмент проверки QR.
- Дать администратору управление каталогом, магазинами, merchant-доступами и аналитикой.
- Подготовить основу для будущей mobile-first платформы.

## 3. Пользовательские роли

### 3.1 Customer

Пользователь Telegram Mini App.

Функции:

- открыть Mini App из Telegram bot;
- смотреть список магазинов;
- открывать карточку магазина;
- смотреть товары;
- добавлять товары в избранное;
- выбирать товары одного магазина;
- активировать выбранные товары;
- получить QR payload для redeem в магазине.

### 3.2 Merchant

Сотрудник магазина.

Функции:

- войти в merchant panel по login/password;
- сканировать QR или вставить payload вручную;
- увидеть preview активации;
- проверить товары;
- подтвердить redeem;
- получить ошибку при повторном/истёкшем/чужом redeem.

### 3.3 Admin

Оператор платформы Baraka.

Функции:

- создавать, редактировать и удалять магазины;
- создавать, редактировать и удалять товары;
- массово импортировать товары через Bulk Import;
- создавать merchant accounts;
- менять пароль merchant account;
- включать/отключать merchant account;
- удалять merchant account;
- смотреть redeem history;
- фильтровать redeem history;
- смотреть dashboard summary;
- смотреть store analytics;
- смотреть audit log;
- включать Telegram bot webhook.

## 4. Состав системы

### 4.1 Backend

Папка: `backend/`

Технологии:

- Node.js;
- Express;
- PostgreSQL через Supabase;
- Render для production deployment.

Назначение:

- API для miniapp, merchant, admin;
- Telegram auth и webhook bot;
- управление магазинами и товарами;
- activation/redeem flow;
- merchant authentication;
- admin protected routes;
- audit logging;
- health check.

### 4.2 Mini App

Папка: `miniapp/`

Назначение:

- клиентский интерфейс для пользователей;
- просмотр магазинов и товаров;
- favorites;
- product activation;
- QR payload display;
- auto refresh.

### 4.3 Merchant Panel

Папка: `merchant/`

Назначение:

- login для merchant по магазину;
- scanner/manual payload input;
- activation preview;
- confirm redeem.

### 4.4 Admin Panel

Папка: `admin/`

Назначение:

- операционная панель управления Baraka;
- store/product CRUD;
- Bulk Import Products;
- merchant account management;
- analytics;
- audit log;
- redeem history;
- collapsible sections.

### 4.5 Presentation Site

Папка: `presentation/`

Назначение:

- промо-сайт вместо PPT;
- объяснение продукта;
- roadmap;
- MVP vs future app vision;
- три языка: EN/RU/UZ.

### 4.6 Launch Kit

Папка: `launch-kit/`

Назначение:

- onboarding первых 3-5 магазинов;
- outreach message;
- intake template;
- launch checklist;
- 14-day pilot plan;
- feedback form.

## 5. Основные production URL

- Backend: `https://baraka-backend-71az.onrender.com`
- Mini App: `https://baraka-miniapp.vercel.app`
- Merchant: `https://baraka-merchant.vercel.app`
- Admin: `https://baraka-admin-eight.vercel.app`

## 6. Основной пользовательский сценарий

1. Пользователь открывает Telegram bot.
2. Нажимает кнопку `Open Baraka`.
3. Открывается Telegram Mini App.
4. Пользователь выбирает магазин.
5. Пользователь выбирает один или несколько товаров.
6. Пользователь активирует выбранные товары.
7. Backend создаёт activation с коротким сроком жизни.
8. Mini App показывает QR payload.
9. Пользователь приходит в магазин.
10. Merchant входит в merchant panel.
11. Merchant сканирует QR или вставляет payload.
12. Merchant видит preview товаров.
13. Merchant нажимает `Confirm Redeem`.
14. Backend помечает activation как redeemed.
15. Admin видит событие в redeem history и audit log.

## 7. Functional Requirements

### 7.1 Stores

Admin должен иметь возможность:

- создать магазин;
- редактировать магазин;
- удалить магазин;
- указать name, description, location, address, cover image, logo;
- видеть количество товаров по магазину.

Customer должен иметь возможность:

- увидеть список магазинов;
- открыть магазин;
- увидеть товары магазина.

### 7.2 Products

Admin должен иметь возможность:

- создать товар вручную;
- редактировать товар;
- удалить товар;
- массово импортировать товары через Bulk Import;
- указать title, description, category, price, old price, sizes, quantity, expiration date, image URL.

Bulk Import должен поддерживать:

- textarea для вставки многих строк;
- формат через `|`;
- parser;
- локальный AI cleanup;
- preview перед импортом;
- редактирование draft cards;
- удаление отдельного draft;
- one-click import.

Рекомендуемый формат строки:

```text
Black Satin Dress | Evening dress with soft satin finish | Dress | 49 | 89 | S, M, L | 4 | https://... | 2026-05-01
```

### 7.3 Favorites

Customer должен иметь возможность:

- добавить товар в избранное;
- убрать товар из избранного;
- видеть избранные товары.

### 7.4 Activations

Customer должен иметь возможность:

- выбрать товары одного магазина;
- создать activation;
- получить QR payload.

Backend должен:

- хранить activation;
- хранить telegram_id, store_id, product_ids;
- хранить activated_at, expires_at;
- отслеживать redeemed и redeemed_at;
- не позволять redeem после expiration;
- не позволять повторный redeem.

### 7.5 Merchant Redeem

Merchant должен иметь возможность:

- войти через login/password;
- работать только со своим store_id;
- preview activation только для своего магазина;
- confirm redeem только для своего магазина;
- получать понятные ошибки при чужом, истёкшем или уже redeemed QR.

### 7.6 Merchant Accounts

Admin должен иметь возможность:

- создать merchant account;
- login должен быть уникальным;
- повторный login не должен перезаписывать старый аккаунт;
- менять пароль;
- отключать аккаунт;
- включать аккаунт;
- удалять аккаунт;
- видеть статус аккаунта.

### 7.7 Admin Analytics

Admin должен видеть:

- dashboard summary;
- количество stores;
- количество products;
- active merchants;
- total activations;
- redeemed activations;
- active activations;
- expired activations;
- last redeemed date;
- store analytics по каждому магазину;
- redeem history с фильтрами.

### 7.8 Audit Log

Backend должен писать audit events для важных операций:

- store_created;
- store_updated;
- store_deleted;
- product_created;
- product_updated;
- product_deleted;
- products_bulk_created;
- merchant_account_created;
- merchant_account_updated;
- merchant_account_deleted;
- merchant_logged_in;
- activation_redeemed.

Admin должен видеть audit log в dashboard.

## 8. Backend API Requirements

### 8.1 Public / Customer

- `GET /api/stores`
- `GET /api/stores/:id`
- `POST /api/users/login`
- `POST /api/favorites/toggle`
- `GET /api/favorites/:telegramId`
- `POST /api/activations`

### 8.2 Merchant

- `POST /api/merchant/login`
- `POST /api/activations/preview`
- `POST /api/redeem`

Merchant endpoints должны проверять merchant token и store ownership.

### 8.3 Admin

Admin endpoints должны требовать `x-api-key`.

- `POST /api/stores`
- `PUT /api/stores/:id`
- `DELETE /api/stores/:id`
- `POST /api/products`
- `POST /api/products/bulk`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `GET /api/admin/merchant-accounts`
- `POST /api/admin/merchant-accounts`
- `PATCH /api/admin/merchant-accounts/:id`
- `DELETE /api/admin/merchant-accounts/:id`
- `GET /api/admin/dashboard-summary`
- `GET /api/admin/store-analytics`
- `GET /api/admin/audit-logs`
- `POST /api/admin/bot/set-webhook`

### 8.4 Health

- `GET /api/health`

Response должен показывать:

- `ok`;
- service name;
- database status;
- timestamp;
- env configuration flags.

## 9. Database Requirements

Основные таблицы:

- `users`
- `stores`
- `products`
- `favorites`
- `activations`
- `merchant_accounts`
- `audit_logs`

### 9.1 merchant_accounts

Поля:

- `id`
- `store_id`
- `login`
- `password_hash`
- `is_active`
- `created_at`
- `updated_at`

Требования:

- `login` уникальный;
- `store_id` связан со `stores`;
- при удалении store связанные merchant_accounts могут удаляться каскадно;
- отключенный merchant не должен логиниться.

### 9.2 audit_logs

Поля:

- `id`
- `actor_type`
- `actor_id`
- `action`
- `entity_type`
- `entity_id`
- `metadata`
- `created_at`

## 10. Security Requirements

- Admin API защищается `ADMIN_API_KEY`.
- Merchant API защищается merchant token.
- Merchant token должен быть подписан `MERCHANT_TOKEN_SECRET`.
- Backend CORS должен принимать только production фронтенды через `CORS_ORIGINS`.
- `BOT_TOKEN`, `DATABASE_URL`, `ADMIN_API_KEY`, `MERCHANT_API_KEY`, `MERCHANT_TOKEN_SECRET` не должны храниться в репозитории.
- Нельзя публично отдавать все activations без авторизации.
- Redeem должен быть одноразовым.
- Merchant не должен иметь доступ к чужому store_id.

## 11. Environment Variables

Backend production env:

- `DATABASE_URL`
- `ADMIN_API_KEY`
- `MERCHANT_API_KEY`
- `MERCHANT_TOKEN_SECRET`
- `BOT_TOKEN`
- `WEBHOOK_BASE_URL`
- `CORS_ORIGINS`
- `PORT`

## 12. Deployment Requirements

### 12.1 Render

Backend service:

- Root directory: `backend`
- Build command: `npm install`
- Start command: `node server.js`
- Health check: `GET /api/health`

### 12.2 Vercel

Projects:

- `baraka-miniapp`, root directory `miniapp`
- `baraka-merchant`, root directory `merchant`
- `baraka-admin`, root directory `admin`
- optional `baraka-presentation`, root directory `presentation`

## 13. Launch Requirements

Перед запуском проверить:

- backend `Live`;
- `/api/health` возвращает `ok: true`;
- database status `up`;
- miniapp открывается;
- merchant panel открывается;
- admin открывается;
- Telegram bot `/start` отвечает;
- store visible в miniapp;
- product visible в miniapp;
- activation работает;
- merchant preview работает;
- redeem работает один раз;
- повторный redeem не проходит;
- redeem history обновляется;
- audit log пишет события.

## 14. Pilot Plan

Первый пилот:

- 3-5 магазинов;
- 8-20 товаров на магазин;
- 1 merchant account на магазин;
- длительность 14 дней.

Метрики:

- activations;
- redeems;
- activation -> redeem conversion;
- top stores;
- top products;
- merchant feedback;
- customer confusion points;
- product data quality.

## 15. Future Roadmap

После MVP:

- native iPhone app;
- native Android app;
- map with nearby deals;
- wishlist alerts;
- price-drop notifications;
- back-in-stock notifications;
- in-app payments;
- merchant self-service;
- richer analytics;
- food/cafe/bakery category expansion;
- end-of-day surplus deals.

## 16. Acceptance Criteria

MVP считается готовым, если:

- customer может открыть Mini App и активировать товар;
- merchant может redeem товар;
- admin может управлять stores/products/merchant accounts;
- bulk import работает;
- analytics и audit работают;
- Telegram bot webhook работает;
- production health check проходит;
- store pilot можно запустить по launch-kit.

## 17. Non-Goals for Current MVP

В текущем MVP не требуется:

- полноценная native app разработка;
- real-time push notifications;
- встроенные платежи;
- сложная permission модель;
- автоматический импорт из Instagram;
- полноценная CRM для магазинов.

Эти функции относятся к post-MVP roadmap.
