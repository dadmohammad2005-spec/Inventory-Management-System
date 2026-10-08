/**
 * Inventory & Order Management System - Main Frontend Application
 */

// Application State
const state = {
  activeView: 'dashboard',
  categories: [],
  products: [],
  orders: [],
  analytics: null,
  cart: [], // POS cart items: [{ product: {...}, quantity: 1 }]
  posFilter: {
    category: '',
    search: ''
  },
  productsFilter: {
    search: '',
    category: '',
    stock_status: '',
    low_stock: false
  },
  ordersFilter: {
    search: '',
    status: ''
  },
  editingProductId: null,
  viewingOrderId: null,
  systemOnline: false
};

// Utilities
const formatCurrency = (amount) => {
  const num = parseFloat(amount || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(num);
};

const formatDate = (isoString) => {
  if (!isoString) return '-';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const showToast = (message, type = 'success') => {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const bgClass = type === 'success' ? 'bg-success text-white' :
                  type === 'danger' ? 'bg-danger text-white' :
                  type === 'warning' ? 'bg-warning text-dark' : 'bg-primary text-white';

  const iconClass = type === 'success' ? 'bi-check-circle-fill' :
                    type === 'danger' ? 'bi-exclamation-triangle-fill' :
                    type === 'warning' ? 'bi-exclamation-circle-fill' : 'bi-info-circle-fill';

  const toastEl = document.createElement('div');
  toastEl.className = `app-toast toast align-items-center ${bgClass} border-0 show`;
  toastEl.role = 'alert';
  toastEl.ariaLive = 'assertive';
  toastEl.ariaAtomic = 'true';
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body d-flex align-items-center gap-2">
        <i class="bi ${iconClass} fs-5"></i>
        <div>${message}</div>
      </div>
      <button type="button" class="btn-close ${type !== 'warning' ? 'btn-close-white' : ''} me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;

  container.appendChild(toastEl);
  setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.remove(), 300);
  }, 4500);
};

const showSpinner = () => {
  const spinner = document.getElementById('global-spinner');
  if (spinner) spinner.classList.remove('d-none');
};

const hideSpinner = () => {
  const spinner = document.getElementById('global-spinner');
  if (spinner) spinner.classList.add('d-none');
};

// -----------------------------------------------------------------------------
// View Navigation
// -----------------------------------------------------------------------------
function switchView(viewName) {
  state.activeView = viewName;

  // Update navigation links
  document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
    if (link.dataset.view === viewName) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Toggle view containers
  document.querySelectorAll('.view-section').forEach(section => {
    if (section.id === `view-${viewName}`) {
      section.classList.remove('d-none');
    } else {
      section.classList.add('d-none');
    }
  });

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('show')) {
    sidebar.classList.remove('show');
  }

  // Load view-specific data
  if (viewName === 'dashboard') {
    loadDashboard();
  } else if (viewName === 'products') {
    loadProducts();
  } else if (viewName === 'orders') {
    loadOrders();
  } else if (viewName === 'pos') {
    loadPosCatalog();
  }
}

// -----------------------------------------------------------------------------
// Dashboard Operations
// -----------------------------------------------------------------------------
async function loadDashboard() {
  try {
    const data = await window.api.getAnalytics();
    state.analytics = data;

    // Update KPI cards
    document.getElementById('metric-total-revenue').textContent = formatCurrency(data.total_revenue);
    document.getElementById('metric-total-orders').textContent = data.total_orders;
    document.getElementById('metric-total-products').textContent = data.total_products;
    document.getElementById('metric-low-stock').textContent = data.low_stock_count;

    // Low stock warning banner
    const alertBanner = document.getElementById('low-stock-alert-banner');
    if (data.low_stock_count > 0) {
      alertBanner.classList.remove('d-none');
      document.getElementById('low-stock-alert-text').textContent = 
        `Warning: ${data.low_stock_count} item(s) are low in stock (< 5 units). Please replenish inventory.`;
    } else {
      alertBanner.classList.add('d-none');
    }

    // Render Recent Orders table
    renderRecentOrders(data.recent_orders || []);

    // Render Low Stock Items table
    renderLowStockTable(data.low_stock_products || []);

    // Render Top-Selling Products table
    renderTopSellingTable(data.top_selling_products || []);

    // Render Orders Fulfillment Breakdown
    renderOrdersBreakdown(data.orders_breakdown || {}, data.total_orders || 0);

    updateApiStatus(true);
  } catch (err) {
    console.error('Error loading analytics:', err);
    updateApiStatus(false, err.message);
  }
}

