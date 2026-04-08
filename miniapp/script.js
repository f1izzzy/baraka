const tg = window.Telegram?.WebApp || null;
if (tg) tg.expand();

const initData = tg?.initData || "";
const rawTelegramUser = tg?.initDataUnsafe?.user || null;
let telegramUser = null;

const API_BASE =
  window.APP_CONFIG?.API_BASE || "https://baraka-backend-71az.onrender.com";

console.log("tg =", tg);
console.log("rawTelegramUser =", rawTelegramUser);
console.log("API_BASE =", API_BASE);

let currentStoreId = null;
let currentCategory = "All";
let currentStoreProducts = [];
let selectedProducts = [];
let favoriteIds = [];
let myDealsCache = [];

function getTelegramId() {
  return (
    telegramUser?.telegramId || telegramUser?.id || rawTelegramUser?.id || null
  );
}

async function loginUser() {
  if (!initData) {
    console.warn("No Telegram initData");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/telegram`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ initData }),
    });

    const data = await res.json();
    console.log("auth response =", data);

    if (data.user) {
      telegramUser = data.user;
      console.log("Logged in user =", telegramUser);
    } else {
      console.warn("No user returned from backend");
    }
  } catch (err) {
    console.error("Auth error:", err);
  }
}

function showTab(tabId, btn) {
  document.getElementById("storesTab").classList.add("hidden");
  document.getElementById("favoritesTab").classList.add("hidden");
  document.getElementById("myDealsTab").classList.add("hidden");

  document.getElementById(tabId).classList.remove("hidden");

  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  if (tabId === "favoritesTab") loadFavorites();
  if (tabId === "myDealsTab") loadMyDeals();
}

function renderSkeleton(targetId, count = 2) {
  const container = document.getElementById(targetId);
  container.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    card.innerHTML = `
      <div class="skeleton-image"></div>
      <div class="skeleton-content">
        <div class="skeleton-line medium"></div>
        <div class="skeleton-line long"></div>
        <div class="skeleton-line short"></div>
      </div>
    `;
    container.appendChild(card);
  }
}

async function loadFavoriteIds() {
  const telegramId = getTelegramId();

  if (!telegramId) {
    favoriteIds = [];
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/favorites/${telegramId}`);

    if (!res.ok) {
      throw new Error(`loadFavoriteIds failed: ${res.status}`);
    }

    const products = await res.json();
    favoriteIds = products.map((p) => p._id);
  } catch (err) {
    console.error("loadFavoriteIds error:", err);
    favoriteIds = [];
  }
}

async function loadStores() {
  renderSkeleton("stores", 2);

  const res = await fetch(`${API_BASE}/api/stores`);
  const stores = await res.json();

  const container = document.getElementById("stores");
  container.innerHTML = "";

  if (!stores.length) {
    container.innerHTML = `<div class="empty-box">No stores yet.</div>`;
    return;
  }

  stores.forEach((store) => {
    const card = document.createElement("div");
    card.className = "store-card";

    card.innerHTML = `
      <img src="${store.coverImage}" alt="${store.name}">
      <div class="store-content">
        <div class="store-title">${store.name}</div>
        <div class="store-description">${store.description}</div>
        <div class="store-meta">
          <span>${store.location}</span>
          <span>${store.productCount} products</span>
        </div>
        <button class="main-btn" onclick="openStore('${store._id}')">Open Store</button>
      </div>
    `;

    container.appendChild(card);
  });
}

async function openStore(storeId, category = "All") {
  document.body.style.opacity = "0.6";
  currentStoreId = storeId;
  currentCategory = category;

  document.getElementById("homeView").classList.add("hidden");
  document.getElementById("storeView").classList.remove("hidden");

  renderSkeleton("products", 2);

  try {
    const res = await fetch(`${API_BASE}/api/stores/${storeId}`);
    const data = await res.json();

    if (!res.ok || !data.store) {
      throw new Error(data.error || "Failed to load store");
    }

    renderStoreDetails(data.store);
    currentStoreProducts = (data.products || []).map((p) => ({
      ...p,
      storeName: data.store?.name || "",
    }));
    renderCategoryFilters(currentStoreProducts);
    renderProducts(currentStoreProducts);
  } catch (err) {
    console.error("openStore error:", err);
    document.getElementById("products").innerHTML =
      `<div class="empty-box">Failed to load products.</div>`;
  } finally {
    setTimeout(() => {
      document.body.style.opacity = "1";
    }, 150);
  }
}

