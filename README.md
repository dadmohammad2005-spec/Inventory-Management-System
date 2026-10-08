# StockFlow - Production Inventory & Order Management System

A full-stack, production-grade Inventory and Order Management ERP system built with **Django REST Framework (DRF)** on the backend and a responsive **HTML5 + Bootstrap 5 + Vanilla JavaScript (Fetch API)** dashboard on the frontend.

---

## Architecture Overview

```
c:\Users\Dad Mohammad\Desktop\software\
├── start.bat                  # One-click Windows launcher (starts backend & opens browser)
├── start.ps1                  # One-click PowerShell launcher
├── test.bat                   # Runs automated backend test suite
├── backend/
│   ├── inventory_system/      # Django project configuration
│   │   ├── settings.py        # CORS, DRF, Database, & Frontend directory mount
│   │   ├── urls.py            # Root router mounting /api/, /admin/, and root frontend
│   │   ├── wsgi.py            # WSGI application entrypoint
│   │   └── asgi.py            # ASGI application entrypoint
│   ├── inventory/             # Core Inventory ERP app
│   │   ├── models.py          # Category, Product, Order, OrderItem with PROTECT constraints
│   │   ├── serializers.py     # DRF serializers with atomic stock deduction & multi-item checks
│   │   ├── views.py           # ViewSets, Analytics API view, CSV exporters, Restock action
│   │   ├── urls.py            # Router registrations
│   │   ├── tests.py           # 13 automated test cases covering models, APIs, exports, & concurrency
│   │   ├── admin.py           # Django Admin configuration with inlines & editable fields
│   │   └── management/commands/
│   │       └── seed_data.py   # Realistic sample data seeder
│   ├── manage.py
│   └── requirements.txt
│
└── frontend/
    ├── index.html             # Single-page ERP dashboard & POS interface
    ├── css/
    │   └── style.css          # Custom styling, responsive layouts, & printable receipt stylesheet
    └── js/
        ├── api.js             # API client with auto host detection, CSV export & CRUD helpers
        └── app.js             # App state, POS cart, receipt generation, category management, & modals
```

---

## Key Features & Enterprise Capabilities

### 1. Relational Data Models & Constraints
- **Category**: `name`, `slug` (auto-generated unique slug), `description`. Protected from accidental deletion if products are assigned (`on_delete=models.PROTECT`).
- **Product**: `name`, `sku` (case-insensitive unique index), `category` (Foreign Key with `PROTECT`), `cost_price`, `selling_price`, `stock_quantity`, `is_low_stock` property (< 5 items).
- **Order**: `order_id` (auto-generated e.g. `ORD-YYYYMMDD-XXXX`), `customer_name`, `total_amount`, `status` (`Pending`, `Completed`, `Cancelled`), `created_at`. Completed orders cannot be deleted directly without cancelling first to protect historical inventory records.
- **OrderItem**: `order` (Cascade), `product` (Protect constraint to prevent accidental loss of historical records), `quantity`, `price`, `subtotal`.

### 2. Auto-Updating Stock Levels & Concurrency Safety
- **Atomic Transactions (`@transaction.atomic`)**:
  - When an Order is created directly with `Completed` status, product stock levels are automatically decremented.
  - Multi-item validation aggregates quantities for identical items within the same order to prevent overdraft.
  - When an Order transitions from `Pending` to `Completed` (via PATCH or `/api/orders/{id}/mark_completed/`), stock levels are validated with `select_for_update()` to prevent race conditions and decremented.
  - If any product has insufficient stock (`available < requested`), the transaction rolls back cleanly with a `400 Bad Request` informing the user of the exact deficiency.
  - When an order transitions from `Completed` to `Cancelled`, the deducted stock is automatically restored to inventory.

### 3. Executive Analytics & Dashboard
- **Live KPI Summary**: Real-time revenue from completed orders, total orders count, catalog product count, and low-stock alert counter (< 5 units).
- **Top-Selling Products Leaderboard**: Dynamic ranking of top items by volume sold and revenue generated.
- **Order Fulfillment Breakdown**: Progress bar and visual counters showing Completed, Pending, and Cancelled orders.
- **Low-Stock Watchlist & Alert Banner**: Immediate notice of depleted items with quick one-click restock actions.
- **Recent Transactions Feed**: Fast order inspection and status badges.

