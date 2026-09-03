// Production E-Commerce Storefront Application

let currentUser = {
  id: 'usr_aarav',
  email: 'aarav.sharma@example.com',
  fullName: 'Aarav Sharma',
  phone: '9876543210',
};

let cart = [
  { id: 'prod_vase_01', title: 'Hand-thrown Terracotta Indigo Vase', price: 2499.00, qty: 1, emoji: '🏺' }
];

let catalogProducts = [];

// Fetch Catalog
async function fetchCatalog() {
  try {
    const res = await fetch('/api/catalog/products');
    if (res.ok) {
      const data = await res.json();
      catalogProducts = data.products || [];
      renderCatalog();
    }
  } catch (err) {
    console.error('Failed to load catalog:', err);
  }
}

function renderCatalog() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  grid.innerHTML = catalogProducts
    .map(
      (p) => `
    <div class="bg-canvasLight rounded-2xl border border-hairlineLight p-6 shadow-stacked-light flex flex-col justify-between space-y-4 hover:border-shade30 transition-all">
      <div class="space-y-3">
        <div class="h-44 rounded-xl bg-gradient-to-br from-stone-100 to-stone-200 flex items-center justify-center text-5xl">
          ${p.emoji}
        </div>
        <div>
          <div class="flex items-center justify-between text-[11px] text-shade50">
            <span>${p.category}</span>
            <span>⭐ ${p.rating}</span>
          </div>
          <h3 class="text-base font-medium text-black mt-1 leading-snug">${p.title}</h3>
          <p class="text-xs text-shade50 mt-1 line-clamp-2">${p.description}</p>
          <div class="text-base font-semibold text-black mt-2">₹${p.price.toFixed(2)}</div>
        </div>
      </div>

      <button onclick="addToCart('${p.id}')" class="w-full py-2.5 rounded-full text-xs font-semibold bg-black text-white hover:bg-shade70 transition-all shadow-sm">
        Add to Shopping Bag
      </button>
    </div>
  `
    )
    .join('');
}

// Shopping Cart Functions
function toggleCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  drawer.classList.toggle('hidden');
  renderCart();
}

function addToCart(prodId) {
  const item = catalogProducts.find((p) => p.id === prodId);
  if (!item) return;

  const existing = cart.find((c) => c.id === prodId);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ id: item.id, title: item.title, price: item.price, qty: 1, emoji: item.emoji });
  }

  updateCartBadge();
  toggleCartDrawer();
}

function removeFromCart(prodId) {
  cart = cart.filter((c) => c.id !== prodId);
  updateCartBadge();
  renderCart();
}

function updateCartBadge() {
  const totalItems = cart.reduce((acc, c) => acc + c.qty, 0);
  const badge = document.getElementById('cart-count-badge');
  if (badge) badge.textContent = totalItems;
}

function renderCart() {
  const list = document.getElementById('cart-items-list');
  const totalEl = document.getElementById('cart-total-price');
  if (!list || !totalEl) return;

  if (cart.length === 0) {
    list.innerHTML = `<div class="text-center py-8 text-xs text-shade50">Your shopping bag is empty.</div>`;
    totalEl.textContent = '₹0.00';
    return;
  }

  let total = 0;
  list.innerHTML = cart
    .map((c) => {
      const lineTotal = c.price * c.qty;
      total += lineTotal;
      return `
      <div class="flex items-center justify-between p-3 rounded-xl bg-canvasCream border border-hairlineLight text-xs">
        <div class="flex items-center space-x-3">
          <div class="text-2xl">${c.emoji}</div>
          <div>
            <div class="font-medium text-black">${c.title}</div>
            <div class="text-shade50">Qty: ${c.qty} × ₹${c.price}</div>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <span class="font-semibold text-black">₹${lineTotal.toFixed(2)}</span>
          <button onclick="removeFromCart('${c.id}')" class="text-shade50 hover:text-red-600 px-1">✕</button>
        </div>
      </div>
    `;
    })
    .join('');

  totalEl.textContent = `₹${total.toFixed(2)}`;
}

async function checkoutCart() {
  if (cart.length === 0) {
    alert('Please add items to your cart first.');
    return;
  }

  const totalAmount = cart.reduce((acc, c) => acc + c.price * c.qty, 0);

  try {
    const res = await fetch('/api/cart/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        items: cart,
        totalAmount,
        shippingAddress: '45 Residency Road, Bengaluru',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      cart = [];
      updateCartBadge();
      toggleCartDrawer();
      alert(`🎉 Order Confirmed!\n\nOrder ID: ${data.orderId}\nTotal: ₹${data.totalAmount}\nEstimated Delivery: ${data.estimatedDelivery}\n\nProcessed under DPDP Notice (${data.dpdpReceipt.statutoryNotice}).`);
    }
  } catch (err) {
    alert('Checkout failed');
  }
}

