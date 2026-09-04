// Enterprise Operations & Inventory Dashboard

let activeTab = 'inventory';

function switchTab(tab) {
  activeTab = tab;
  const tabs = ['inventory', 'orders', 'customers', 'employees'];

  tabs.forEach((t) => {
    const sec = document.getElementById(`sec-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (t === tab) {
      sec.classList.remove('hidden');
      btn.className = 'w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-lg bg-slate-800 text-white font-medium transition-all';
    } else {
      sec.classList.add('hidden');
      btn.className = 'w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 font-medium transition-all';
    }
  });

  const titleEl = document.getElementById('view-title');
  const subtitleEl = document.getElementById('view-subtitle');
  const actionContainer = document.getElementById('top-action-container');

  if (tab === 'inventory') {
    titleEl.textContent = 'Inventory & Catalog Management';
    subtitleEl.textContent = 'Manage live artisan inventory, pricing, and stock allocations.';
    actionContainer.innerHTML = `
      <button onclick="openAddProductModal()" class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 shadow-sm flex items-center space-x-1.5 transition-all">
        <span>+ Add New Product</span>
      </button>
    `;
    fetchInventory();
  } else if (tab === 'orders') {
    titleEl.textContent = 'Customer Orders Fulfillment';
    subtitleEl.textContent = 'Live transactional orders placed by registered customers.';
    actionContainer.innerHTML = `
      <button onclick="fetchOrders()" class="px-3.5 py-1.5 rounded-lg bg-white border border-cardBorder text-slate-700 text-xs font-medium hover:bg-slate-50">
        Refresh Orders
      </button>
    `;
    fetchOrders();
  } else if (tab === 'customers') {
    titleEl.textContent = 'Registered Customer Accounts';
    subtitleEl.textContent = 'Customer records and their statutory DPDP Act consent preferences.';
    actionContainer.innerHTML = `
      <button onclick="fetchCustomers()" class="px-3.5 py-1.5 rounded-lg bg-white border border-cardBorder text-slate-700 text-xs font-medium hover:bg-slate-50">
        Refresh Customers
      </button>
    `;
    fetchCustomers();
  } else if (tab === 'employees') {
    titleEl.textContent = 'Enterprise Staff & HR Directory';
    subtitleEl.textContent = 'Internal employee records, department structures, and payroll.';
    actionContainer.innerHTML = '';
    fetchEmployees();
  }
}

// 1. Fetch Inventory with silent auto-refresh support
async function fetchInventory(silent = false) {
  const tbody = document.getElementById('inventory-tbody');
  if (!silent && (!tbody.innerHTML || tbody.innerHTML.trim() === '')) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Loading products...</td></tr>`;
  }

  try {
    const res = await fetch('/api/admin/inventory');
    const data = await res.json();
    const products = data.products || [];

    if (products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">No products found.</td></tr>`;
      return;
    }

    tbody.innerHTML = products
      .map(
        (p) => `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="p-4 flex items-center space-x-3">
          <span class="text-xl">${p.emoji}</span>
          <div>
            <div class="font-semibold text-slate-900">${p.title}</div>
            <div class="text-[10px] text-slate-400 font-mono">${p.id}</div>
          </div>
        </td>
        <td class="p-4 text-slate-600">${p.category}</td>
        <td class="p-4 font-semibold text-slate-900">₹${Number(p.price).toFixed(2)}</td>
        <td class="p-4">
          <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold ${
            p.stock > 5 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : p.stock > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'
          }">
            ${p.stock} units ${p.stock <= 0 ? '(Sold Out)' : ''}
          </span>
        </td>
        <td class="p-4 text-right">
          <button onclick="updateStockPrompt('${p.id}', ${p.stock})" class="text-indigo-600 hover:text-indigo-800 font-medium">Edit Stock</button>
        </td>
      </tr>
    `
      )
      .join('');
  } catch (err) {
    if (!silent) tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">Failed to load inventory.</td></tr>`;
  }
}

// 2. Fetch Orders with silent auto-refresh support
async function fetchOrders(silent = false) {
  const tbody = document.getElementById('orders-tbody');
  if (!silent && (!tbody.innerHTML || tbody.innerHTML.trim() === '')) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">Loading orders...</td></tr>`;
  }

  try {
    const res = await fetch('/api/admin/orders');
    const data = await res.json();
    const orders = data.orders || [];

    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">No orders placed yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = orders
      .map(
        (o) => `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="p-4 font-mono font-medium text-slate-900">${o.id}</td>
        <td class="p-4">
          <div class="font-medium text-slate-900">${o.customer_name}</div>
          <div class="text-[10px] text-slate-400">${o.customer_email}</div>
        </td>
        <td class="p-4">
          <div class="text-[11px] text-slate-700 font-medium">${o.items.map((i) => `${i.qty}× ${i.title}`).join(', ')}</div>
          <div class="text-[10px] text-slate-400">Deliver to: ${o.shipping_address || 'Customer Address'}</div>
        </td>
        <td class="p-4 font-semibold text-slate-900">₹${Number(o.total_amount).toFixed(2)}</td>
        <td class="p-4">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            ${o.status}
          </span>
        </td>
        <td class="p-4 text-slate-500 text-[11px]">${new Date(o.created_at).toLocaleDateString()}</td>
      </tr>
    `
      )
      .join('');
  } catch (err) {
    if (!silent) tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Failed to load orders.</td></tr>`;
  }
}

// 3. Fetch Customers with silent auto-refresh support
async function fetchCustomers(silent = false) {
  const tbody = document.getElementById('customers-tbody');
  if (!silent && (!tbody.innerHTML || tbody.innerHTML.trim() === '')) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">Loading customers...</td></tr>`;
  }

  try {
    const res = await fetch('/api/admin/customers');
    const data = await res.json();
    const customers = data.customers || [];

    if (customers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">No customers registered yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = customers
      .map(
        (c) => `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="p-4 font-semibold text-slate-900">${c.full_name}</td>
        <td class="p-4 text-slate-600">${c.email}</td>
        <td class="p-4 font-mono text-slate-600">${c.phone}</td>
        <td class="p-4 text-slate-600">${c.city || 'N/A'}</td>
        <td class="p-4">
          <div class="flex flex-wrap gap-1">
            ${c.consentPurposes.map((p) => `<span class="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-700">${p}</span>`).join('')}
          </div>
        </td>
        <td class="p-4 text-slate-500 text-[11px]">${new Date(c.created_at).toLocaleDateString()}</td>
      </tr>
    `
      )
      .join('');
  } catch (err) {
    if (!silent) tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Failed to load customers.</td></tr>`;
  }
}

// 4. Fetch Employees
async function fetchEmployees() {
  const tbody = document.getElementById('employees-tbody');
  tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">Loading employees...</td></tr>`;

  try {
    const res = await fetch('/api/admin/employees');
    const data = await res.json();
    const employees = data.employees || [];

    tbody.innerHTML = employees
      .map(
        (e) => `
      <tr class="hover:bg-slate-50/80 transition-colors">
        <td class="p-4 font-mono text-slate-500">${e.id}</td>
        <td class="p-4">
          <div class="font-semibold text-slate-900">${e.full_name}</div>
          <div class="text-[10px] text-slate-400">${e.email}</div>
        </td>
        <td class="p-4 text-slate-600">${e.department}</td>
        <td class="p-4 font-medium text-slate-800">${e.role}</td>
        <td class="p-4 font-semibold text-slate-900">₹${Number(e.salary).toLocaleString()}</td>
        <td class="p-4 font-mono text-slate-500">${e.pan_no}</td>
      </tr>
    `
      )
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Failed to load employees.</td></tr>`;
  }
}

// Modals
function openAddProductModal() {
  document.getElementById('modal-add-product').classList.remove('hidden');
}

function closeAddProductModal() {
  document.getElementById('modal-add-product').classList.add('hidden');
}

async function submitNewProduct() {
  const title = document.getElementById('new-title').value.trim();
  const category = document.getElementById('new-category').value.trim();
  const emoji = document.getElementById('new-emoji').value.trim() || '📦';
  const price = document.getElementById('new-price').value;
  const stock = document.getElementById('new-stock').value;
  const description = document.getElementById('new-desc').value.trim();

  if (!title || !price) {
    alert('Please enter title and price.');
    return;
  }

  try {
    const res = await fetch('/api/admin/inventory/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, category, emoji, price, stock, description }),
    });

    if (res.ok) {
      closeAddProductModal();
      fetchInventory();
      alert('Product added to inventory!');
    }
  } catch (e) {
    alert('Failed to add product');
  }
}

async function updateStockPrompt(productId, currentStock) {
  const newStock = prompt(`Enter new stock units for product (${productId}):`, currentStock);
  if (newStock === null || isNaN(parseInt(newStock, 10))) return;

  try {
    const res = await fetch('/api/admin/inventory/update-stock', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, stock: parseInt(newStock, 10) }),
    });
    if (res.ok) fetchInventory(true);
  } catch (e) {
    alert('Failed to update stock');
  }
}

// Continuous Background Auto-Refresh (every 2.5 seconds)
setInterval(() => {
  if (activeTab === 'inventory') {
    fetchInventory(true);
  } else if (activeTab === 'orders') {
    fetchOrders(true);
  } else if (activeTab === 'customers') {
    fetchCustomers(true);
  }
}, 2500);

// Initial load
fetchInventory();
