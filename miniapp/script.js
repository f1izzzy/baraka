const tg = window.Telegram.WebApp;
tg.expand();

const telegramUser = tg.initDataUnsafe?.user || null;
const API_BASE = "https://baraka-backend-71az.onrender.com";

async function loadDeals() {
  const res = await fetch(`${API_BASE}/api/deals`);
  const deals = await res.json();

  const container = document.getElementById("deals");
  container.innerHTML = "";

  for (const deal of deals) {
    const viewedKey = `viewed_${deal._id}`;

    if (!sessionStorage.getItem(viewedKey)) {
      await fetch(`${API_BASE}/api/deals/${deal._id}/view`, {
        method: "POST",
      });
      sessionStorage.setItem(viewedKey, "1");
    }

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <img src="${deal.image}" alt="${deal.title}">
      <div class="content">
        <div class="title">${deal.title}</div>
        <div class="store">${deal.store}</div>
        <div class="price">
          <span class="new">$${deal.price}</span>
          <span class="old">$${deal.oldPrice}</span>
        </div>
        <div class="meta">
          <span class="qty">Only ${deal.remainingQuantity} left</span>
          <span>${deal.views} viewed</span>
        </div>
        <button onclick="activateDeal('${deal._id}', this)">Activate Deal</button>
        <div class="qr-box"></div>
      </div>
    `;

    container.appendChild(card);
  }
}

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

async function activateDeal(dealId, btn) {
  const content = btn.parentElement;
  const qrBox = content.querySelector(".qr-box");
  const qtyEl = content.querySelector(".qty");

  const res = await fetch(`${API_BASE}/api/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dealId,
      telegramId: telegramUser ? telegramUser.id : null,
    }),
  });

  const data = await res.json();

  if (data.error) {
    alert(data.error);
    return;
  }

  openModal(data.qr);

  if (qtyEl && typeof data.remainingQuantity !== "undefined") {
    qtyEl.textContent = `Only ${data.remainingQuantity} left`;
  }

  btn.disabled = true;
  btn.textContent = "Activated";
}

async function initApp() {
  await loginUser();
  await loadDeals();
}

window.onclick = function (e) {
  const modal = document.getElementById("qrModal");
  if (e.target === modal) {
    modal.style.display = "none";
  }
};

function openModal(qr) {
  const modal = document.getElementById("qrModal");
  const content = document.getElementById("qrContent");

  content.innerHTML = `
    <p>Your QR code:</p>
    <img src="${qr}" alt="QR Code">
    <p style="margin-top:10px;font-size:12px;">Show this at the store</p>
  `;

  modal.style.display = "block";
}

function closeModal() {
  document.getElementById("qrModal").style.display = "none";
}

initApp();