function renderRecentOrders(recentOrders) {
  const tbody = document.getElementById('dashboard-recent-orders-body');
  if (!tbody) return;

  if (recentOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No orders placed yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = recentOrders.map(order => {
    const statusBadge = order.status === 'Completed' ? 'badge-status-completed' :
                        order.status === 'Pending' ? 'badge-status-pending' : 'badge-status-cancelled';
    return `
      <tr>
        <td class="fw-semibold">#${order.order_id}</td>
        <td>${escapeHtml(order.customer_name)}</td>
        <td>${formatCurrency(order.total_amount)}</td>
        <td><span class="${statusBadge}">${order.status}</span></td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="openOrderDetails('${order.id}')">
            <i class="bi bi-eye"></i> Details
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderLowStockTable(lowStockProducts) {
  const tbody = document.getElementById('dashboard-low-stock-body');
  if (!tbody) return;

  if (lowStockProducts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-success py-4"><i class="bi bi-check-circle me-1"></i> All products have healthy stock levels.</td></tr>`;
    return;
  }

  tbody.innerHTML = lowStockProducts.map(p => `
    <tr>
      <td>
        <span class="fw-semibold">${escapeHtml(p.name)}</span>
        <div class="text-muted text-xs">${escapeHtml(p.sku)}</div>
      </td>
      <td><span class="badge bg-light text-dark border">${escapeHtml(p.category_name || '-')}</span></td>
      <td>${formatCurrency(p.selling_price)}</td>
      <td>
        <span class="badge ${p.stock_quantity === 0 ? 'bg-danger' : 'bg-warning text-dark'}">
          ${p.stock_quantity === 0 ? 'Out of Stock (0)' : p.stock_quantity + ' units left'}
        </span>
      </td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="openRestockModal(${p.id}, '${escapeHtml(p.name)}', '${p.sku}', ${p.stock_quantity})">
          <i class="bi bi-box-arrow-in-down me-1"></i> Restock
        </button>
      </td>
    </tr>
  `).join('');
}

function renderTopSellingTable(topSelling) {
  const tbody = document.getElementById('dashboard-top-selling-body');
  if (!tbody) return;

  if (!topSelling || topSelling.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No completed sales yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = topSelling.map((item, idx) => `
    <tr>
      <td><span class="badge ${idx === 0 ? 'bg-warning text-dark' : 'bg-light text-secondary border'} rounded-circle" style="width: 24px; height: 24px; line-height: 18px;">${idx + 1}</span></td>
      <td class="fw-semibold text-dark">${escapeHtml(item.product__name)}</td>
      <td><span class="badge bg-secondary-subtle text-secondary font-monospace">${escapeHtml(item.product__sku)}</span></td>
      <td class="text-center fw-bold">${item.total_sold}</td>
      <td class="text-end fw-bold text-success">${formatCurrency(item.total_revenue)}</td>
    </tr>
  `).join('');
}

function renderOrdersBreakdown(breakdown, totalOrders) {
  const comp = breakdown.completed || 0;
  const pend = breakdown.pending || 0;
  const canc = breakdown.cancelled || 0;

  const compEl = document.getElementById('status-completed-count');
  const pendEl = document.getElementById('status-pending-count');
  const cancEl = document.getElementById('status-cancelled-count');

  if (compEl) compEl.textContent = comp;
  if (pendEl) pendEl.textContent = pend;
  if (cancEl) cancEl.textContent = canc;

  const progComp = document.getElementById('prog-completed');
  const progPend = document.getElementById('prog-pending');
  const progCanc = document.getElementById('prog-cancelled');

  if (totalOrders > 0) {
    const compPct = Math.round((comp / totalOrders) * 100);
    const pendPct = Math.round((pend / totalOrders) * 100);
    const cancPct = Math.round((canc / totalOrders) * 100);

    if (progComp) { progComp.style.width = `${compPct}%`; progComp.title = `Completed: ${comp} (${compPct}%)`; }
    if (progPend) { progPend.style.width = `${pendPct}%`; progPend.title = `Pending: ${pend} (${pendPct}%)`; }
    if (progCanc) { progCanc.style.width = `${cancPct}%`; progCanc.title = `Cancelled: ${canc} (${cancPct}%)`; }
  } else {
    if (progComp) progComp.style.width = '0%';
    if (progPend) progPend.style.width = '0%';
    if (progCanc) progCanc.style.width = '0%';
  }
}

// -----------------------------------------------------------------------------
// Products Operations
// -----------------------------------------------------------------------------
async function loadCategories() {
  try {
    const cats = await window.api.getCategories();
    state.categories = cats;

    // Populate Category select in modal
    const catSelect = document.getElementById('product-category-input');
    if (catSelect) {
      catSelect.innerHTML = `<option value="">Select Category</option>` +
        cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    // Populate Filter dropdown in Products page
    const filterCat = document.getElementById('products-category-filter');
    if (filterCat) {
      filterCat.innerHTML = `<option value="">All Categories</option>` +
        cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    // Populate POS category pills
    const posCatContainer = document.getElementById('pos-category-pills');
    if (posCatContainer) {
      posCatContainer.innerHTML = `
        <button class="category-pill ${state.posFilter.category === '' ? 'active' : ''}" onclick="filterPosByCategory('')">
          All
        </button>
      ` + cats.map(c => `
        <button class="category-pill ${state.posFilter.category === String(c.id) ? 'active' : ''}" onclick="filterPosByCategory('${c.id}')">
          ${c.name}
        </button>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

async function loadProducts() {
  showSpinner();
  try {
    const params = { ...state.productsFilter };
    const products = await window.api.getProducts(params);
    state.products = products;
    renderProductsTable(products);
    updateApiStatus(true);
  } catch (err) {
    showToast(err.message, 'danger');
    updateApiStatus(false, err.message);
  } finally {
    hideSpinner();
  }
}

function renderProductsTable(products) {
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;

  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-5">No products found matching the criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = products.map(p => {
    const stockClass = p.stock_quantity === 0 ? 'bg-danger text-white' :
                       p.stock_quantity < 5 ? 'bg-warning text-dark' : 'bg-success-subtle text-success border border-success-subtle';
    const stockLabel = p.stock_quantity === 0 ? 'Out of Stock (0)' :
                       p.stock_quantity < 5 ? `Low Stock (${p.stock_quantity})` : `${p.stock_quantity} in stock`;

    return `
      <tr>
        <td>
          <span class="badge bg-secondary-subtle text-secondary font-monospace">${p.sku}</span>
        </td>
        <td>
          <div class="fw-semibold text-dark">${p.name}</div>
        </td>
        <td>
          <span class="badge bg-light text-secondary border">${p.category_name || '-'}</span>
        </td>
        <td class="text-muted">${formatCurrency(p.cost_price)}</td>
        <td class="fw-bold text-dark">${formatCurrency(p.selling_price)}</td>
        <td>
          <span class="badge ${stockClass}">${stockLabel}</span>
        </td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" title="Quick Restock" onclick="openRestockModal(${p.id}, '${escapeHtml(p.name)}', '${p.sku}', ${p.stock_quantity})">
              <i class="bi bi-plus-circle"></i>
            </button>
            <button class="btn btn-outline-primary" title="Edit Product" onclick="openEditProductModal(${p.id})">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-outline-danger" title="Delete Product" onclick="confirmDeleteProduct(${p.id}, '${escapeHtml(p.name)}')">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openAddProductModal() {
  state.editingProductId = null;
  document.getElementById('productModalLabel').textContent = 'Add New Product';
  document.getElementById('product-form').reset();
  document.getElementById('product-id-input').value = '';

  const modalEl = document.getElementById('productModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

async function openEditProductModal(id) {
  state.editingProductId = id;
  showSpinner();
  try {
    const product = await window.api.getProduct(id);
    document.getElementById('productModalLabel').textContent = 'Edit Product';
    document.getElementById('product-id-input').value = product.id;
    document.getElementById('product-name-input').value = product.name;
    document.getElementById('product-sku-input').value = product.sku;
    document.getElementById('product-category-input').value = product.category;
    document.getElementById('product-cost-input').value = product.cost_price;
    document.getElementById('product-selling-input').value = product.selling_price;
    document.getElementById('product-stock-input').value = product.stock_quantity;

    const modalEl = document.getElementById('productModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  } catch (err) {
    showToast('Failed to load product details: ' + err.message, 'danger');
  } finally {
    hideSpinner();
  }
}

async function saveProductForm(e) {
  e.preventDefault();
  const form = document.getElementById('product-form');
  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }

  const id = document.getElementById('product-id-input').value;
  const payload = {
    name: document.getElementById('product-name-input').value.trim(),
    sku: document.getElementById('product-sku-input').value.trim().toUpperCase(),
    category: parseInt(document.getElementById('product-category-input').value),
    cost_price: parseFloat(document.getElementById('product-cost-input').value),
    selling_price: parseFloat(document.getElementById('product-selling-input').value),
    stock_quantity: parseInt(document.getElementById('product-stock-input').value)
  };

  showSpinner();
  try {
    if (id) {
      await window.api.updateProduct(id, payload);
      showToast('Product updated successfully!');
    } else {
      await window.api.createProduct(payload);
      showToast('Product created successfully!');
    }

    const modalEl = document.getElementById('productModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    // Reload products & refresh dashboard stats
    await loadProducts();
    await loadCategories();
  } catch (err) {
    showToast(err.message, 'danger');
  } finally {
    hideSpinner();
  }
}

function openRestockModal(productId, productName, sku, currentStock) {
  document.getElementById('restock-product-id').value = productId;
  document.getElementById('restock-product-name').textContent = productName;
  document.getElementById('restock-product-sku').textContent = sku;
  document.getElementById('restock-current-stock').textContent = `${currentStock} units`;
  document.getElementById('restock-quantity-input').value = '10';

  const modalEl = document.getElementById('restockModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function setRestockQty(amount) {
  const input = document.getElementById('restock-quantity-input');
  if (input) input.value = amount;
}

async function handleRestockSubmit(e) {
  e.preventDefault();
  const productId = document.getElementById('restock-product-id').value;
  const qty = parseInt(document.getElementById('restock-quantity-input').value);

  if (isNaN(qty) || qty <= 0) {
    showToast('Please enter a valid positive quantity.', 'warning');
    return;
  }

  showSpinner();
  try {
    const res = await window.api.restockProduct(productId, qty);
    showToast(res.message || `Successfully added ${qty} units to inventory!`);

    const modalEl = document.getElementById('restockModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    if (state.activeView === 'products') {
      loadProducts();
    } else {
      loadDashboard();
    }
  } catch (err) {
    showToast(err.message, 'danger');
  } finally {
    hideSpinner();
  }
}

async function confirmDeleteProduct(id, name) {
  if (!confirm(`Are you sure you want to delete product "${name}"? This action cannot be undone.`)) {
    return;
  }

  showSpinner();
  try {
    await window.api.deleteProduct(id);
    showToast(`Product "${name}" deleted.`);
    loadProducts();
  } catch (err) {
    showToast(err.message, 'danger');
  } finally {
    hideSpinner();
  }
}

// -----------------------------------------------------------------------------
// Orders Operations
// -----------------------------------------------------------------------------
async function loadOrders() {
  showSpinner();
  try {
    const orders = await window.api.getOrders(state.ordersFilter);
    state.orders = orders;
    renderOrdersTable(orders);
    updateApiStatus(true);
  } catch (err) {
    showToast(err.message, 'danger');
    updateApiStatus(false, err.message);
  } finally {
    hideSpinner();
  }
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;

  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-5">No orders found.</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const statusBadge = o.status === 'Completed' ? 'badge-status-completed' :
                        o.status === 'Pending' ? 'badge-status-pending' : 'badge-status-cancelled';

    return `
      <tr>
        <td class="fw-semibold font-monospace">#${o.order_id}</td>
        <td>
          <div class="fw-medium">${escapeHtml(o.customer_name)}</div>
        </td>
        <td class="text-muted">${formatDate(o.created_at)}</td>
        <td><span class="badge bg-light text-dark border">${o.items_count} items</span></td>
        <td class="fw-bold text-dark">${formatCurrency(o.total_amount)}</td>
        <td><span class="${statusBadge}">${o.status}</span></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary" onclick="openOrderDetails('${o.id}')">
            <i class="bi bi-eye me-1"></i> View
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function openOrderDetails(orderId) {
  showSpinner();
  try {
    const order = await window.api.getOrder(orderId);
    state.viewingOrderId = order.id;

    document.getElementById('modal-order-id').textContent = `#${order.order_id}`;
    document.getElementById('modal-order-customer').textContent = order.customer_name;
    document.getElementById('modal-order-date').textContent = formatDate(order.created_at);
    document.getElementById('modal-order-total').textContent = formatCurrency(order.total_amount);

    const statusBadgeEl = document.getElementById('modal-order-status');
    statusBadgeEl.className = order.status === 'Completed' ? 'badge-status-completed' :
                              order.status === 'Pending' ? 'badge-status-pending' : 'badge-status-cancelled';
    statusBadgeEl.textContent = order.status;

    // Render items list
    const itemsTbody = document.getElementById('modal-order-items-body');
    itemsTbody.innerHTML = order.items.map(item => `
      <tr>
        <td>
          <div class="fw-semibold">${item.product_name}</div>
          <div class="text-muted text-xs">${item.product_sku}</div>
        </td>
        <td class="text-center">${item.quantity}</td>
        <td class="text-end">${formatCurrency(item.price)}</td>
        <td class="text-end fw-bold">${formatCurrency(item.subtotal)}</td>
      </tr>
    `).join('');

    // Toggle actions based on current status
    const btnComplete = document.getElementById('btn-modal-complete-order');
    const btnCancel = document.getElementById('btn-modal-cancel-order');

    if (order.status === 'Completed') {
      btnComplete.classList.add('d-none');
      btnCancel.classList.remove('d-none'); // Can cancel
    } else if (order.status === 'Cancelled') {
      btnComplete.classList.add('d-none');
      btnCancel.classList.add('d-none');
    } else {
      // Pending
      btnComplete.classList.remove('d-none');
      btnCancel.classList.remove('d-none');
    }

    const modalEl = document.getElementById('orderDetailsModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  } catch (err) {
    showToast('Failed to load order: ' + err.message, 'danger');
  } finally {
    hideSpinner();
  }
}

async function markViewingOrderCompleted() {
  if (!state.viewingOrderId) return;
  showSpinner();
  try {
    const res = await window.api.completeOrder(state.viewingOrderId);
    showToast(res.message || 'Order completed! Stock has been updated.');

    const modalEl = document.getElementById('orderDetailsModal');
    bootstrap.Modal.getInstance(modalEl).hide();

    if (state.activeView === 'orders') loadOrders();
    else loadDashboard();
  } catch (err) {
    showToast(err.message, 'danger');
  } finally {
    hideSpinner();
  }
}

async function markViewingOrderCancelled() {
  if (!state.viewingOrderId) return;
  if (!confirm('Are you sure you want to cancel this order?')) return;

  showSpinner();
  try {
    const res = await window.api.cancelOrder(state.viewingOrderId);
    showToast(res.message || 'Order cancelled.');

    const modalEl = document.getElementById('orderDetailsModal');
    bootstrap.Modal.getInstance(modalEl).hide();

    if (state.activeView === 'orders') loadOrders();
    else loadDashboard();
  } catch (err) {
    showToast(err.message, 'danger');
  } finally {
    hideSpinner();
  }
}

// -----------------------------------------------------------------------------
// Point of Sale (POS) / New Sale
// -----------------------------------------------------------------------------
async function loadPosCatalog() {
  showSpinner();
  try {
    const params = {};
    if (state.posFilter.category) params.category = state.posFilter.category;
    if (state.posFilter.search) params.search = state.posFilter.search;

    const products = await window.api.getProducts(params);
    renderPosCatalog(products);
    updateApiStatus(true);
  } catch (err) {
    showToast(err.message, 'danger');
  } finally {
    hideSpinner();
  }
}

function renderPosCatalog(products) {
  const container = document.getElementById('pos-catalog-grid');
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = `<div class="col-12 text-center text-muted py-5">No products found in this category.</div>`;
    return;
  }

  container.innerHTML = products.map(p => {
    const isOutOfStock = p.stock_quantity <= 0;
    const isLowStock = p.stock_quantity > 0 && p.stock_quantity < 5;

    return `
      <div class="col-sm-6 col-md-4 col-xl-3">
        <div class="pos-product-card ${isOutOfStock ? 'out-of-stock' : ''}" onclick="${isOutOfStock ? '' : `addToCart(${p.id})`}">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <span class="badge bg-light text-secondary border font-monospace text-xs">${p.sku}</span>
            <span class="badge ${isOutOfStock ? 'bg-danger' : isLowStock ? 'bg-warning text-dark' : 'bg-success-subtle text-success'}">
              ${isOutOfStock ? 'Out of Stock' : p.stock_quantity + ' in stock'}
            </span>
          </div>
          <h6 class="fw-semibold text-dark mb-1 text-truncate" title="${escapeHtml(p.name)}">${p.name}</h6>
          <div class="text-muted text-xs mb-3">${p.category_name || ''}</div>
          
          <div class="mt-auto d-flex justify-content-between align-items-center">
            <span class="fs-5 fw-bold text-primary">${formatCurrency(p.selling_price)}</span>
            <button class="btn btn-sm ${isOutOfStock ? 'btn-secondary' : 'btn-primary'}" ${isOutOfStock ? 'disabled' : ''}>
              <i class="bi bi-cart-plus me-1"></i> Add
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterPosByCategory(catId) {
  state.posFilter.category = catId ? String(catId) : '';
  loadCategories(); // will refresh active pill highlight
  loadPosCatalog();
}

function addToCart(productId) {
  const product = state.products.find(p => p.id === productId) || 
                  state.analytics?.low_stock_products?.find(p => p.id === productId);

  // If not found in memory, fetch or find from latest catalog query
  if (!product) {
    window.api.getProduct(productId).then(p => {
      addProductToCartItem(p);
    });
  } else {
    addProductToCartItem(product);
  }
}

function addProductToCartItem(product) {
  const existing = state.cart.find(item => item.product.id === product.id);
  if (existing) {
    if (existing.quantity >= product.stock_quantity) {
      showToast(`Cannot add more. Only ${product.stock_quantity} units available in stock.`, 'warning');
      return;
    }
    existing.quantity += 1;
  } else {
    if (product.stock_quantity <= 0) {
      showToast('This product is out of stock.', 'warning');
      return;
    }
    state.cart.push({
      product: product,
      quantity: 1,
      price: parseFloat(product.selling_price)
    });
  }

  renderCart();
}

function updateCartItemQty(productId, newQty) {
  const item = state.cart.find(i => i.product.id === productId);
  if (!item) return;

  const parsedQty = parseInt(newQty);
  if (isNaN(parsedQty) || parsedQty <= 0) {
    removeFromCart(productId);
    return;
  }

  if (parsedQty > item.product.stock_quantity) {
    showToast(`Stock limit reached! Only ${item.product.stock_quantity} available.`, 'warning');
    item.quantity = item.product.stock_quantity;
  } else {
    item.quantity = parsedQty;
  }

  renderCart();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(item => item.product.id !== productId);
  renderCart();
}

function clearCart() {
  state.cart = [];
  renderCart();
}

function renderCart() {
  const itemsContainer = document.getElementById('pos-cart-items-list');
  const countBadge = document.getElementById('pos-cart-count');
  const subtotalEl = document.getElementById('pos-subtotal');
  const totalEl = document.getElementById('pos-total');
  const btnCheckout = document.getElementById('btn-pos-checkout');

  if (!itemsContainer) return;

  const totalCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = state.cart.reduce((sum, item) => sum + (item.quantity * item.price), 0);

  if (countBadge) countBadge.textContent = totalCount;
  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
  if (totalEl) totalEl.textContent = formatCurrency(subtotal);

  if (state.cart.length === 0) {
    itemsContainer.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="bi bi-cart3 fs-1 text-secondary opacity-50 mb-2"></i>
        <p class="mb-0">Cart is empty.</p>
        <small class="text-xs">Click any product on the left to add items.</small>
      </div>
    `;
    if (btnCheckout) btnCheckout.disabled = true;
    return;
  }

  if (btnCheckout) btnCheckout.disabled = false;

  itemsContainer.innerHTML = state.cart.map(item => `
    <div class="pos-cart-item">
      <div class="flex-grow-1 overflow-hidden me-2">
        <div class="fw-semibold text-truncate text-dark">${item.product.name}</div>
        <div class="text-muted text-xs">${formatCurrency(item.price)} each</div>
      </div>
      
      <div class="d-flex align-items-center gap-1">
        <button class="btn btn-outline-secondary qty-control-btn" onclick="updateCartItemQty(${item.product.id}, ${item.quantity - 1})">-</button>
        <input type="number" class="qty-input" value="${item.quantity}" min="1" max="${item.product.stock_quantity}"
               onchange="updateCartItemQty(${item.product.id}, this.value)" />
        <button class="btn btn-outline-secondary qty-control-btn" onclick="updateCartItemQty(${item.product.id}, ${item.quantity + 1})">+</button>
      </div>

      <div class="fw-bold text-end ms-2" style="min-width: 65px;">
        ${formatCurrency(item.quantity * item.price)}
      </div>

      <button class="btn btn-link text-danger p-0 ms-1" onclick="removeFromCart(${item.product.id})" title="Remove">
        <i class="bi bi-x-circle"></i>
      </button>
    </div>
  `).join('');
}

async function handleCheckoutOrder() {
  const customerInput = document.getElementById('pos-customer-name');
  const customerName = customerInput ? customerInput.value.trim() : '';
  const orderStatus = document.getElementById('pos-order-status')?.value || 'Completed';

  if (!customerName) {
    showToast('Please enter customer name.', 'warning');
    if (customerInput) customerInput.focus();
    return;
  }

  if (state.cart.length === 0) {
    showToast('Cannot checkout an empty cart.', 'warning');
    return;
  }

  const payload = {
    customer_name: customerName,
    status: orderStatus,
    items: state.cart.map(i => ({
      product: i.product.id,
      quantity: i.quantity,
      price: i.price
    }))
  };

  showSpinner();
  try {
    const order = await window.api.createOrder(payload);
    showToast(`Order #${order.order_id} created successfully! Total: ${formatCurrency(order.total_amount)}`, 'success');

    // Reset POS form
    clearCart();
    if (customerInput) customerInput.value = '';

    // Refresh catalog and backend stock state
    await loadPosCatalog();
    await loadCategories();

    // Open receipt modal for printing or viewing
    showOrderReceipt(order);
  } catch (err) {
    showToast(err.message, 'danger');
  } finally {
    hideSpinner();
  }
}

// -----------------------------------------------------------------------------
// Category Management Operations
// -----------------------------------------------------------------------------
async function openCategoryModal() {
  showSpinner();
  try {
    const cats = await window.api.getCategories();
    state.categories = cats;
    renderCategoriesModalTable(cats);

    const modalEl = document.getElementById('categoryModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  } catch (err) {
    showToast('Failed to load categories: ' + err.message, 'danger');
  } finally {
    hideSpinner();
  }
}

function renderCategoriesModalTable(categories) {
  const tbody = document.getElementById('category-modal-table-body');
  if (!tbody) return;

  if (categories.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No categories found.</td></tr>`;
    return;
  }

  tbody.innerHTML = categories.map(c => `
    <tr>
      <td class="fw-semibold text-dark">${escapeHtml(c.name)}</td>
      <td><span class="badge bg-light text-secondary border font-monospace">${escapeHtml(c.slug)}</span></td>
      <td class="text-muted text-xs">${escapeHtml(c.description || '-')}</td>
      <td class="text-center">
        <span class="badge bg-primary-subtle text-primary border border-primary-subtle">${c.product_count} items</span>
      </td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-danger" title="Delete Category" onclick="handleDeleteCategory(${c.id}, '${escapeHtml(c.name)}', ${c.product_count})">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

async function handleCreateCategory(e) {
  e.preventDefault();
  const nameInput = document.getElementById('new-category-name');
  const descInput = document.getElementById('new-category-desc');

  const name = nameInput.value.trim();
  const desc = descInput.value.trim();

  if (!name) return;

  showSpinner();
  try {
    await window.api.createCategory({ name, description: desc });
    showToast(`Category "${name}" created successfully!`);
    nameInput.value = '';
    descInput.value = '';
    await loadCategories();
    renderCategoriesModalTable(state.categories);
  } catch (err) {
    showToast(err.message, 'danger');
  } finally {
    hideSpinner();
  }
}

async function handleDeleteCategory(id, name, productCount) {
  if (productCount > 0) {
    showToast(`Cannot delete category "${name}": It has ${productCount} assigned product(s). Please reassign or delete the products first.`, 'warning');
    return;
  }

  if (!confirm(`Are you sure you want to delete category "${name}"?`)) return;

  showSpinner();
  try {
    await window.api.deleteCategory(id);
    showToast(`Category "${name}" deleted.`);
    await loadCategories();
    renderCategoriesModalTable(state.categories);
  } catch (err) {
    showToast(err.message, 'danger');
  } finally {
    hideSpinner();
  }
}

// -----------------------------------------------------------------------------
// Receipt / Invoice & Printing Operations
// -----------------------------------------------------------------------------
function showOrderReceipt(order) {
  document.getElementById('receipt-order-id').textContent = `#${order.order_id}`;
  document.getElementById('receipt-date').textContent = formatDate(order.created_at);
  document.getElementById('receipt-customer').textContent = order.customer_name;
  document.getElementById('receipt-subtotal').textContent = formatCurrency(order.total_amount);
  document.getElementById('receipt-total').textContent = formatCurrency(order.total_amount);

  const statusBadge = document.getElementById('receipt-status-badge');
  if (statusBadge) {
    statusBadge.textContent = `Status: ${order.status}`;
    statusBadge.className = `badge ${order.status === 'Completed' ? 'bg-success-subtle text-success border border-success-subtle' : order.status === 'Pending' ? 'bg-warning-subtle text-warning border border-warning-subtle' : 'bg-secondary-subtle text-secondary border'} mt-2 px-3 py-1 fw-bold`;
  }

  const itemsBody = document.getElementById('receipt-items-body');
  if (itemsBody) {
    itemsBody.innerHTML = (order.items || []).map(i => `
      <tr>
        <td>
          <div class="fw-semibold text-dark">${escapeHtml(i.product_name)}</div>
          <small class="text-muted text-xs">${escapeHtml(i.product_sku || '')}</small>
        </td>
        <td class="text-center">${i.quantity}</td>
        <td class="text-end">${formatCurrency(i.price)}</td>
        <td class="text-end fw-bold">${formatCurrency(i.subtotal || (i.quantity * i.price))}</td>
      </tr>
    `).join('');
  }

  const modalEl = document.getElementById('orderReceiptModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function printReceipt() {
  window.print();
}

function newSaleFromReceipt() {
  const modalEl = document.getElementById('orderReceiptModal');
  const modal = bootstrap.Modal.getInstance(modalEl);
  if (modal) modal.hide();
  switchView('pos');
}

async function printOrderReceiptFromModal() {
  if (!state.viewingOrderId) return;
  showSpinner();
  try {
    const order = await window.api.getOrder(state.viewingOrderId);
    const detailsModalEl = document.getElementById('orderDetailsModal');
    const detailsModal = bootstrap.Modal.getInstance(detailsModalEl);
    if (detailsModal) detailsModal.hide();

    showOrderReceipt(order);
  } catch (err) {
    showToast('Failed to load receipt: ' + err.message, 'danger');
  } finally {
    hideSpinner();
  }
}

// -----------------------------------------------------------------------------
// CSV Data Export Operations
// -----------------------------------------------------------------------------
function exportProductsCsv() {
  const url = window.api.getProductsExportUrl(state.productsFilter);
  window.open(url, '_blank');
}

function exportOrdersCsv() {
  const url = window.api.getOrdersExportUrl(state.ordersFilter);
  window.open(url, '_blank');
}

// -----------------------------------------------------------------------------
// UI Status Helpers
// -----------------------------------------------------------------------------
function updateApiStatus(isOnline, message = '') {
  state.systemOnline = isOnline;
  const statusEl = document.getElementById('api-status-badge');
  if (!statusEl) return;

  if (isOnline) {
    statusEl.className = 'api-badge bg-success-subtle text-success border border-success-subtle';
    statusEl.innerHTML = `<span class="pulse-dot"></span> Backend API Connected`;
  } else {
    statusEl.className = 'api-badge bg-danger-subtle text-danger border border-danger-subtle';
    statusEl.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i> Backend Offline: 127.0.0.1:8000`;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// -----------------------------------------------------------------------------
// Initialization & Event Listeners
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Mobile sidebar toggle
  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('show');
    });
  }

  // Navigation click handling
  document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      if (view) switchView(view);
    });
  });

  // Product Form submit
  const productForm = document.getElementById('product-form');
  if (productForm) {
    productForm.addEventListener('submit', saveProductForm);
  }

  // Product filters
  const prodSearch = document.getElementById('products-search-input');
  if (prodSearch) {
    let debounceTimer;
    prodSearch.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.productsFilter.search = e.target.value.trim();
        loadProducts();
      }, 300);
    });
  }

  const prodCatFilter = document.getElementById('products-category-filter');
  if (prodCatFilter) {
    prodCatFilter.addEventListener('change', (e) => {
      state.productsFilter.category = e.target.value;
      loadProducts();
    });
  }

  const prodStockFilter = document.getElementById('products-stock-filter');
  if (prodStockFilter) {
    prodStockFilter.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'low_stock') {
        state.productsFilter.low_stock = true;
        state.productsFilter.stock_status = '';
      } else {
        state.productsFilter.low_stock = false;
        state.productsFilter.stock_status = val;
      }
      loadProducts();
    });
  }

  // Orders filters
  const ordersSearch = document.getElementById('orders-search-input');
  if (ordersSearch) {
    let debounceTimer;
    ordersSearch.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.ordersFilter.search = e.target.value.trim();
        loadOrders();
      }, 300);
    });
  }

  document.querySelectorAll('.order-status-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.order-status-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.ordersFilter.status = btn.dataset.status || '';
      loadOrders();
    });
  });

  // POS search input
  const posSearch = document.getElementById('pos-search-input');
  if (posSearch) {
    let debounceTimer;
    posSearch.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.posFilter.search = e.target.value.trim();
        loadPosCatalog();
      }, 300);
    });
  }

  // Initial Data Load
  await loadCategories();
  switchView('dashboard');
});
