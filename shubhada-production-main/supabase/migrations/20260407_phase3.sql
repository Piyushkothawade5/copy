create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('supervisor', 'manager', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'shift_kind') then
    create type public.shift_kind as enum ('day', 'evening', 'night');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.request_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'role', auth.role(), 'anon');
$$;

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.operators (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.downtime_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.rejection_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null unique,
  full_name text not null,
  role public.app_role not null default 'supervisor',
  auth_user_id uuid unique references auth.users(id) on delete set null,
  alias_email text not null unique,
  active boolean not null default true,
  pin_last_reset_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.production_entries (
  id uuid primary key default gen_random_uuid(),
  production_date date not null,
  shift public.shift_kind not null,
  supervisor_id uuid not null references public.employees(id),
  machine_id uuid not null references public.machines(id),
  part_id uuid not null references public.parts(id),
  operator_id uuid not null references public.operators(id),
  planned_runtime_hours numeric(12,2) not null check (planned_runtime_hours >= 0),
  actual_runtime_hours numeric(12,2) not null check (actual_runtime_hours >= 0),
  downtime_hours numeric(12,2) not null default 0,
  downtime_reason_id uuid references public.downtime_reasons(id),
  target_qty numeric(12,2) not null check (target_qty >= 0),
  actual_qty numeric(12,2) not null check (actual_qty >= 0),
  rejection_qty numeric(12,2) not null default 0 check (rejection_qty >= 0),
  rejection_reason_id uuid references public.rejection_reasons(id),
  good_qty numeric(12,2) not null default 0,
  availability numeric(8,4) not null default 0,
  performance numeric(8,4) not null default 0,
  quality numeric(8,4) not null default 0,
  oee numeric(8,2) not null default 0,
  remarks text,
  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.report_recipients (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  email text not null unique,
  active boolean not null default true,
  receives_daily boolean not null default true,
  receives_monthly boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.report_runs (
  id uuid primary key default gen_random_uuid(),
  report_kind text not null,
  period_start date not null,
  period_end date not null,
  trigger_source text not null default 'manual',
  status text not null default 'started',
  recipient_count integer not null default 0,
  failure_details text,
  meta jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index if not exists production_entries_production_date_idx
  on public.production_entries (production_date desc);
create index if not exists production_entries_shift_idx
  on public.production_entries (shift);
create index if not exists production_entries_machine_idx
  on public.production_entries (machine_id);
create index if not exists production_entries_supervisor_idx
  on public.production_entries (supervisor_id);
create index if not exists production_entries_part_idx
  on public.production_entries (part_id);

create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.employees
  where auth_user_id = auth.uid()
    and active = true
  limit 1;
$$;

create or replace function public.current_employee_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text
  from public.employees
  where auth_user_id = auth.uid()
    and active = true
  limit 1;
$$;

create or replace function public.is_admin_or_service()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_employee_role() = 'admin' or public.request_role() = 'service_role';
$$;

create or replace function public.is_manager_or_admin_or_service()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_employee_role() in ('manager', 'admin')
    or public.request_role() = 'service_role';
$$;

create or replace function public.compute_entry_metrics()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.actual_runtime_hours > new.planned_runtime_hours then
    raise exception 'Actual runtime cannot exceed planned runtime';
  end if;

  if new.rejection_qty > new.actual_qty then
    raise exception 'Rejected quantity cannot exceed actual quantity';
  end if;

  new.downtime_hours := greatest(new.planned_runtime_hours - new.actual_runtime_hours, 0);
  if new.downtime_hours = 0 then
    new.downtime_reason_id := null;
  end if;

  if new.rejection_qty = 0 then
    new.rejection_reason_id := null;
  end if;

  new.good_qty := greatest(new.actual_qty - new.rejection_qty, 0);
  new.availability := case
    when new.planned_runtime_hours > 0 then round(new.actual_runtime_hours / new.planned_runtime_hours, 4)
    else 0
  end;
  new.performance := case
    when new.target_qty > 0 then round(new.actual_qty / new.target_qty, 4)
    else 0
  end;
  new.quality := case
    when new.actual_qty > 0 then round(new.good_qty / new.actual_qty, 4)
    else 0
  end;
  new.oee := round((new.availability * new.performance * new.quality) * 100, 1);

  return new;
end;
$$;

drop trigger if exists machines_set_updated_at on public.machines;
create trigger machines_set_updated_at
before update on public.machines
for each row execute function public.set_updated_at();

drop trigger if exists parts_set_updated_at on public.parts;
create trigger parts_set_updated_at
before update on public.parts
for each row execute function public.set_updated_at();

drop trigger if exists operators_set_updated_at on public.operators;
create trigger operators_set_updated_at
before update on public.operators
for each row execute function public.set_updated_at();

drop trigger if exists downtime_reasons_set_updated_at on public.downtime_reasons;
create trigger downtime_reasons_set_updated_at
before update on public.downtime_reasons
for each row execute function public.set_updated_at();

drop trigger if exists rejection_reasons_set_updated_at on public.rejection_reasons;
create trigger rejection_reasons_set_updated_at
before update on public.rejection_reasons
for each row execute function public.set_updated_at();

drop trigger if exists employees_set_updated_at on public.employees;
create trigger employees_set_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

drop trigger if exists production_entries_set_updated_at on public.production_entries;
create trigger production_entries_set_updated_at
before update on public.production_entries
for each row execute function public.set_updated_at();

drop trigger if exists production_entries_compute_metrics on public.production_entries;
create trigger production_entries_compute_metrics
before insert or update on public.production_entries
for each row execute function public.compute_entry_metrics();

drop trigger if exists report_recipients_set_updated_at on public.report_recipients;
create trigger report_recipients_set_updated_at
before update on public.report_recipients
for each row execute function public.set_updated_at();

alter table public.machines enable row level security;
alter table public.parts enable row level security;
alter table public.operators enable row level security;
alter table public.downtime_reasons enable row level security;
alter table public.rejection_reasons enable row level security;
alter table public.employees enable row level security;
alter table public.production_entries enable row level security;
alter table public.report_recipients enable row level security;
alter table public.report_runs enable row level security;

drop policy if exists master_select_machines on public.machines;
create policy master_select_machines on public.machines
for select using (public.request_role() in ('authenticated', 'service_role'));
drop policy if exists master_admin_machines on public.machines;
create policy master_admin_machines on public.machines
for all using (public.is_admin_or_service()) with check (public.is_admin_or_service());

drop policy if exists master_select_parts on public.parts;
create policy master_select_parts on public.parts
for select using (public.request_role() in ('authenticated', 'service_role'));
drop policy if exists master_admin_parts on public.parts;
create policy master_admin_parts on public.parts
for all using (public.is_admin_or_service()) with check (public.is_admin_or_service());

drop policy if exists master_select_operators on public.operators;
create policy master_select_operators on public.operators
for select using (public.request_role() in ('authenticated', 'service_role'));
drop policy if exists master_admin_operators on public.operators;
create policy master_admin_operators on public.operators
for all using (public.is_admin_or_service()) with check (public.is_admin_or_service());

drop policy if exists master_select_downtime on public.downtime_reasons;
create policy master_select_downtime on public.downtime_reasons
for select using (public.request_role() in ('authenticated', 'service_role'));
drop policy if exists master_admin_downtime on public.downtime_reasons;
create policy master_admin_downtime on public.downtime_reasons
for all using (public.is_admin_or_service()) with check (public.is_admin_or_service());

drop policy if exists master_select_rejections on public.rejection_reasons;
create policy master_select_rejections on public.rejection_reasons
for select using (public.request_role() in ('authenticated', 'service_role'));
drop policy if exists master_admin_rejections on public.rejection_reasons;
create policy master_admin_rejections on public.rejection_reasons
for all using (public.is_admin_or_service()) with check (public.is_admin_or_service());

drop policy if exists employee_self_select on public.employees;
create policy employee_self_select on public.employees
for select using (auth.uid() = auth_user_id);
drop policy if exists employee_admin_select on public.employees;
create policy employee_admin_select on public.employees
for select using (public.is_admin_or_service());
drop policy if exists employee_admin_manage on public.employees;
create policy employee_admin_manage on public.employees
for all using (public.is_admin_or_service()) with check (public.is_admin_or_service());

drop policy if exists production_entry_select on public.production_entries;
create policy production_entry_select on public.production_entries
for select using (
  public.is_manager_or_admin_or_service()
  or created_by = public.current_employee_id()
);

drop policy if exists production_entry_insert on public.production_entries;
create policy production_entry_insert on public.production_entries
for insert with check (
  created_by = public.current_employee_id()
  and (
    public.current_employee_role() in ('manager', 'admin')
    or supervisor_id = public.current_employee_id()
  )
);

drop policy if exists report_recipients_admin on public.report_recipients;
create policy report_recipients_admin on public.report_recipients
for all using (public.is_admin_or_service()) with check (public.is_admin_or_service());

drop policy if exists report_runs_admin_select on public.report_runs;
create policy report_runs_admin_select on public.report_runs
for select using (public.is_admin_or_service());

create or replace view public.production_entry_feed
with (security_invoker = true)
as
select
  pe.id,
  pe.production_date,
  pe.shift,
  pe.supervisor_id,
  e.full_name as supervisor_name,
  pe.machine_id,
  m.name as machine_name,
  pe.part_id,
  p.name as part_name,
  pe.operator_id,
  o.name as operator_name,
  pe.planned_runtime_hours,
  pe.actual_runtime_hours,
  pe.downtime_hours,
  dr.name as downtime_reason_name,
  pe.target_qty,
  pe.actual_qty,
  pe.rejection_qty,
  rr.name as rejection_reason_name,
  pe.good_qty,
  pe.availability,
  pe.performance,
  pe.quality,
  pe.oee,
  pe.remarks,
  pe.created_by,
  pe.created_at,
  pe.updated_at
from public.production_entries pe
join public.employees e on e.id = pe.supervisor_id
join public.machines m on m.id = pe.machine_id
join public.parts p on p.id = pe.part_id
join public.operators o on o.id = pe.operator_id
left join public.downtime_reasons dr on dr.id = pe.downtime_reason_id
left join public.rejection_reasons rr on rr.id = pe.rejection_reason_id;

create or replace function public.get_master_data()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'supervisors', coalesce(
      (select jsonb_agg(jsonb_build_object('id', id, 'label', full_name, 'meta', employee_id) order by full_name)
       from public.employees
       where role = 'supervisor' and active = true),
      '[]'::jsonb
    ),
    'machines', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'label', name) order by name) from public.machines where active = true), '[]'::jsonb),
    'parts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'label', name) order by name) from public.parts where active = true), '[]'::jsonb),
    'operators', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'label', name) order by name) from public.operators where active = true), '[]'::jsonb),
    'downtimeReasons', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'label', name) order by name) from public.downtime_reasons where active = true), '[]'::jsonb),
    'rejectionReasons', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'label', name) order by name) from public.rejection_reasons where active = true), '[]'::jsonb)
  );
