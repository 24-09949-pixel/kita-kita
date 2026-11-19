# Kita Kita — Sales, Inventory & Utang Analytics for Small Retailers

Node.js + Express + SQLite backend with a responsive HTML/CSS/JavaScript front end (no build step).

## Quick start
```bash
npm install
npm start         # http://localhost:3000, then create your owner account
npm test          # 39 API tests (auth, roles, POS, stock, credit, portal, QR proof review, reports, security)
```

An empty database opens a one-time owner setup screen. After creating the owner, log in at `/`; create your customer account at `/#/customer` using **Create account**. New customer accounts start with no credit until the owner sets a limit.

## Configuration (environment variables)
Node.js 22+ · `PORT` (3000) · `DB_FILE` (kitakita.db) · `JWT_SECRET` (required in production) · `STORE_NAME`, `STORE_ADDRESS`, `STORE_PHONE` (shown on receipts) · `TZ=Asia/Manila` (so "today" matches the store's day).

## Manual GCash QR payments
The customer portal displays the store's static QR image at `public/images/gcash-payment-qr.png`. Replace that file with the store's own QR image when needed. Customers send the transfer in their wallet app, then submit the amount, last four reference digits, and a receipt screenshot (JPEG, PNG, or WebP; maximum 4 MB). A submission stays pending and does not change the balance until an admin checks the funds and confirms it in **Credit → Payments**. Rejected proofs do not change the balance. Confirmations record the admin and timestamp.

Receipt images are stored in the SQLite database and served only to admins. This workflow does not use a hosted checkout or payment-gateway account; wallet or bank transfer fees may still apply. Existing payment history is preserved; unused legacy database fields are not queried or deleted.

## Deploy to Render
1. Push this project to a Git repository and connect that repository to Render.
2. In Render, create a **Blueprint** from `render.yaml`. The service includes a persistent disk at `/var/data`; Render disks require a paid service. Review Render's current service and disk charges before confirming.
3. Enter `BOOTSTRAP_ADMIN_EMAIL` and a strong `BOOTSTRAP_ADMIN_PASSWORD` (at least 12 characters) when prompted. Render generates `JWT_SECRET`. The first boot creates the owner account; remove `BOOTSTRAP_ADMIN_PASSWORD` from the service environment after the account is created.
4. Open the deployed HTTPS URL, sign in as the owner, and verify that the store's QR image is correct. Keep the persistent disk enabled so payment records and receipt images survive restarts.

## Modules
**Owner/Cashier:** Dashboard · Insights (profit per item/category, best sellers & slow movers, peak hours heatmap, trend + next-week forecast) · POS (barcode/SKU scan, cash / e-wallet / utang, discounts, credit-limit checks, receipts) · Inventory (add/edit/delete, restock history, reorder levels, expiry) · Customers & profiles · Credit (due dates, partial payments, request approvals, payment verification) · Transactions (+void) · Reports (sales/profit by day/week/month, inventory, credit aging; CSV + print) · Expenses · Users & login activity.
**Customer portal:** Dashboard · Products · My Credit · GCash QR payment proof submission · Credit Requests · Purchase History · Payments.

## Rules built into the server
* Stock is deducted **only inside the checkout transaction after validation** — scanning/adding to cart never changes stock; failed or cancelled sales change nothing. Voiding restores stock.
* Utang requires a customer + valid due date, respects the credit limit (only an admin can override) and supports a down payment.
* Payments apply to the oldest utang first (or a chosen one); partial payments are allowed; overpaying is rejected.
* Customer QR payment proofs stay **pending** until an admin verifies the funds; only confirmation applies the payment to the balance and records its timestamp. Rejection leaves the balance unchanged.
* Cashiers cannot see cost prices/profit, reports, expenses or users, and cannot approve credit or void sales (enforced server-side, not just hidden in the UI).
* Passwords are bcrypt-hashed; JWT sessions (12 h); login rate-limiting; parameterised SQL; output is HTML-escaped; CSP + security headers.

## Notes
* Test-only fixture data is used by the automated API tests; the app never seeds demo accounts or demo records at startup.
* Camera barcode scanning is not included; USB/Bluetooth scanners work because they type into the scan box.
* SMS integration is not included: reminders are copyable messages. The QR image is a static store asset; customers must enter the amount in their wallet app and the admin must independently verify receipt of funds.
