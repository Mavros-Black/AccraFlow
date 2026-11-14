-- Reporters may correct or withdraw their own reports until review begins.
-- Locking the incident serializes these changes with moderation.
create function public.edit_submitted_incident(
 p_incident_id uuid, p_title text, p_description text, p_category public.incident_category,
 p_longitude double precision, p_latitude double precision
) returns void language plpgsql security definer set search_path = '' as $$
declare v_incident public.incidents%rowtype; v_user uuid := auth.uid(); begin
 select * into v_incident from public.incidents where id=p_incident_id for update;
 if not found or v_incident.reported_by is distinct from v_user or not accraflow_private.has_role(v_incident.organization_id,array['resident','moderator','operator','admin']::public.member_role[]) then
  raise exception 'not found or not authorized' using errcode='42501';
 end if;
 if v_incident.status <> 'submitted' then raise exception 'report is no longer editable' using errcode='22023'; end if;
 if p_longitude is null or p_latitude is null or p_longitude not between -0.45 and 0.1 or p_latitude not between 5.4 and 5.85 then raise exception 'coordinates out of bounds' using errcode='22023'; end if;
 update public.incidents set title=trim(p_title),description=trim(p_description),category=p_category,
  location=extensions.st_setsrid(extensions.st_makepoint(p_longitude,p_latitude),4326),updated_at=now() where id=p_incident_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id)
  values(v_incident.organization_id,v_user,'incident.edited','incident',p_incident_id);
end $$;
create function public.withdraw_submitted_incident(p_incident_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_incident public.incidents%rowtype; v_user uuid := auth.uid(); begin
 select * into v_incident from public.incidents where id=p_incident_id for update;
 if not found or v_incident.reported_by is distinct from v_user or not accraflow_private.has_role(v_incident.organization_id,array['resident','moderator','operator','admin']::public.member_role[]) then
  raise exception 'not found or not authorized' using errcode='42501';
 end if;
 if v_incident.status <> 'submitted' then raise exception 'report can no longer be withdrawn' using errcode='22023'; end if;
 update public.incidents set status='withdrawn',updated_at=now() where id=p_incident_id;
 insert into public.incident_status_history(organization_id,incident_id,previous_status,new_status,actor_id)
  values(v_incident.organization_id,p_incident_id,'submitted','withdrawn',v_user);
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id)
  values(v_incident.organization_id,v_user,'incident.withdrawn','incident',p_incident_id);
end $$;
revoke all on function public.edit_submitted_incident(uuid,text,text,public.incident_category,double precision,double precision) from public, anon;
revoke all on function public.withdraw_submitted_incident(uuid) from public, anon;
grant execute on function public.edit_submitted_incident(uuid,text,text,public.incident_category,double precision,double precision) to authenticated;
grant execute on function public.withdraw_submitted_incident(uuid) to authenticated;