$$;

create or replace function public.list_employees_admin()
returns table (
  id uuid,
  employee_id text,
  full_name text,
  role text,
  active boolean,
  pin_last_reset_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_or_service() then
    raise exception 'forbidden';
  end if;

  return query
  select e.id, e.employee_id, e.full_name, e.role::text, e.active, e.pin_last_reset_at, e.created_at
  from public.employees e
  order by e.full_name;
end;
$$;

create or replace function public.delete_my_entry(p_entry_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
begin
  delete from public.production_entries
  where id = p_entry_id
    and created_by = public.current_employee_id()
    and production_date = (timezone('Asia/Kolkata', now()))::date;

  get diagnostics affected_rows = row_count;

  if affected_rows = 0 then
    raise exception 'Entry can only be deleted by the creator on the same production date';
  end if;

  return true;
end;
$$;

create or replace function public.get_dashboard_snapshot(
  p_start_date date,
  p_end_date date,
  p_shift text default null,
  p_machine_id uuid default null,
  p_supervisor_id uuid default null,
  p_part_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  if not public.is_manager_or_admin_or_service() then
    raise exception 'forbidden';
  end if;

  with filtered as (
    select *
    from public.production_entry_feed
    where production_date between p_start_date and p_end_date
      and (p_shift is null or shift::text = p_shift)
      and (p_machine_id is null or machine_id = p_machine_id)
      and (p_supervisor_id is null or supervisor_id = p_supervisor_id)
      and (p_part_id is null or part_id = p_part_id)
  ),
  totals as (
    select
      coalesce(sum(actual_qty), 0) as total_production,
      coalesce(sum(good_qty), 0) as good_output,
      coalesce(sum(rejection_qty), 0) as rejection_qty,
      coalesce(sum(planned_runtime_hours), 0) as planned_runtime,
      coalesce(sum(actual_runtime_hours), 0) as actual_runtime,
      coalesce(sum(target_qty), 0) as target_qty,
      max(updated_at) as last_sync_at
    from filtered
  ),
  top_supervisor as (
    select
      supervisor_name as name,
      round((case when sum(planned_runtime_hours) > 0 then sum(actual_runtime_hours) / sum(planned_runtime_hours) else 0 end) *
            (case when sum(target_qty) > 0 then sum(actual_qty) / sum(target_qty) else 0 end) *
            (case when sum(actual_qty) > 0 then sum(good_qty) / sum(actual_qty) else 0 end) * 100, 1) as oee,
      sum(good_qty) as good_output
    from filtered
    group by supervisor_name
    having count(*) >= 3
    order by oee desc, good_output desc
    limit 1
  ),
  top_item as (
    select part_name as name, sum(good_qty) as good_qty
    from filtered
    group by part_name
    order by good_qty desc
    limit 1
  ),
  rejected_item as (
    select part_name as name, sum(rejection_qty) as rejection_qty
    from filtered
    group by part_name
    order by rejection_qty desc
    limit 1
  ),
  machine_board as (
    select
      machine_name as name,
      round((case when sum(planned_runtime_hours) > 0 then sum(actual_runtime_hours) / sum(planned_runtime_hours) else 0 end) *
            (case when sum(target_qty) > 0 then sum(actual_qty) / sum(target_qty) else 0 end) *
            (case when sum(actual_qty) > 0 then sum(good_qty) / sum(actual_qty) else 0 end) * 100, 1) as oee,
      concat(sum(good_qty)::text, ' good · ', sum(rejection_qty)::text, ' reject · ', sum(downtime_hours)::text, 'h DT') as detail
    from filtered
    group by machine_name
    order by oee desc, machine_name
    limit 6
  ),
  recent_entries as (
    select
      machine_name as machine,
      part_name as part,
      actual_qty as actual_qty,
      concat(supervisor_name, ' · ', shift::text) as detail
    from filtered
    order by created_at desc
    limit 6
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'totalProduction', totals.total_production,
      'overallOee', round((case when totals.planned_runtime > 0 then totals.actual_runtime / totals.planned_runtime else 0 end) *
                          (case when totals.target_qty > 0 then totals.total_production / totals.target_qty else 0 end) *
                          (case when totals.total_production > 0 then totals.good_output / totals.total_production else 0 end) * 100, 1),
      'goodOutput', totals.good_output,
      'rejectionRate', round(case when totals.total_production > 0 then (totals.rejection_qty / totals.total_production) * 100 else 0 end, 1),
      'topSupervisor', (
        select jsonb_build_object(
          'name', name,
          'oee', oee,
          'goodOutput', good_output
        )
        from top_supervisor
      ),
      'topItemProduced', (select jsonb_build_object('name', name, 'goodQty', good_qty) from top_item),
      'mostRejectedItem', (select jsonb_build_object('name', name, 'rejectionQty', rejection_qty) from rejected_item),
      'lastSyncAt', totals.last_sync_at
    ),
    'machineLeaderboard', coalesce((select jsonb_agg(to_jsonb(machine_board)) from machine_board), '[]'::jsonb),
    'recentEntries', coalesce((select jsonb_agg(jsonb_build_object('machine', machine, 'part', part, 'actualQty', actual_qty, 'detail', detail)) from recent_entries), '[]'::jsonb)
  )
  into payload
  from totals;

  return payload;
end;
$$;

create or replace function public.get_analysis_bundle(
  p_start_date date,
  p_end_date date,
  p_shift text default null,
  p_machine_id uuid default null,
  p_supervisor_id uuid default null,
  p_part_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  if not public.is_manager_or_admin_or_service() then
    raise exception 'forbidden';
  end if;

  with filtered as (
    select *
    from public.production_entry_feed
    where production_date between p_start_date and p_end_date
      and (p_shift is null or shift::text = p_shift)
      and (p_machine_id is null or machine_id = p_machine_id)
      and (p_supervisor_id is null or supervisor_id = p_supervisor_id)
      and (p_part_id is null or part_id = p_part_id)
  ),
  totals as (
    select
      count(*) as entry_count,
      coalesce(sum(good_qty), 0) as total_good_qty,
      coalesce(sum(downtime_hours), 0) as total_downtime_hours,
      coalesce(sum(planned_runtime_hours), 0) as planned_runtime,
      coalesce(sum(actual_runtime_hours), 0) as actual_runtime,
      coalesce(sum(target_qty), 0) as target_qty,
      coalesce(sum(actual_qty), 0) as actual_qty
    from filtered
  ),
  trend_rows as (
    select
      production_date as date,
      round((case when sum(planned_runtime_hours) > 0 then sum(actual_runtime_hours) / sum(planned_runtime_hours) else 0 end) *
            (case when sum(target_qty) > 0 then sum(actual_qty) / sum(target_qty) else 0 end) *
            (case when sum(actual_qty) > 0 then sum(good_qty) / sum(actual_qty) else 0 end) * 100, 1) as oee,
      sum(actual_qty) as production,
      round(case when sum(actual_qty) > 0 then (sum(rejection_qty) / sum(actual_qty)) * 100 else 0 end, 1) as rejection_rate
    from filtered
    group by production_date
    order by production_date
  ),
  downtime_pareto as (
    select
      coalesce(downtime_reason_name, 'Unspecified') as label,
      round(sum(downtime_hours), 1) as value,
      round(sum(sum(downtime_hours)) over (order by sum(downtime_hours) desc) /
        nullif(sum(sum(downtime_hours)) over (), 0) * 100, 1) as cumulative_share
    from filtered
    where downtime_hours > 0
    group by coalesce(downtime_reason_name, 'Unspecified')
    order by value desc
  ),
  rejection_pareto as (
    select
      coalesce(rejection_reason_name, 'Unspecified') as label,
      round(sum(rejection_qty), 1) as value,
      round(sum(sum(rejection_qty)) over (order by sum(rejection_qty) desc) /
        nullif(sum(sum(rejection_qty)) over (), 0) * 100, 1) as cumulative_share
    from filtered
    where rejection_qty > 0
    group by coalesce(rejection_reason_name, 'Unspecified')
    order by value desc
  ),
  machine_league as (
    select machine_name as name, count(*) as entry_count, sum(actual_qty) as actual_qty, sum(good_qty) as good_qty, sum(rejection_qty) as rejection_qty,
      sum(downtime_hours) as downtime_hours,
      round(case when sum(planned_runtime_hours) > 0 then sum(actual_runtime_hours) / sum(planned_runtime_hours) * 100 else 0 end, 1) as availability,
      round(case when sum(target_qty) > 0 then sum(actual_qty) / sum(target_qty) * 100 else 0 end, 1) as performance,
      round(case when sum(actual_qty) > 0 then sum(good_qty) / sum(actual_qty) * 100 else 0 end, 1) as quality,
      round((case when sum(planned_runtime_hours) > 0 then sum(actual_runtime_hours) / sum(planned_runtime_hours) else 0 end) *
            (case when sum(target_qty) > 0 then sum(actual_qty) / sum(target_qty) else 0 end) *
            (case when sum(actual_qty) > 0 then sum(good_qty) / sum(actual_qty) else 0 end) * 100, 1) as oee
    from filtered group by machine_name order by oee desc, name
  ),
  supervisor_league as (
    select supervisor_name as name, count(*) as entry_count, sum(actual_qty) as actual_qty, sum(good_qty) as good_qty, sum(rejection_qty) as rejection_qty,
      sum(downtime_hours) as downtime_hours,
      round(case when sum(planned_runtime_hours) > 0 then sum(actual_runtime_hours) / sum(planned_runtime_hours) * 100 else 0 end, 1) as availability,
      round(case when sum(target_qty) > 0 then sum(actual_qty) / sum(target_qty) * 100 else 0 end, 1) as performance,
      round(case when sum(actual_qty) > 0 then sum(good_qty) / sum(actual_qty) * 100 else 0 end, 1) as quality,
      round((case when sum(planned_runtime_hours) > 0 then sum(actual_runtime_hours) / sum(planned_runtime_hours) else 0 end) *
            (case when sum(target_qty) > 0 then sum(actual_qty) / sum(target_qty) else 0 end) *
            (case when sum(actual_qty) > 0 then sum(good_qty) / sum(actual_qty) else 0 end) * 100, 1) as oee
    from filtered group by supervisor_name order by oee desc, name
  ),
  part_league as (
    select part_name as name, count(*) as entry_count, sum(actual_qty) as actual_qty, sum(good_qty) as good_qty, sum(rejection_qty) as rejection_qty,
      sum(downtime_hours) as downtime_hours,
      round(case when sum(planned_runtime_hours) > 0 then sum(actual_runtime_hours) / sum(planned_runtime_hours) * 100 else 0 end, 1) as availability,
      round(case when sum(target_qty) > 0 then sum(actual_qty) / sum(target_qty) * 100 else 0 end, 1) as performance,
      round(case when sum(actual_qty) > 0 then sum(good_qty) / sum(actual_qty) * 100 else 0 end, 1) as quality,
      round((case when sum(planned_runtime_hours) > 0 then sum(actual_runtime_hours) / sum(planned_runtime_hours) else 0 end) *
            (case when sum(target_qty) > 0 then sum(actual_qty) / sum(target_qty) else 0 end) *
            (case when sum(actual_qty) > 0 then sum(good_qty) / sum(actual_qty) else 0 end) * 100, 1) as oee
    from filtered group by part_name order by oee desc, name
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'entryCount', totals.entry_count,
      'avgOee', round((case when totals.planned_runtime > 0 then totals.actual_runtime / totals.planned_runtime else 0 end) *
                      (case when totals.target_qty > 0 then totals.actual_qty / totals.target_qty else 0 end) *
                      (case when totals.actual_qty > 0 then totals.total_good_qty / totals.actual_qty else 0 end) * 100, 1),
      'totalDowntimeHours', totals.total_downtime_hours,
      'totalGoodQty', totals.total_good_qty
    ),
    'trends', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'oee', oee, 'production', production, 'rejectionRate', rejection_rate)) from trend_rows), '[]'::jsonb),
    'downtimePareto', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value, 'cumulativeShare', cumulative_share)) from downtime_pareto), '[]'::jsonb),
    'rejectionPareto', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value, 'cumulativeShare', cumulative_share)) from rejection_pareto), '[]'::jsonb),
    'machineLeague', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'entryCount', entry_count, 'actualQty', actual_qty, 'goodQty', good_qty, 'rejectionQty', rejection_qty, 'downtimeHours', downtime_hours, 'availability', availability, 'performance', performance, 'quality', quality, 'oee', oee)) from machine_league), '[]'::jsonb),
    'supervisorLeague', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'entryCount', entry_count, 'actualQty', actual_qty, 'goodQty', good_qty, 'rejectionQty', rejection_qty, 'downtimeHours', downtime_hours, 'availability', availability, 'performance', performance, 'quality', quality, 'oee', oee)) from supervisor_league), '[]'::jsonb),
    'partLeague', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'entryCount', entry_count, 'actualQty', actual_qty, 'goodQty', good_qty, 'rejectionQty', rejection_qty, 'downtimeHours', downtime_hours, 'availability', availability, 'performance', performance, 'quality', quality, 'oee', oee)) from part_league), '[]'::jsonb)
  )
  into payload
  from totals;

  return payload;
end;
$$;

grant execute on function public.get_master_data() to authenticated;
grant execute on function public.list_employees_admin() to authenticated;
grant execute on function public.delete_my_entry(uuid) to authenticated;
grant execute on function public.get_dashboard_snapshot(date, date, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.get_analysis_bundle(date, date, text, uuid, uuid, uuid) to authenticated;
grant select on public.production_entry_feed to authenticated;
