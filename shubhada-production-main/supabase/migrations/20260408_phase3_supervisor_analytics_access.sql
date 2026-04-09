create or replace function public.can_access_analytics()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_employee_id() is not null
    or public.request_role() = 'service_role';
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
  if not public.can_access_analytics() then
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
  if not public.can_access_analytics() then
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

grant execute on function public.can_access_analytics() to authenticated;
