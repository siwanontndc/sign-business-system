# SIGN BUSINESS — Smart Finance setup

## 1) Supabase
Run migration `supabase/migrations/20260906_smart_finance.sql` in the target Supabase project. It creates `finance_transactions`, RLS policies, duplicate-detection indexes, and the private `finance-evidence` Storage bucket.

## 2) Server environment variables
Add these to the deployment environment and local `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
OPENAI_VISION_MODEL=gpt-5.6-luna
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
```

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `LINE_CHANNEL_SECRET`, or `LINE_CHANNEL_ACCESS_TOKEN` as `NEXT_PUBLIC_*` variables.

## 3) LINE accounting room
Create/use a LINE Official Account with Messaging API enabled. Allow the Official Account to join group chats, add it to the accounting group, and set its webhook URL to:

`https://YOUR-DOMAIN/api/line/webhook`

Enable webhooks in LINE Developers Console. The endpoint verifies `x-line-signature` before processing messages. Only images sent after the bot is in the group are automatically captured.

## 4) Workflow
- Gallery: Finance → “นำเข้าจาก Gallery” → select one or many screenshots/slips.
- LINE: send a slip image to the accounting group containing the bot.
- AI-extracted records enter as `pending`.
- Finance staff reviews category and Job, then presses “ยืนยัน”.
- Only `confirmed` transactions are counted in income, expense, net and Job profit.
- Manual transactions are immediately stored as `confirmed`.

## 5) Duplicate protection
The system stores a SHA-256 fingerprint based on direction, amount, date, bank/reference and counterparty, plus a unique LINE message ID. Duplicate inserts are rejected at the database level.

## 6) Security boundary
This feature does not log in to or read banking apps. It processes only images/files explicitly uploaded to SIGN BUSINESS or sent to the configured LINE accounting room.
