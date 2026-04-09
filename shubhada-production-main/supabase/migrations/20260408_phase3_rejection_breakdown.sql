create table if not exists public.rejection_details (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.production_entries(id) on delete cascade,
  rejection_reason text not null check (char_length(trim(rejection_reason)) > 0),
  quantity integer not null check (quantity > 0),
  notes text,
  sort_order integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists rejection_details_entry_idx
  on public.rejection_details (entry_id, sort_order, created_at);

drop trigger if exists rejection_details_set_updated_at on public.rejection_details;
create trigger rejection_details_set_updated_at
before update on public.rejection_details
for each row execute function public.set_updated_at();

alter table public.rejection_details enable row level security;

drop policy if exists rejection_details_select on public.rejection_details;
create policy rejection_details_select on public.rejection_details
for select using (
  exists (
    select 1
    from public.production_entries pe
    where pe.id = rejection_details.entry_id
      and (
        public.is_manager_or_admin_or_service()
        or pe.created_by = public.current_employee_id()
      )
  )
);

create or replace function public.save_production_entry(
  p_entry jsonb,
  p_rejection_details jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_employee_id();
  v_actor_role text := public.current_employee_role();
  v_entry_id uuid := nullif(coalesce(p_entry ->> 'id', ''), '')::uuid;
  v_existing public.production_entries%rowtype;
  v_now_ist date := (timezone('Asia/Kolkata', now()))::date;
  v_rejection_details jsonb := coalesce(p_rejection_details, '[]'::jsonb);
  v_rejection_total integer := 0;
  v_declared_rejection numeric(12,2) := coalesce((p_entry ->> 'rejection_qty')::numeric, 0);
  v_dominant_reason text;
  v_dominant_reason_id uuid;
  v_saved public.production_entries%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Unauthorized request.';
  end if;

  if jsonb_typeof(v_rejection_details) <> 'array' then
    raise exception 'Rejection details must be an array.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_rejection_details) as detail(value)
    where coalesce(trim(detail.value ->> 'rejection_reason'), '') = ''
      or coalesce((detail.value ->> 'quantity')::integer, 0) <= 0
  ) then
    raise exception 'Each rejection row needs a reason and a quantity greater than zero.';
  end if;

  select coalesce(sum((detail.value ->> 'quantity')::integer), 0)
  into v_rejection_total
  from jsonb_array_elements(v_rejection_details) as detail(value);

  if v_declared_rejection = 0 and jsonb_array_length(v_rejection_details) > 0 then
    raise exception 'Rejection details are only allowed when rejected quantity is greater than zero.';
  end if;

  if v_declared_rejection > 0 and v_rejection_total <> v_declared_rejection::integer then
    raise exception 'Rejected quantity must match the rejection breakdown total.';
  end if;

  if v_entry_id is not null then
    select *
    into v_existing
    from public.production_entries
    where id = v_entry_id;

    if not found then
      raise exception 'Entry not found.';
    end if;

    if v_existing.created_by <> v_actor_id then
      raise exception 'Only the creator can edit this entry.';
    end if;

    if v_existing.production_date <> v_now_ist then
      raise exception 'Entry can only be edited on the same production date.';
    end if;
  end if;

  if v_actor_role not in ('manager', 'admin')
    and nullif(coalesce(p_entry ->> 'supervisor_id', ''), '')::uuid <> v_actor_id then
    raise exception 'Supervisor entries can only be saved under your own name.';
  end if;

  select detail.value ->> 'rejection_reason'
  into v_dominant_reason
  from jsonb_array_elements(v_rejection_details) with ordinality as detail(value, ordinality)
  order by coalesce((detail.value ->> 'quantity')::integer, 0) desc, detail.ordinality asc
  limit 1;

  if coalesce(v_dominant_reason, '') <> '' then
    select id
    into v_dominant_reason_id
    from public.rejection_reasons
    where lower(name) = lower(v_dominant_reason)
    limit 1;
  else
    v_dominant_reason_id := null;
  end if;

  if v_entry_id is null then
    insert into public.production_entries (
      production_date,
      shift,
      supervisor_id,
      machine_id,
      part_id,
      operator_id,
      planned_runtime_hours,
      actual_runtime_hours,
      downtime_reason_id,
      target_qty,
      actual_qty,
      rejection_qty,
      rejection_reason_id,
      remarks,
      created_by
    )
    values (
      (p_entry ->> 'production_date')::date,
      (p_entry ->> 'shift')::public.shift_kind,
      (p_entry ->> 'supervisor_id')::uuid,
      (p_entry ->> 'machine_id')::uuid,
      (p_entry ->> 'part_id')::uuid,
      (p_entry ->> 'operator_id')::uuid,
      (p_entry ->> 'planned_runtime_hours')::numeric,
      (p_entry ->> 'actual_runtime_hours')::numeric,
      nullif(coalesce(p_entry ->> 'downtime_reason_id', ''), '')::uuid,
      (p_entry ->> 'target_qty')::numeric,
      (p_entry ->> 'actual_qty')::numeric,
      v_declared_rejection,
      case when v_declared_rejection > 0 then v_dominant_reason_id else null end,
      nullif(trim(coalesce(p_entry ->> 'remarks', '')), ''),
      v_actor_id
    )
    returning *
    into v_saved;
  else
    update public.production_entries
    set
      production_date = (p_entry ->> 'production_date')::date,
      shift = (p_entry ->> 'shift')::public.shift_kind,
      supervisor_id = (p_entry ->> 'supervisor_id')::uuid,
      machine_id = (p_entry ->> 'machine_id')::uuid,
      part_id = (p_entry ->> 'part_id')::uuid,
      operator_id = (p_entry ->> 'operator_id')::uuid,
      planned_runtime_hours = (p_entry ->> 'planned_runtime_hours')::numeric,
      actual_runtime_hours = (p_entry ->> 'actual_runtime_hours')::numeric,
      downtime_reason_id = nullif(coalesce(p_entry ->> 'downtime_reason_id', ''), '')::uuid,
      target_qty = (p_entry ->> 'target_qty')::numeric,
      actual_qty = (p_entry ->> 'actual_qty')::numeric,
      rejection_qty = v_declared_rejection,
      rejection_reason_id = case when v_declared_rejection > 0 then v_dominant_reason_id else null end,
      remarks = nullif(trim(coalesce(p_entry ->> 'remarks', '')), '')
    where id = v_entry_id
    returning *
    into v_saved;

    delete from public.rejection_details
    where entry_id = v_entry_id;
  end if;

  if v_declared_rejection > 0 then
    insert into public.rejection_details (
      entry_id,
      rejection_reason,
      quantity,
      notes,
      sort_order
    )
    select
      v_saved.id,
      trim(detail.value ->> 'rejection_reason'),
      (detail.value ->> 'quantity')::integer,
      nullif(trim(coalesce(detail.value ->> 'notes', '')), ''),
      coalesce((detail.value ->> 'sort_order')::integer, ordinality::integer)
    from jsonb_array_elements(v_rejection_details) with ordinality as detail(value, ordinality);
  end if;

  return jsonb_build_object(
    'id', v_saved.id,
    'oee', v_saved.oee,
    'good_qty', v_saved.good_qty,
    'production_date', v_saved.production_date,
    'created_at', v_saved.created_at
  );
end;
$$;

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
  pe.updated_at,
  pe.downtime_reason_id,
  pe.rejection_reason_id,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', rd.id,
          'rejectionReason', rd.rejection_reason,
          'quantity', rd.quantity,
          'notes', rd.notes,
          'sortOrder', rd.sort_order
        )
        order by rd.sort_order, rd.created_at
      )
      from public.rejection_details rd
      where rd.entry_id = pe.id
    ),
    '[]'::jsonb
  ) as rejection_breakdown
from public.production_entries pe
join public.employees e on e.id = pe.supervisor_id
join public.machines m on m.id = pe.machine_id
join public.parts p on p.id = pe.part_id
join public.operators o on o.id = pe.operator_id
left join public.downtime_reasons dr on dr.id = pe.downtime_reason_id
left join public.rejection_reasons rr on rr.id = pe.rejection_reason_id;

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
  filtered_rejections as (
    select rd.rejection_reason as label, rd.quantity::numeric as quantity
    from public.rejection_details rd
    join filtered f on f.id = rd.entry_id

    union all

    select coalesce(f.rejection_reason_name, 'Unspecified') as label, f.rejection_qty as quantity
    from filtered f
    where f.rejection_qty > 0
      and not exists (
        select 1
        from public.rejection_details rd
        where rd.entry_id = f.id
      )
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
      label,
      round(sum(quantity), 1) as value,
      round(sum(sum(quantity)) over (order by sum(quantity) desc) /
        nullif(sum(sum(quantity)) over (), 0) * 100, 1) as cumulative_share
    from filtered_rejections
    group by label
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

grant execute on function public.save_production_entry(jsonb, jsonb) to authenticated;
grant select on public.rejection_details to authenticated;
