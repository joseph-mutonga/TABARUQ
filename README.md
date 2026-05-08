# TABARUQ Foods - Hotel Management System

A complete premium Hotel Management System built with Node.js, Express, MySQL, and Vanilla JS.

## 🚀 Features

- **Admin Dashboard**: Full control over inventory, users, expenses, and business analytics.
- **Cashier System**: Streamlined order creation and payment initiation.
- **M-Pesa Integration**: STK Push payments via Safaricom Daraja API.
- **Inventory Management**: Real-time stock tracking with low-stock alerts and audit trails.
- **Expense Tracking**: Categorized expense recording and history.
- **Reporting**: Exportable sales, profit/loss, and inventory reports in CSV format.
- **Premium UI**: Modern dark-themed glassmorphism design.

---

## 🛠️ Setup Instructions

### 1. Prerequisites
- Node.js (v14+)
- MySQL Community Server
- A Safaricom Daraja API Sandbox Account (for M-Pesa)

### 2. Database Setup
1. Open your MySQL client (e.g., MySQL Workbench or Command Line).
2. Create the database and tables using the provided `schema.sql` file:
   ```sql
   source path/to/TABARUQ/schema.sql;
   ```
3. The default admin credentials are:
   - **Username**: `admin`
   - **Password**: `admin123`

### 3. Environment Configuration
1. Open the `.env` file in the root directory.
2. Update your database credentials:
   - `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`
3. Update M-Pesa credentials from your Safaricom Developer dashboard:
   - `MPESA_CONSUMER_KEY`
   - `MPESA_CONSUMER_SECRET`
   - `MPESA_SHORTCODE` (Lipa Na M-Pesa Online Shortcode)
   - `MPESA_PASSKEY`
   - `MPESA_CALLBACK_URL` (Use a service like Ngrok for local testing)

### 4. Installation
```bash
npm install
```

### 5. Running the Application
```bash
# Production mode
npm start

# Development mode (with auto-reload)
npm run dev
```
The server will start on `http://localhost:5000`.

---

## 💳 M-Pesa Sandbox Testing Guide

1. **Get Credentials**:
   - Go to [Safaricom Daraja Portal](https://developer.safaricom.co.ke/).
   - Go to "My Apps" -> create an app to get Key and Secret.
   - Go to "Simulate" -> "Lipa Na Mpesa Sandbox" to get the Test Credentials (Shortcode, Passkey).

2. **Testing STK Push**:
   - In the Cashier Dashboard, click "Checkout".
   - Enter your phone number in the format `2547XXXXXXXX`.
   - Ensure your phone is near; you will receive a prompt to enter your M-Pesa PIN.
   - **Note**: For sandbox testing, only certain numbers registered on Daraja might work.

3. **Manual Confirmation**:
   - After the customer pays, the system receives a callback.
   - The cashier/admin must go to **Orders & Payments** and click **Confirm Payment** after seeing the M-Pesa Receipt Number.

---

## 📂 Project Structure

- `src/`: Backend logic (controllers, routes, middleware, config).
- `public/`: Frontend assets (HTMl, CSS, JS).
- `schema.sql`: Database initialization script.
- `.env`: System configurations.

---

Built with ❤️ for TABARUQ Foods.