function renderStoreDetails(store) {
  const container = document.getElementById("storeDetails");

  container.innerHTML = `
    <div class="store-header">
      <img class="cover" src="${store.coverImage}" alt="${store.name}">
      <div class="store-header-content">
        <div class="location-badge">${store.location}</div>
        <div class="store-title">${store.name}</div>
        <div class="store-description">${store.description}</div>
        <div class="store-meta">
          <span>${store.address}</span>
        </div>
      </div>
    </div>
  `;
}

function renderCategoryFilters(products) {
  const container = document.getElementById("categoryFilters");

  const categories = [
    "All",
    ...new Set(products.map((p) => p.category).filter(Boolean)),
  ];

  container.innerHTML = `
    <div class="category-row">
      ${categories
        .map(
          (cat) => `
          <div class="category-chip ${cat === currentCategory ? "active" : ""}" onclick="setCategory('${cat}')">
            ${cat}
          </div>
        `,
        )
        .join("")}
    </div>
  `;
}

function setCategory(category) {
  currentCategory = category;
  renderCategoryFilters(currentStoreProducts);
  renderProducts(currentStoreProducts);
}

function getFilteredAndSortedProducts(products) {
  const search = (document.getElementById("searchInput")?.value || "")
    .toLowerCase()
    .trim();
  const sort = document.getElementById("sortSelect")?.value || "default";

  let filtered = [...products];

  if (currentCategory !== "All") {
    filtered = filtered.filter((p) => p.category === currentCategory);
  }

  if (search) {
    filtered = filtered.filter((p) => {
      const title = (p.title || "").toLowerCase();
      const category = (p.category || "").toLowerCase();
      const storeName = (p.storeName || "").toLowerCase();
      return (
        title.includes(search) ||
        category.includes(search) ||
        storeName.includes(search)
      );
    });
  }

  if (sort === "cheap") filtered.sort((a, b) => a.price - b.price);
  if (sort === "expensive") filtered.sort((a, b) => b.price - a.price);
  if (sort === "views") filtered.sort((a, b) => b.views - a.views);
  if (sort === "discount") {
    filtered.sort((a, b) => b.oldPrice - b.price - (a.oldPrice - a.price));
  }

  return filtered;
}

function renderProducts(products) {
  const container = document.getElementById("products");
  container.innerHTML = "";

  const filtered = getFilteredAndSortedProducts(products);

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-box">No products found.</div>`;
    return;
  }

  filtered.forEach((product) => {
    const sizesHtml = (product.sizes || [])
      .map((size) => `<span class="size-chip">${size}</span>`)
      .join("");

    const isFav = favoriteIds.includes(product._id);
    const isSelected = selectedProducts.includes(product._id);

    const card = document.createElement("div");
    card.className = "product-card";

    card.innerHTML = `
      <img src="${product.image}" alt="${product.title}">
      <div class="product-content">
        <div class="title">${product.title}</div>
        <div class="description">${product.description || ""}</div>
        <div class="price">
          <span class="new">$${product.price}</span>
          <span class="old">$${product.oldPrice}</span>
        </div>
        <div class="sizes">${sizesHtml}</div>
        <div class="meta">
          <span>${product.category || "Other"}</span>
          <span class="qty">Only ${product.remainingQuantity} left</span>
        </div>
        <div class="meta">
          <span>${product.views} viewed</span>
        </div>
        <div class="card-actions">
          <button class="icon-btn ${isFav ? "active" : ""}" onclick="toggleFavorite('${product._id}', this)">♥</button>
          <button
  class="main-btn ${isSelected ? "selected-product-btn" : ""}"
  onclick="toggleSelect('${product._id}', this)"
>
  ${isSelected ? "Added" : "Add"}
</button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

function toggleSelect(productId, btn) {
  if (selectedProducts.includes(productId)) {
    selectedProducts = selectedProducts.filter((id) => id !== productId);
    btn.textContent = "Add";
    btn.classList.remove("selected-product-btn");
  } else {
    selectedProducts.push(productId);
    btn.textContent = "Added";
    btn.classList.add("selected-product-btn");
  }

  updateBottomBar();
}

function renderBottomBar() {
  const bar = document.getElementById("bottomBar");
  const count = document.getElementById("selectedCount");

  if (!selectedProducts.length) {
    bar.classList.add("hidden");
    return;
  }

  bar.classList.remove("hidden");
  count.textContent = `${selectedProducts.length} selected`;
}

async function activateStore() {
  const telegramId = getTelegramId();

  if (!telegramId) {
    alert("No Telegram user");
    return;
  }

  const res = await fetch(`${API_BASE}/api/activate-store`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      telegramId,
      storeId: currentStoreId,
      productIds: selectedProducts,
    }),
  });

  const data = await res.json();

  if (data.error) {
    alert(data.error);
    return;
  }

  openModal(data.qr, data.qrPayload, data.activation.expiresAt);

  selectedProducts = [];
  updateBottomBar();
  loadMyDeals();
}

async function toggleFavorite(productId, btn) {
  const telegramId = getTelegramId();
  console.log(
    "toggleFavorite telegramId =",
    telegramId,
    "telegramUser =",
    telegramUser,
  );

  if (!telegramId) {
    alert("No Telegram user");
    return;
  }

  const res = await fetch(`${API_BASE}/api/favorites/toggle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      telegramId,
      productId,
    }),
  });

  const data = await res.json();
  console.log("toggleFavorite response =", data);

  if (data.isFavorite) {
    btn.classList.add("active");
    if (!favoriteIds.includes(productId)) favoriteIds.push(productId);
  } else {
    btn.classList.remove("active");
    favoriteIds = favoriteIds.filter((id) => id !== productId);
  }
}

