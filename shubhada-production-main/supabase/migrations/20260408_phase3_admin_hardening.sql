drop policy if exists master_admin_machines on public.machines;
drop policy if exists master_admin_insert_machines on public.machines;
drop policy if exists master_admin_update_machines on public.machines;
create policy master_admin_insert_machines on public.machines
for insert with check (public.is_admin_or_service());
create policy master_admin_update_machines on public.machines
for update using (public.is_admin_or_service()) with check (public.is_admin_or_service());

drop policy if exists master_admin_parts on public.parts;
drop policy if exists master_admin_insert_parts on public.parts;
drop policy if exists master_admin_update_parts on public.parts;
create policy master_admin_insert_parts on public.parts
for insert with check (public.is_admin_or_service());
create policy master_admin_update_parts on public.parts
for update using (public.is_admin_or_service()) with check (public.is_admin_or_service());

drop policy if exists master_admin_operators on public.operators;
drop policy if exists master_admin_insert_operators on public.operators;
drop policy if exists master_admin_update_operators on public.operators;
create policy master_admin_insert_operators on public.operators
for insert with check (public.is_admin_or_service());
create policy master_admin_update_operators on public.operators
for update using (public.is_admin_or_service()) with check (public.is_admin_or_service());

drop policy if exists master_admin_downtime on public.downtime_reasons;
drop policy if exists master_admin_insert_downtime on public.downtime_reasons;
drop policy if exists master_admin_update_downtime on public.downtime_reasons;
create policy master_admin_insert_downtime on public.downtime_reasons
for insert with check (public.is_admin_or_service());
create policy master_admin_update_downtime on public.downtime_reasons
for update using (public.is_admin_or_service()) with check (public.is_admin_or_service());

drop policy if exists master_admin_rejections on public.rejection_reasons;
drop policy if exists master_admin_insert_rejections on public.rejection_reasons;
drop policy if exists master_admin_update_rejections on public.rejection_reasons;
create policy master_admin_insert_rejections on public.rejection_reasons
for insert with check (public.is_admin_or_service());
create policy master_admin_update_rejections on public.rejection_reasons
for update using (public.is_admin_or_service()) with check (public.is_admin_or_service());
