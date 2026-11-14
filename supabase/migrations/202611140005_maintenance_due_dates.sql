-- Keep due dates finite even when database functions are called directly.
alter table public.maintenance_tasks add constraint maintenance_due_at_finite
 check (due_at is null or isfinite(due_at));

create function public.set_maintenance_due_at(p_task_id uuid, p_due_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare v_task public.maintenance_tasks%rowtype; v_user uuid := auth.uid(); begin
 select * into v_task from public.maintenance_tasks where id=p_task_id for update;
 if not found or not accraflow_private.has_role(v_task.organization_id,array['operator','admin']::public.member_role[]) then
  raise exception 'not found or not authorized' using errcode='42501';
 end if;
 if v_task.status not in ('open','in_progress') then raise exception 'task is closed' using errcode='22023'; end if;
 if p_due_at is not null and not isfinite(p_due_at) then raise exception 'invalid due date' using errcode='22023'; end if;
 if v_task.due_at is not distinct from p_due_at then return; end if;
 update public.maintenance_tasks set due_at=p_due_at,updated_at=now() where id=p_task_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_task.organization_id,v_user,'maintenance.due_date_changed','maintenance_task',p_task_id,
   jsonb_build_object('previous_due_at',v_task.due_at,'due_at',p_due_at));
end $$;
revoke all on function public.set_maintenance_due_at(uuid,timestamptz) from public, anon;
grant execute on function public.set_maintenance_due_at(uuid,timestamptz) to authenticated;