async function loadFavorites() {
  const container = document.getElementById("favorites");
  const telegramId = getTelegramId();

  if (!telegramId) {
    container.innerHTML = `<div class="empty-box">Open inside Telegram to use favorites.</div>`;
    return;
  }

  renderSkeleton("favorites", 2);

  const res = await fetch(`${API_BASE}/api/favorites/${telegramId}`);
  const products = await res.json();

  container.innerHTML = "";

  if (!products.length) {
    container.innerHTML = `<div class="empty-box">No favorites yet.</div>`;
    return;
  }

  products.forEach((product) => {
    const sizesHtml = (product.sizes || [])
      .map((size) => `<span class="size-chip">${size}</span>`)
      .join("");

    const card = document.createElement("div");
    card.className = "product-card";

    card.innerHTML = `
      <img src="${product.image}" alt="${product.title}">
      <div class="product-content">
        <div class="title">${product.title}</div>
        <div class="description">${product.description || ""}</div>
        <div class="price">
          <span class="new">$${product.price}</span>
          <span class="old">$${product.oldPrice}</span>
        </div>
        <div class="sizes">${sizesHtml}</div>
        <div class="meta">
          <span>${product.category || "Other"}</span>
          <span>Only ${product.remainingQuantity} left</span>
        </div>
        <div class="card-actions">
          <button class="icon-btn active" onclick="toggleFavorite('${product._id}', this); setTimeout(loadFavorites, 150)">♥</button>
          <button class="main-btn" onclick="openProductStore('${product.storeId}')">Open Store</button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

function getDealStatus(deal) {
  if (deal.redeemed) return "used";
  if (Date.now() > deal.expiresAt) return "expired";
  return "pending";
}

function formatRemaining(ms) {
  if (ms <= 0) return "Expired";
  const total = Math.floor(ms / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}m ${sec}s left`;
}

function getDealStatus(deal) {
  if (deal.redeemed) return "used";
  if (Date.now() > Number(deal.expiresAt)) return "expired";
  return "active";
}

function formatDealTimeLeft(expiresAt) {
  const diff = Number(expiresAt) - Date.now();

  if (diff <= 0) return "Expired";

  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}m ${seconds}s left`;
}

function startMyDealTimer(dealId, expiresAt) {
  const el = document.getElementById(`deal-timer-${dealId}`);
  if (!el) return;

  const interval = setInterval(() => {
    const diff = Number(expiresAt) - Date.now();

    if (diff <= 0) {
      el.textContent = "Expired";
      clearInterval(interval);

      const badge = document.getElementById(`deal-badge-${dealId}`);
      if (badge) {
        badge.textContent = "Expired";
        badge.className = "status-badge expired";
      }
      return;
    }

    el.textContent = formatDealTimeLeft(expiresAt);
  }, 1000);
}

async function loadMyDeals() {
  const container = document.getElementById("myDeals");
  const telegramId = getTelegramId();

  if (!telegramId) {
    container.innerHTML = `<div class="empty-box">Open inside Telegram to view your deals.</div>`;
    return;
  }

  renderSkeleton("myDeals", 2);

  try {
    const res = await fetch(`${API_BASE}/api/my-deals/${telegramId}`);
    const deals = await res.json();

    myDealsCache = deals;
    container.innerHTML = "";

    if (!deals.length) {
      container.innerHTML = `<div class="empty-box">No deals yet</div>`;
      return;
    }

    deals.forEach((deal) => {
      const status = getDealStatus(deal);

      const badgeText =
        status === "used"
          ? "Used"
          : status === "expired"
            ? "Expired"
            : "Active";

      const productsHtml = (deal.products || []).length
        ? deal.products
            .map(
              (p) => `
            <div class="deal-product">
              <span>${p.title}</span>
              <span>$${p.price}</span>
            </div>
          `,
            )
            .join("")
        : `<div class="deal-product-empty">No products found</div>`;

      const card = document.createElement("div");
      card.className = "deal-card";

      card.innerHTML = `
        <div class="deal-content">
          <div class="status-badge ${status}" id="deal-badge-${deal._id}">
            ${badgeText}
          </div>

          <div class="deal-title">${deal.store?.name || "Store"}</div>
          <div class="deal-sub">${(deal.products || []).length} items selected</div>

          <div class="deal-meta">
            <span>Activated</span>
            <span>${new Date(deal.activatedAt).toLocaleDateString()}</span>
          </div>

          <div class="deal-products">
            ${productsHtml}
          </div>

          <div class="deal-timer" id="deal-timer-${deal._id}">
            ${status === "active" ? formatDealTimeLeft(deal.expiresAt) : badgeText}
          </div>

          ${
            status === "active"
              ? `<button class="main-btn" style="margin-top:12px;" onclick="showSavedQr('${deal._id}')">Show QR again</button>`
              : ""
          }
        </div>
      `;

      container.appendChild(card);

      if (status === "active") {
        startMyDealTimer(deal._id, deal.expiresAt);
      }
    });
  } catch (err) {
    console.error("loadMyDeals error:", err);
    container.innerHTML = `<div class="empty-box">Failed to load deals</div>`;
  }
}

function updateBottomBar() {
  const bar = document.getElementById("bottomBar");
  const count = document.getElementById("selectedCount");

  if (!bar || !count) return;

  if (!selectedProducts.length) {
    bar.classList.add("hidden");
    return;
  }

  bar.classList.remove("hidden");
  count.textContent = `${selectedProducts.length} item${selectedProducts.length > 1 ? "s" : ""}`;
}

function startDealTimer(dealId, expiresAt) {
  const el = document.getElementById(`timer_${dealId}`);
  if (!el) return;

  const interval = setInterval(() => {
    const diff = expiresAt - Date.now();
    if (diff <= 0) {
      el.innerText = "Expired";
      clearInterval(interval);
      loadMyDeals();
      return;
    }

    el.innerText = formatRemaining(diff);
  }, 1000);
}

async function activateProduct(productId, btn) {
  const telegramId = getTelegramId();
  console.log(
    "activateProduct telegramId =",
    telegramId,
    "telegramUser =",
    telegramUser,
  );

  if (!telegramId) {
    alert("No Telegram user");
    return;
  }

  const content = btn.closest(".product-content");
  const qtyEl = content.querySelector(".qty");

  const res = await fetch(`${API_BASE}/api/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      productId,
      telegramId,
    }),
  });

  const data = await res.json();
  console.log("activateProduct response =", data);

  if (data.error) {
    alert(data.error);
    return;
  }

  openModal(data.qr, data.qrPayload, data.activation.expiresAt);

  if (qtyEl && typeof data.remainingQuantity !== "undefined") {
    qtyEl.textContent = `Only ${data.remainingQuantity} left`;
  }

  btn.disabled = true;
  btn.textContent = "Activated";

  await loadMyDeals();
}

