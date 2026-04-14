# Baraka

## Telegram-first MVP для локального retail и будущая mobile platform для nearby deals

Baraka — это платформа, которая помогает локальным fashion-магазинам превращать онлайн-интерес в реальные визиты в магазин.

Пользователь открывает Telegram Mini App, смотрит магазины и товары, активирует оффер и приходит в магазин с QR-кодом. Продавец сканирует QR в merchant-панели и подтверждает redeem. Админ видит аналитику, историю активаций и действия merchant accounts.

---

## 1. Проблема

Локальные магазины получают внимание в Instagram, Telegram и мессенджерах, но им сложно понять, какие офферы реально приводят человека в физический магазин.

Основные боли:

- просмотры и лайки не равны визитам;
- много ручной переписки с клиентами;
- нет понятного tracking-а от интереса до redeem;
- продавцам неудобно подтверждать офферы вручную;
- магазин не видит, какие товары и акции реально работают.

---

## 2. Решение

Baraka даёт простой цикл:

1. Клиент открывает Mini App.
2. Клиент видит магазины и товары.
3. Клиент активирует выбранные товары.
4. Baraka создаёт QR payload.
5. Клиент приходит в магазин.
6. Merchant сканирует QR и подтверждает redeem.
7. Admin видит историю и аналитику.

Главная ценность: Baraka измеряет не просто интерес, а офлайн-действие.

---

## 3. Почему Telegram First

Telegram Mini App — это MVP-layer, выбранный специально для быстрой проверки рынка.

Это не ограничение продукта, а быстрый способ:

- проверить customer flow;
- проверить merchant redeem;
- проверить store analytics;
- подключить первые магазины без дорогой native-разработки;
- доказать цикл discovery -> activation -> store visit -> redeem.

После финансирования Baraka может вырасти в полноценное native mobile приложение для iPhone и Android.

---

## 4. Что уже работает в MVP

Текущая MVP-версия уже включает:

- Telegram Mini App для клиентов;
- список магазинов;
- карточки товаров;
- избранное;
- activation flow;
- QR redeem flow;
- merchant login по магазину;
- merchant scanner/manual payload;
- admin dashboard;
- store/product management;
- bulk import товаров;
- merchant account management;
- redeem history;
- store analytics;
- audit log;
- Telegram bot webhook;
- health check endpoint.

---

## 5. Customer Flow

Пользователь:

1. Заходит через Telegram bot.
2. Нажимает `Open Baraka`.
3. Открывает Mini App.
4. Выбирает магазин.
5. Смотрит товары и скидки.
6. Активирует выбранный оффер.
7. Получает QR.
8. Показывает QR в магазине.

---

## 6. Merchant Flow

Merchant:

1. Заходит в merchant panel.
2. Вводит login/password.
3. Сканирует QR или вставляет payload.
4. Видит preview активации.
5. Проверяет товары.
6. Нажимает `Confirm Redeem`.
7. Redeem записывается в базу.

Защита:

- merchant видит только свой магазин;
- повторный redeem невозможен;
- истёкший QR не проходит;
- чужой store activation не проходит.

---

## 7. Admin Flow

Admin:

- создаёт магазины;
- добавляет товары;
- массово импортирует товары;
- создаёт merchant accounts;
- меняет пароли merchant accounts;
- включает/отключает merchant accounts;
- удаляет merchant accounts;
- смотрит redeem history;
- смотрит store analytics;
- смотрит audit log.

---

## 8. Bulk Import Products

Чтобы не добавлять товары вручную по одному, в админке есть `Bulk Import Products`.

Формат:

```text
Black Satin Dress | Evening dress with soft satin finish | Dress | 49 | 89 | S, M, L | 4 | https://... | 2026-05-01
```

Что делает система:

- парсит строки;
- создаёт draft cards;
- делает локальный AI cleanup;
- нормализует title/category/description/sizes;
- показывает preview;
- позволяет редактировать перед сохранением;
- импортирует все товары одним кликом.

---

## 9. Ценность для магазинов

Baraka помогает магазинам:

- приводить людей в офлайн-точку;
- продвигать конкретные товары;
- распродавать остатки;
- запускать ограниченные офферы;
- видеть, какие товары реально активируют;
- видеть, какие офферы дошли до redeem;
- подключить продавцов без сложной CRM.

---

## 10. Аналитика

Admin dashboard показывает:

- количество магазинов;
- количество товаров;
- active merchants;
- total activations;
- redeemed activations;
- active activations;
- expired activations;
- last redeem;
- аналитику по каждому магазину;
- audit log действий.

---

## 11. Roadmap после финансирования

Следующая версия Baraka — полноценное mobile-first приложение.

План:

1. Native iPhone app.
2. Native Android app.
3. Карта nearby deals.
4. Геолокация: что рядом, какие скидки активны.
5. Wishlist alerts.
6. Price-drop notifications.
7. Back-in-stock notifications.
8. In-app payments.
9. Merchant self-service.
10. Расширение в cafe/bakery/food surplus.

---

## 12. Расширение за пределы fashion

Та же модель может работать не только для одежды.

Будущие категории:

- кафе;
- пекарни;
- десерты;
- готовая еда;
- товары со скидкой в конце дня;
- local surplus offers.

Пример: кафе в конце рабочего дня продаёт оставшиеся булочки со скидкой, пользователь видит это рядом на карте и забирает заказ.

---

## 13. Pilot Plan

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
- customer feedback.

---

## 14. Почему сейчас

Локальные магазины уже используют Telegram и Instagram, но им не хватает простого инструмента, который соединяет онлайн-интерес и физический визит.

Baraka стартует там, где пользователи уже есть: Telegram.

MVP доказывает поведение быстро. Native app после финансирования расширит продукт до полноценной consumer platform.

---

## 15. One-Sentence Pitch

Baraka — это Telegram-first retail platform, которая превращает локальные офферы в реальные визиты в магазин и вырастает в mobile platform для nearby deals и local commerce.

---

## 16. Что нужно дальше

Ближайшие шаги:

- подключить 3-5 пилотных магазинов;
- провести 14-дневный тест;
- собрать feedback;
- улучшить customer/merchant UX;
- подготовить native app roadmap;
- искать финансирование для mobile app development.
