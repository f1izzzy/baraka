const tg = window.Telegram.WebApp;
tg.expand();

const telegramUser = tg.initDataUnsafe?.user || null;
const API_BASE = "http://localhost:5000";

async function loginUser() {
  if (!telegramUser) return;

  await fetch(`${API_BASE}/api/users/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      telegramId: telegramUser.id,
      firstName: telegramUser.first_name || "",
      username: telegramUser.username || "",
    }),
  });
}

async function loadStores() {
  const res = await fetch(`${API_BASE}/api/stores`);
  const stores = await res.json();

  const container = document.getElementById("stores");
  container.innerHTML = "";

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
        <button onclick="openStore('${store._id}')">Open Store</button>
      </div>
    `;

    container.appendChild(card);
  });
}

async function openStore(storeId) {
  const res = await fetch(`${API_BASE}/api/stores/${storeId}`);
  const data = await res.json();

  document.getElementById("homeView").classList.add("hidden");
  document.getElementById("storeView").classList.remove("hidden");

  renderStoreDetails(data.store);
  renderProducts(data.products);
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

async function renderProducts(products) {
  const container = document.getElementById("products");
  container.innerHTML = "";

  for (const product of products) {
    const viewedKey = `product_viewed_${product._id}`;

    if (!sessionStorage.getItem(viewedKey)) {
      await fetch(`${API_BASE}/api/products/${product._id}/view`, {
        method: "POST",
      });
      sessionStorage.setItem(viewedKey, "1");
    }

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
          <span class="qty">Only ${product.remainingQuantity} left</span>
          <span>${product.views} viewed</span>
        </div>
        <button onclick="activateProduct('${product._id}', this)">Activate Deal</button>
      </div>
    `;

    container.appendChild(card);
  }
}

async function activateProduct(productId, btn) {
  const content = btn.parentElement;
  const qtyEl = content.querySelector(".qty");

  const res = await fetch(`${API_BASE}/api/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      productId,
      telegramId: telegramUser ? telegramUser.id : null,
    }),
  });

  const data = await res.json();

  if (data.error) {
    alert(data.error);
    return;
  }

  openModal(data.qr, data.qrPayload);

  if (qtyEl && typeof data.remainingQuantity !== "undefined") {
    qtyEl.textContent = `Only ${data.remainingQuantity} left`;
  }

  btn.disabled = true;
  btn.textContent = "Activated";
}

function goHome() {
  document.getElementById("storeView").classList.add("hidden");
  document.getElementById("homeView").classList.remove("hidden");
  document.getElementById("storeDetails").innerHTML = "";
  document.getElementById("products").innerHTML = "";
}

function openModal(qr, qrPayload) {
  const modal = document.getElementById("qrModal");
  const content = document.getElementById("qrContent");

  content.innerHTML = `
    <p>Your QR code:</p>
    <img src="${qr}" alt="QR Code">
    <p style="margin-top:10px;font-size:12px;">Show this at the store</p>
    <div class="qr-copy">${qrPayload}</div>
  `;

  modal.style.display = "block";
}

function closeModal() {
  document.getElementById("qrModal").style.display = "none";
}

window.onclick = function (e) {
  const modal = document.getElementById("qrModal");
  if (e.target === modal) {
    closeModal();
  }
};

async function initApp() {
  await loginUser();
  await loadStores();
}

initApp();
