// Production E-Commerce Storefront Application

let currentUser = null;
let cart = [];
let catalogProducts = [];

// 1. Fetch Catalog from Database
async function fetchCatalog() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/catalog/products');
    if (res.ok) {
      const data = await res.json();
      catalogProducts = data.products || [];
      renderCatalog();
    }
  } catch (err) {
    grid.innerHTML = `<div class="col-span-full py-12 text-center text-xs text-red-500">Failed to load products from database.</div>`;
  }
}

function renderCatalog() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  if (catalogProducts.length === 0) {
    grid.innerHTML = `<div class="col-span-full py-12 text-center text-xs text-shade50">No products currently in stock.</div>`;
    return;
  }

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
            <span class="${p.stock > 0 ? 'text-emerald-700 font-medium' : 'text-red-600'}">${p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}</span>
          </div>
          <h3 class="text-base font-medium text-black mt-1 leading-snug">${p.title}</h3>
          <p class="text-xs text-shade50 mt-1 line-clamp-2">${p.description}</p>
          <div class="text-base font-semibold text-black mt-2">₹${Number(p.price).toFixed(2)}</div>
        </div>
      </div>

      <button onclick="addToCart('${p.id}')" ${p.stock <= 0 ? 'disabled' : ''} class="w-full py-2.5 rounded-full text-xs font-semibold ${
        p.stock > 0 ? 'bg-black text-white hover:bg-shade70' : 'bg-shade30 text-shade50 cursor-not-allowed'
      } transition-all shadow-sm">
        ${p.stock > 0 ? 'Add to Shopping Bag' : 'Out of Stock'}
      </button>
    </div>
  `
    )
    .join('');
}

// 2. Shopping Cart
function toggleCartDrawer() {
  const drawer = document.getElementById('cart-drawer');
  drawer.classList.toggle('hidden');
  renderCart();
}

function addToCart(prodId) {
  const item = catalogProducts.find((p) => p.id === prodId);
  if (!item || item.stock <= 0) return;

  const existing = cart.find((c) => c.id === prodId);
  if (existing) {
    if (existing.qty < item.stock) existing.qty++;
  } else {
    cart.push({ id: item.id, title: item.title, price: Number(item.price), qty: 1, emoji: item.emoji });
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
            <div class="text-shade50">Qty: ${c.qty} × ₹${c.price.toFixed(2)}</div>
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
  if (!currentUser) {
    alert('Please sign in or create an account to complete checkout.');
    openLoginModal();
    return;
  }

  if (cart.length === 0) {
    alert('Your shopping bag is empty.');
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
        shippingAddress: currentUser.streetAddress || 'Customer Address',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      cart = [];
      updateCartBadge();
      toggleCartDrawer();
      fetchCatalog(); // update stock numbers
      alert(`🎉 Order Confirmed!\n\nOrder ID: ${data.orderId}\nTotal: ₹${data.totalAmount}\nDelivery: ${data.estimatedDelivery}\n\nProcessed under DPDP Notice (${data.dpdpReceipt.statutoryNotice}).`);
    } else {
      alert('Failed to place order.');
    }
  } catch (err) {
    alert('Checkout failed');
  }
}

// 3. User Authentication (Signup / Login)
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

async function submitSignup() {
  const fullName = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const phone = document.getElementById('reg-phone').value.trim();
  const streetAddress = document.getElementById('reg-address').value.trim();

  if (!fullName || !email || !password || !phone) {
    alert('Please complete all required fields.');
    return;
  }

  const consents = ['essential'];
  if (document.getElementById('consent-marketing').checked) consents.push('marketing_promo');
  if (document.getElementById('consent-analytics').checked) consents.push('storefront_analytics');

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

    const data = await res.json();
    if (res.ok) {
      currentUser = data.user;
      localStorage.setItem('dpdp_cust_token', data.session.token);
      localStorage.setItem('dpdp_cust_user', JSON.stringify(data.user));
      closeSignupModal();
      onUserLoggedIn();
      alert(`Welcome, ${fullName}! Your account has been registered with DPDP Notice.`);
    } else {
      alert(`Signup failed: ${data.error || 'Please check inputs'}`);
    }
  } catch (e) {
    alert('Registration request failed');
  }
}

async function submitLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    alert('Please enter your email and password.');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (res.ok) {
      currentUser = data.user;
      localStorage.setItem('dpdp_cust_token', data.session.token);
      localStorage.setItem('dpdp_cust_user', JSON.stringify(data.user));
      closeLoginModal();
      onUserLoggedIn();
    } else {
      alert(`Login failed: ${data.error || 'Invalid credentials'}`);
    }
  } catch (e) {
    alert('Sign in request failed');
  }
}

function onUserLoggedIn() {
  if (!currentUser) return;
  document.getElementById('nav-guest').classList.add('hidden');
  document.getElementById('nav-user').classList.remove('hidden');
  document.getElementById('nav-user-name').textContent = currentUser.fullName.split(' ')[0];
}

function logoutCustomer() {
  localStorage.removeItem('dpdp_cust_token');
  localStorage.removeItem('dpdp_cust_user');
  currentUser = null;
  location.reload();
}

// Check existing session on boot
function checkExistingSession() {
  const savedUser = localStorage.getItem('dpdp_cust_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      onUserLoggedIn();
    } catch {}
  }
}

// Initial Boot
checkExistingSession();
fetchCatalog();
updateCartBadge();