async function showSavedQr(dealId) {
  const deal = myDealsCache.find((d) => d._id === dealId);
  if (!deal) return;

  const qrPayload = JSON.stringify({
    activationId: deal._id,
    storeId: deal.storeId,
    telegramId: deal.telegramId,
  });

  const qrUrl =
    "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" +
    encodeURIComponent(qrPayload);

  openModal(qrUrl, qrPayload, deal.expiresAt);
}

function goHome() {
  document.getElementById("storeView").classList.add("hidden");
  document.getElementById("homeView").classList.remove("hidden");
  document.getElementById("storeDetails").innerHTML = "";
  document.getElementById("products").innerHTML = "";
  document.getElementById("categoryFilters").innerHTML = "";
  document.getElementById("searchInput").value = "";
  document.getElementById("sortSelect").value = "default";
  currentStoreId = null;
  currentCategory = "All";
  currentStoreProducts = [];
}

function openProductStore(storeId) {
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.querySelector(".tab-btn")?.classList.add("active");

  document.getElementById("favoritesTab").classList.add("hidden");
  document.getElementById("myDealsTab").classList.add("hidden");
  document.getElementById("storesTab").classList.remove("hidden");

  openStore(storeId);
}

function reloadCurrentStore() {
  if (currentStoreId) {
    renderProducts(currentStoreProducts);
  }
}

