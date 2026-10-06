-- Run once in the Rupee Trace project's Supabase SQL Editor.
-- One atomic document per account keeps cycles and activity history consistent.
begin;
create table if not exists public.user_budgets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'version' = '2'),
  revision bigint not null default 1 check (revision > 0)
);
alter table public.user_budgets enable row level security;
revoke all on public.user_budgets from anon, authenticated;
grant select, insert, update on public.user_budgets to authenticated;

drop policy if exists "Read own budget" on public.user_budgets;
create policy "Read own budget" on public.user_budgets for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Create own budget" on public.user_budgets;
create policy "Create own budget" on public.user_budgets for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Update own budget" on public.user_budgets;
create policy "Update own budget" on public.user_budgets for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
commit;
-- Verify RLS and the three ownership policies after setup.
select relrowsecurity as rls_enabled from pg_class
where oid = 'public.user_budgets'::regclass;
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'user_budgets';
