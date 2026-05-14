const API_URL = '/api';

const apiFetch = async (endpoint, options = {}) => {
    const token = localStorage.getItem('token');

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
    });

    const data = await response.json();

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            // Token expired or unauthorized
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/';
        }
        throw new Error(data.message || 'Something went wrong');
    }

    return data;
};

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('sw-KE', { style: 'currency', currency: 'KES' }).format(amount);
};

// Global Socket.io initialization
let socket;
if (typeof io !== 'undefined') {
    socket = io();
    console.log('Socket initialized');
    
    // Global listeners for real-time updates
    socket.on('order_update', (data) => {
        console.log('Order update received:', data);
        if (typeof loadStats === 'function') loadStats();
        if (typeof loadRecentOrders === 'function') loadRecentOrders();
        if (typeof checkPendingPayments === 'function') checkPendingPayments();
        if (typeof loadData === 'function') loadData();
        if (typeof loadOrders === 'function') loadOrders();
    });

    socket.on('stock_update', (data) => {
        console.log('Stock update received:', data);
        if (typeof loadInventory === 'function') loadInventory();
        if (typeof loadStats === 'function') loadStats();
    });

    socket.on('new_delivery_order', (data) => {
        console.log('Delivery order received:', data);
        if (typeof loadActiveOrders === 'function') loadActiveOrders();
    });

    socket.on('expense_update', () => {
        console.log('Expense update received');
        if (typeof loadExpenses === 'function') loadExpenses();
        if (typeof loadStats === 'function') loadStats();
    });
}

// Global Mobile Menu Toggle
function initMobileMenu() {
    const layout = document.querySelector('.layout');
    if (!layout) return;

    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Create Mobile Header if not exists
    if (!document.querySelector('.mobile-header')) {
        const mobileHeader = document.createElement('div');
        mobileHeader.className = 'mobile-header';
        mobileHeader.innerHTML = `
            <div style="color: var(--primary); font-weight: 800; letter-spacing: 0.1em;">TABARUQ</div>
            <button class="menu-toggle"><i class="fas fa-bars"></i></button>
        `;
        layout.prepend(mobileHeader);

        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1900;';
        document.body.appendChild(overlay);

        const toggleBtn = mobileHeader.querySelector('.menu-toggle');
        
        const toggleSidebar = () => {
            sidebar.classList.toggle('active');
            overlay.style.display = sidebar.classList.contains('active') ? 'block' : 'none';
        };

        toggleBtn.onclick = toggleSidebar;
        overlay.onclick = toggleSidebar;
    }
}

document.addEventListener('DOMContentLoaded', initMobileMenu);