function openModal(qr, qrPayload, expiresAt) {
  document.body.style.overflow = "hidden";
  const modal = document.getElementById("qrModal");
  const content = document.getElementById("qrContent");

  content.innerHTML = `
    <p>Your QR code:</p>
    <img src="${qr}" alt="QR Code">
    <button class="main-btn" style="margin-top:12px;" onclick="copyPayload('${encodeURIComponent(qrPayload)}')">Copy Code</button>
    <p class="timer-text" id="modalTimer"></p>
    <div class="qr-copy">${qrPayload}</div>
  `;

  modal.style.display = "block";
  startModalTimer(expiresAt);
}

function startModalTimer(expiresAt) {
  const el = document.getElementById("modalTimer");
  if (!el) return;

  const interval = setInterval(() => {
    const diff = expiresAt - Date.now();
    if (diff <= 0) {
      el.innerText = "Expired";
      clearInterval(interval);
      return;
    }

    el.innerText = formatRemaining(diff);
  }, 1000);
}

function copyPayload(encodedPayload) {
  const payload = decodeURIComponent(encodedPayload);
  navigator.clipboard.writeText(payload);
  showToast("Copied!");
}

function closeModal() {
  document.body.style.overflow = "auto";
  document.getElementById("qrModal").style.display = "none";
}

window.onclick = function (e) {
  const modal = document.getElementById("qrModal");
  if (e.target === modal) {
    closeModal();
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      if (currentStoreId) renderProducts(currentStoreProducts);
    });
  }
});

async function initApp() {
  try {
    await loginUser();
  } catch (e) {
    console.error("init login failed:", e);
  }

  try {
    await loadFavoriteIds();
  } catch (e) {
    console.error("init favorites failed:", e);
  }

  try {
    await loadStores();
  } catch (e) {
    console.error("init stores failed:", e);
    document.getElementById("stores").innerHTML =
      `<div class="empty-box">Failed to load stores.</div>`;
  }
}

initApp();

/* ===== RIPPLE EFFECT ===== */

document.addEventListener("click", function (e) {
  const target = e.target.closest(".main-btn, .icon-btn");
  if (!target) return;

  const circle = document.createElement("span");
  const rect = target.getBoundingClientRect();

  const size = Math.max(rect.width, rect.height);
  circle.style.width = circle.style.height = size + "px";

  circle.style.left = e.clientX - rect.left - size / 2 + "px";
  circle.style.top = e.clientY - rect.top - size / 2 + "px";

  target.classList.add("ripple");
  circle.classList.add("ripple");

  target.appendChild(circle);

  setTimeout(() => circle.remove(), 600);
});
function showToast(text) {
  const t = document.getElementById("toast");
  t.innerText = text;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}
