/**
 * Inventory & Order Management System - API Client
 * Communicates with the Django REST Framework backend.
 */

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.protocol.startsWith('http')) {
      if (window.location.port === '8000') {
        return `${window.location.origin}/api`;
      }
      return `${window.location.protocol}//${window.location.hostname}:8000/api`;
    }
  }
  return 'http://127.0.0.1:8000/api';
};

const API_BASE_URL = getApiBaseUrl();

class ApiService {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Core request wrapper around fetch API
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    const defaultHeaders = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {}),
      },
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);

      // Handle 204 No Content
      if (response.status === 204) {
        return null;
      }

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        // Parse Django REST Framework error structures
        let errorMessage = 'An unexpected error occurred.';
        if (typeof data === 'string') {
          errorMessage = data;
        } else if (data && typeof data === 'object') {
          if (data.detail) {
            errorMessage = data.detail;
          } else if (data.error) {
            errorMessage = data.error;
          } else if (data.message) {
            errorMessage = data.message;
          } else {
            // Field errors e.g. { sku: ["This field must be unique."], items: ["Insufficient stock"] }
            const errorEntries = Object.entries(data).map(([field, msgs]) => {
              const text = Array.isArray(msgs) ? msgs.join(', ') : msgs;
              return `${field}: ${text}`;
            });
            errorMessage = errorEntries.join(' | ');
          }
        }
        const error = new Error(errorMessage);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error(`Unable to connect to backend at ${this.baseUrl}. Please verify the Django server is running.`);
      }
      throw err;
    }
  }

  // --- Health Check ---
  async checkHealth() {
    return this.request('/analytics/');
  }

  // --- Analytics ---
  async getAnalytics() {
    return this.request('/analytics/');
  }

  // --- Categories ---
  async getCategories() {
    const res = await this.request('/categories/');
    return Array.isArray(res) ? res : (res.results || []);
  }

  async createCategory(categoryData) {
    return this.request('/categories/', {
      method: 'POST',
      body: categoryData,
    });
  }

  async deleteCategory(id) {
    return this.request(`/categories/${id}/`, {
      method: 'DELETE',
    });
  }

  // --- Products ---
  async getProducts(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.category) query.append('category', params.category);
    if (params.low_stock) query.append('low_stock', 'true');
    if (params.stock_status) query.append('stock_status', params.stock_status);
    if (params.ordering) query.append('ordering', params.ordering);

    const queryString = query.toString();
    const endpoint = `/products/${queryString ? '?' + queryString : ''}`;
    const res = await this.request(endpoint);
    return Array.isArray(res) ? res : (res.results || []);
  }

  async getProduct(id) {
    return this.request(`/products/${id}/`);
  }

  async createProduct(productData) {
    return this.request('/products/', {
      method: 'POST',
      body: productData,
    });
  }

  async updateProduct(id, productData) {
    return this.request(`/products/${id}/`, {
      method: 'PATCH',
      body: productData,
    });
  }

  async deleteProduct(id) {
    return this.request(`/products/${id}/`, {
      method: 'DELETE',
    });
  }

  async restockProduct(id, quantity) {
    return this.request(`/products/${id}/restock/`, {
      method: 'POST',
      body: { quantity },
    });
  }

  getProductsExportUrl(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.category) query.append('category', params.category);
    if (params.low_stock) query.append('low_stock', 'true');
    if (params.stock_status) query.append('stock_status', params.stock_status);
    const qs = query.toString();
    return `${this.baseUrl}/products/export_csv/${qs ? '?' + qs : ''}`;
  }

  getOrdersExportUrl(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.status) query.append('status', params.status);
    const qs = query.toString();
    return `${this.baseUrl}/orders/export_csv/${qs ? '?' + qs : ''}`;
  }

  // --- Orders ---
  async getOrders(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.status) query.append('status', params.status);
    if (params.ordering) query.append('ordering', params.ordering);

    const queryString = query.toString();
    const endpoint = `/orders/${queryString ? '?' + queryString : ''}`;
    const res = await this.request(endpoint);
    return Array.isArray(res) ? res : (res.results || []);
  }

  async getOrder(id) {
    return this.request(`/orders/${id}/`);
  }

  async createOrder(orderData) {
    return this.request('/orders/', {
      method: 'POST',
      body: orderData,
    });
  }

  async completeOrder(id) {
    return this.request(`/orders/${id}/mark_completed/`, {
      method: 'POST',
    });
  }

  async cancelOrder(id) {
    return this.request(`/orders/${id}/mark_cancelled/`, {
      method: 'POST',
    });
  }
}

// Global API instance
window.api = new ApiService();
