# Rupee Trace account setup

The app uses Supabase Auth in the browser. Database Row Level Security—not the login screen—enforces ownership. No service-role key is used.

## Finish setup in Supabase

1. Open the Rupee Trace project's SQL Editor, create a query, paste all of `supabase/setup.sql`, and run it. The verification results should show RLS enabled and three policies.
2. In Authentication > URL Configuration, set the local Site URL to `http://localhost:3001` and allow redirect URL `http://localhost:3001/`. When deploying, replace the Site URL with the production URL and add its exact redirect URL.
3. Keep email confirmation enabled. Configure a production SMTP provider before inviting external testers; Supabase's built-in email delivery is restricted and is not suitable for general public sign-ups.
4. Open the app, create your own account, confirm its email, and log in. Do not share your password.
5. If you want your existing browser budget in this account, explicitly choose Import browser budget. The original localStorage copy is kept. Import is available only for an account without a cloud budget.

## Verification still required

- Create two separate accounts. Save different budgets and confirm each account sees only its own data after logout/login and refresh.
- Under user B's authenticated session, request user A's ID via the Data API: SELECT must return no rows, UPDATE must affect no rows, INSERT for A must fail. Anonymous access must fail.
- Open the same account in two tabs. Save in tab one, then try to save from tab two; tab two must show a conflict and must not overwrite tab one's changes.
- Test confirmation and password reset email links with the configured redirect URLs.

## Storage design

For this small MVP, one JSON document per user contains current and archived cycles, expenses, categories, and activity history. Each save is atomic and includes an optimistic revision check. The primary key on user_id supports ownership lookups. This avoids a large data migration while retaining the existing model. It is not a tamper-proof audit log: users control their own budget document. A normalized schema is a future option as data volumes grow.

Account data is loaded on login/refresh. There is no realtime subscription or offline cloud editing. Failed saves leave the form and old saved state intact. The existing browser budget is never silently uploaded or assigned to an account.
