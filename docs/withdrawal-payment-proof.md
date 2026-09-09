# Withdrawal payment proof

When staff pay out a wallet withdrawal they attach a **payment-proof
screenshot** (bank / UPI transfer receipt) as part of *Mark Paid*. The
requesting user sees it in the app's Wallet section next to that withdrawal.

The work spans two repos:

| Repo | Change |
|---|---|
| **`load24`** (this repo) | `admin/withdrawals/index.html` — Mark Paid now uploads a proof screenshot (+ optional bank reference / UTR) and shows it on paid rows. |
| **`Load24-app`** monorepo | `db/migrations/060_add_withdrawal_payment_proof.sql`, `apps/backend/src/routes/wallet.js`, `apps/mobile/screens/WalletScreen.jsx`. |

## Flow

```
approved ──▶ [staff] Mark Paid
              1. POST /api/wallet/withdrawals/:id/pay/upload-url { file_name }
                 → { bucket, storage_path, signed_url, token }
              2. PUT the image straight to Supabase Storage (uploadToSignedUrl)
              3. POST /api/wallet/withdrawals/:id/pay { storage_path, reference }
                 → row + short-lived signed payment_proof_url
            ──▶ paid    (user gets a "withdrawal paid" push, already wired)
```

Same signed-upload-URL pattern as KYC docs / bank proofs / wallet top-up
screenshots — nothing here uses multipart.

## Data (migration 060)

`withdrawal_requests` gains `payment_proof_path`, `payment_reference`,
`paid_at`, `paid_by`. Private bucket `withdrawal-payment-proofs`, object key
`${user_id}/${withdrawal_id}.${ext}`, viewed only through ~5-min signed URLs.

## API

- **new** `POST /api/wallet/withdrawals/:id/pay/upload-url` (staff) — mints the
  upload URL; 409 unless the request is `approved`.
- **changed** `POST /api/wallet/withdrawals/:id/pay` (staff) — now requires
  `storage_path` (optional `reference`, ≤ 64 chars); records the proof + payout
  metadata alongside the existing ledger debit; returns `payment_proof_url`.
- **changed** `GET /api/wallet/withdrawals/pending` (staff) — now returns
  `pending` **and** `approved` so an approved request survives a page reload.
- **changed** `GET /api/wallet/withdrawals/mine` (user) — each row now carries a
  signed `payment_proof_url` (null unless paid with a proof).

## App

`WalletScreen` withdrawal rows: `paid` rows show the proof thumbnail
(tap → full-screen viewer), the paid date, and the reference if present.
