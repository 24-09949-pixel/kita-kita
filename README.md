# Kita Kita — Sales, Inventory & Utang Analytics for Small Retailers

Node.js + Express + SQLite backend with a responsive HTML/CSS/JavaScript front end (no build step).

## Quick start
```bash
npm install
npm start         # http://localhost:3000, then create your owner account
npm test          # 40 API tests (auth, roles, POS, stock, credit, portal, gateway, reports, security)
```

An empty database opens a one-time owner setup screen. After creating the owner, log in at `/`; create your customer account at `/#/customer` using **Create account**. New customer accounts start with no credit until the owner sets a limit.

## Configuration (environment variables)
Node.js 22+ · `PORT` (3000) · `DB_FILE` (kitakita.db) · `JWT_SECRET` (required in production) · `STORE_NAME`, `STORE_ADDRESS`, `STORE_PHONE` (shown on receipts) · `TZ=Asia/Manila` (so "today" matches the store's day).

## GCash payments
From the customer portal's separate payment page, customers can choose GCash app checkout or QR Ph. The QR option opens PayMongo's hosted checkout with a dynamic QR code for the exact amount. Set `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` together, and set `PUBLIC_URL` to the public HTTPS origin if the host does not provide `RENDER_EXTERNAL_URL`. Create a PayMongo webhook for `checkout_session.payment.paid` at `https://<your-domain>/webhooks/paymongo`. The secret key and webhook secret belong only in the hosting provider's secret environment-variable settings.

The customer is redirected to PayMongo; the app marks a payment confirmed only after validating PayMongo's webhook signature, payment mode, PHP amount, and matching checkout session. Duplicate webhook events are idempotent. The customer return page is not treated as proof of payment. Staff POS e-wallet sales remain manually recorded.

## Deploy to Render
1. Push this project to a Git repository and connect that repository to Render.
2. In Render, create a **Blueprint** from `render.yaml`. The service includes a persistent disk at `/var/data`; Render disks require a paid service. Review Render's current service and disk charges before confirming.
3. Enter `BOOTSTRAP_ADMIN_EMAIL` and a strong `BOOTSTRAP_ADMIN_PASSWORD` (at least 12 characters) when prompted. Render generates `JWT_SECRET`. The first boot creates the owner account; remove `BOOTSTRAP_ADMIN_PASSWORD` from the service environment after the account is created.
4. Open the deployed HTTPS URL and sign in as the owner. In PayMongo, first use test-mode credentials and register a webhook for `checkout_session.payment.paid` at `https://<your-render-host>/webhooks/paymongo`. Add `PAYMONGO_SECRET_KEY` and the webhook endpoint's `PAYMONGO_WEBHOOK_SECRET` in the Render service's environment settings, then redeploy.
5. Test a complete GCash checkout in PayMongo test mode and confirm the webhook delivery and credit balance update. Only switch to live keys after your PayMongo account and GCash method are activated and the test flow succeeds.

Flow: **Customer portal → Kita Kita backend → PayMongo Hosted Checkout → GCash**. PayMongo sends a signed webhook back to Kita Kita, and the backend updates the SQLite database on the persistent Render disk. The browser return page is not treated as proof of payment.

## Modules
**Owner/Cashier:** Dashboard · Insights (profit per item/category, best sellers & slow movers, peak hours heatmap, trend + next-week forecast) · POS (barcode/SKU scan, cash / e-wallet / utang, discounts, credit-limit checks, receipts) · Inventory (add/edit/delete, restock history, reorder levels, expiry) · Customers & profiles · Credit (due dates, partial payments, request approvals, e-wallet confirmations) · Transactions (+void) · Reports (sales/profit by day/week/month, inventory, credit aging; CSV + print) · Expenses · Users & login activity.
**Customer portal:** Dashboard · Products · My Credit (+ pay balance) · Credit Requests · Purchase History · Payments.

## Rules built into the server
* Stock is deducted **only inside the checkout transaction after validation** — scanning/adding to cart never changes stock; failed or cancelled sales change nothing. Voiding restores stock.
* Utang requires a customer + valid due date, respects the credit limit (only an admin can override) and supports a down payment.
* Payments apply to the oldest utang first (or a chosen one); partial payments are allowed; overpaying is rejected.
* Manual customer e-wallet payments stay **pending** until staff confirm them; PayMongo GCash payments stay pending until a valid paid webhook arrives; cash is paid at the counter.
* Cashiers cannot see cost prices/profit, reports, expenses or users, and cannot approve credit or void sales (enforced server-side, not just hidden in the UI).
* Passwords are bcrypt-hashed; JWT sessions (12 h); login rate-limiting; parameterised SQL; output is HTML-escaped; CSP + security headers.

## Notes
* Test-only fixture data is used by the automated API tests; the app never seeds demo accounts or demo records at startup.
* Camera barcode scanning is not included; USB/Bluetooth scanners work because they type into the scan box.
* SMS integration is not included: reminders are copyable messages. Live payment processing still requires a configured PayMongo account, active GCash method, HTTPS deployment, and successful test-mode verification.