// Modals
function openSignupModal() {
  document.getElementById('modal-signup').classList.remove('hidden');
}

function closeSignupModal() {
  document.getElementById('modal-signup').classList.add('hidden');
}

function openLoginModal() {
  document.getElementById('modal-login').classList.remove('hidden');
}

function closeLoginModal() {
  document.getElementById('modal-login').classList.add('hidden');
}

// User Authentication
async function submitLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      localStorage.setItem('dpdp_cust_token', data.session.token);
      closeLoginModal();
      onUserLoggedIn();
      alert(`Welcome back, ${currentUser.fullName}!`);
    } else {
      const err = await res.json();
      alert(`Login failed: ${err.error || 'Invalid credentials'}`);
    }
  } catch (e) {
    alert('Sign in failed');
  }
}

async function submitSignup() {
  const fullName = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const phone = document.getElementById('reg-phone').value.trim();
  const streetAddress = document.getElementById('reg-address').value.trim();

  const consents = ['essential'];
  if (document.getElementById('consent-marketing').checked) consents.push('marketing_promo');

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName,
        email,
        password,
        phone,
        streetAddress,
        city: 'Bengaluru',
        consents,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      closeSignupModal();
      onUserLoggedIn();
      alert(`Account created and DPDP Statutory Notice registered for: ${fullName}`);
    }
  } catch (e) {
    alert('Registration failed');
  }
}

function onUserLoggedIn() {
  document.getElementById('nav-guest').classList.add('hidden');
  document.getElementById('nav-user').classList.remove('hidden');
  document.getElementById('nav-user-name').textContent = currentUser.fullName.split(' ')[0];
  document.getElementById('bench-user-email').textContent = currentUser.email;
}

function logoutCustomer() {
  localStorage.removeItem('dpdp_cust_token');
  location.reload();
}

// Trigger Gated Marketing SMS (Hot-path check via Zone Agent)
async function triggerMarketingSms() {
  const resultBox = document.getElementById('bench-result-box');
  resultBox.innerHTML = `
    <div class="flex items-center space-x-2 text-shade50">
      <div class="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
      <span>Querying Zone Agent hot-path endpoint (/consent/check)...</span>
    </div>
  `;

  try {
    const res = await fetch('/api/marketing/send-promo-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id }),
    });

    const data = await res.json();

    if (res.ok) {
      // Allowed (200 OK)
      resultBox.className = 'p-5 rounded-xl border border-emerald-300 bg-emerald-50 space-y-2 text-xs font-mono min-h-[130px] flex flex-col justify-center';
      resultBox.innerHTML = `
        <div class="flex items-center space-x-2 text-emerald-800 font-bold">
          <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
          <span>200 OK — Promotional SMS Dispatched</span>
        </div>
        <div class="text-emerald-700 text-[11px]">${data.message}</div>
        <div class="text-emerald-600 text-[10px] pt-1 border-t border-emerald-200 flex justify-between">
          <span>Agent Latency: <strong>${data.agentLatencyMs}ms</strong></span>
          <span>Notice: ${data.noticeVersion}</span>
        </div>
      `;
    } else {
      // Blocked (403 Forbidden)
      resultBox.className = 'p-5 rounded-xl border border-red-300 bg-red-50 space-y-2 text-xs font-mono min-h-[130px] flex flex-col justify-center';
      resultBox.innerHTML = `
        <div class="flex items-center space-x-2 text-red-900 font-bold">
          <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
          <span>403 Forbidden — BLOCKED BY ZONE AGENT</span>
        </div>
        <div class="text-red-700 text-[11px]">${data.message}</div>
        <div class="text-red-600 text-[10px] pt-1 border-t border-red-200 flex justify-between">
          <span>Reason: <code>${data.reason}</code></span>
          <span>Agent Latency: <strong>${data.agentLatencyMs}ms</strong></span>
        </div>
      `;
    }
  } catch (err) {
    resultBox.className = 'p-5 rounded-xl border border-red-300 bg-red-50 text-red-900 text-xs font-mono';
    resultBox.innerHTML = `<div>Error connecting to E-commerce API or Zone Agent.</div>`;
  }
}

// Initial Bootstrap
fetchCatalog();
updateCartBadge();
onUserLoggedIn();
