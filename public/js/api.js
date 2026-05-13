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