### 4. Point of Sale (POS) & Printable Receipts
- Two-column point of sale screen with instant catalog search, category pills, and live cart adjustments.
- Stock ceiling guards that prevent over-ordering in the cart.
- Immediate checkout with order status selection (`Completed` or `Pending`).
- **Printable Order Receipt Modal**: Formatted sales receipt ready for thermal or standard printing (`@media print` CSS stylesheet automatically hides all navigation, sidebars, and buttons).
- Receipts can also be generated and printed anytime from the Order History table.

### 5. Category & Inventory Management
- Dedicated **Category Management Modal** to create new categories, view active product counts, and safely delete unused categories.
- Modal-based **Quick Restock** with quick chips (`+5`, `+10`, `+25`, `+50`, `+100`) and custom quantity inputs.
- Add / Edit product modal with instant validation and SKU uniqueness checks.

### 6. CSV Data Export
- One-click **Export Inventory CSV** button (`/api/products/export_csv/`) to download all catalog items, prices, and stock levels.
- One-click **Export Orders CSV** button (`/api/orders/export_csv/`) to download full sales transaction history.

---

## Quickstart & Launch Guide

### Option A: One-Click Launch (Recommended for Windows)
Simply double-click or run:
```cmd
start.bat
```
*(Or in PowerShell: `.\start.ps1`)*

This script automatically verifies Python, sets up `backend/venv`, installs dependencies, applies migrations, seeds demo data, opens your web browser to **`http://127.0.0.1:8000`**, and starts the server.

---

### Option B: Manual Setup

#### Step 1: Open Terminal & Navigate to Project Directory
```powershell
cd "c:\Users\Dad Mohammad\Desktop\software"
```

#### Step 2: Set Up Virtual Environment & Dependencies
```powershell
# Create virtual environment inside backend (if not already created)
py -m venv backend/venv

# Activate virtual environment
.\backend\venv\Scripts\Activate.ps1

# Install requirements
pip install -r backend/requirements.txt
```

#### Step 3: Run Database Migrations
```powershell
python backend\manage.py makemigrations
python backend\manage.py migrate
```

#### Step 4: Populate Initial Demo Data
```powershell
python backend\manage.py seed_data
```

#### Step 5: Run Automated Tests
```powershell
python backend\manage.py test inventory
```
*(Runs 13 unit and integration tests verifying all endpoints, stock reductions, and edge cases).*

#### Step 6: Start Server
```powershell
python backend\manage.py runserver 127.0.0.1:8000
```
- Web Application: **`http://127.0.0.1:8000/`**
- Browsable REST API: **`http://127.0.0.1:8000/api/`**
- Django Admin: **`http://127.0.0.1:8000/admin/`**

---

## REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/analytics/` | Dashboard metrics (revenue, low-stock count, order counts, top products) |
| `GET` | `/api/categories/` | List all categories with product counts |
| `POST` | `/api/categories/` | Create a new category |
| `DELETE` | `/api/categories/{id}/` | Delete category (blocked if category contains products) |
| `GET` | `/api/products/` | List products (`?search=`, `?category=`, `?low_stock=true`, `?stock_status=`) |
| `POST` | `/api/products/` | Create a new product |
| `GET` | `/api/products/{id}/` | Retrieve product details |
| `PATCH` | `/api/products/{id}/` | Partial update product |
| `DELETE` | `/api/products/{id}/` | Delete product |
| `POST` | `/api/products/{id}/restock/` | Add inventory quantity (`{"quantity": 10}`) |
| `GET` | `/api/products/export_csv/` | Download product catalog as CSV |
| `GET` | `/api/orders/` | List orders (`?status=`, `?search=`) |
| `POST` | `/api/orders/` | Create order with nested `items` (deducts stock if Completed) |
| `GET` | `/api/orders/{id}/` | Retrieve order details & line items |
| `POST` | `/api/orders/{id}/mark_completed/` | Mark order as Completed & reduce inventory atomically |
| `POST` | `/api/orders/{id}/mark_cancelled/` | Mark order as Cancelled & restore inventory |
| `GET` | `/api/orders/export_csv/` | Download sales transaction history as CSV |
| `DELETE` | `/api/orders/{id}/` | Delete order (blocked if Completed to protect records) |
