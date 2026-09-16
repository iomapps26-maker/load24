# Payment history (admin)

A staff-facing view of every wallet transaction — top-ups, withdrawals,
commissions, refunds, service charges, security holds/releases — searchable
and filterable, newest first. Unlike the Withdrawals / Wallet Top-Ups queues
(which only ever show one status awaiting review), this is the full
append-only ledger.

The work spans two repos:

| Repo | Change |
|---|---|
| **`load24`** (this repo) | `admin/payment-history/index.html` — new page. Nav link added across every admin page + a dashboard card. |
| **`Load24-app`** monorepo | `apps/backend/src/routes/wallet.js` — new `GET /api/wallet/admin/transactions`, `wallet.test.js` (+7 tests, 540 total). |

## API

**new** `GET /api/wallet/admin/transactions?q=&type=&status=&from=&to=&page=&limit=`
(staff — `admin`, `support_executive`, `support_manager`, `accounts_executive`,
`accounts_manager`, same `STAFF_ROLES` as the rest of `wallet.js`)

Reads `wallet_transactions` directly (migration 014) — the same table the
`apply_wallet_transaction()` trigger uses as the sole source of truth for a
wallet's balance.

- `type` / `status` — exact match against the table's check constraints
  (`add_money`, `credit`, `debit`, `refund`, `commission`, `service_charge`,
  `security_hold`, `security_release`, `withdrawal` / `pending`, `completed`,
  `failed`).
- `from` / `to` — ISO timestamps, filtered against `created_at`.
- `q` — matches `transaction_id` directly, or the owning user's name/mobile
  (resolved via a `user_profiles` lookup first, then OR'd in as a
  `user_id.in.(...)` clause — PostgREST can't filter a table by a related
  table's columns in one query, same two-step join `/topup-requests/pending`
  already uses for its profile lookup, just run before the main query
  instead of after).
- `page` / `limit` — default 20, capped at 100, same shape as
  `/api/admin/users`.

Response: `{ transactions: [...], page, limit, total }`, each transaction
carrying a `profile: { full_name, mobile }` (or `null` if the user has none).

## Admin UI

`admin/payment-history/index.html`: search box (name/mobile/transaction ID),
type + status dropdowns, date range, Prev/Next pagination — same filter-bar
and pagination patterns as Audit Log and Users. Amount column shows a
`+`/green for credit-side types (`add_money`, `credit`, `refund`,
`security_release`) and `−`/red for everything else, matching the sign
`apply_wallet_transaction()` actually applies to the balance.
