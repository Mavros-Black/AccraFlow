-- AccraFlow Phase 2 foundation for a Supabase-managed PostgreSQL database.
-- No demo fixtures are inserted here. Apply only to a project you control.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;
create schema if not exists accraflow_private;
revoke all on schema accraflow_private from public, anon, authenticated;
grant usage on schema accraflow_private to authenticated;

create type public.member_role as enum ('resident', 'moderator', 'operator', 'admin');
create type public.incident_status as enum ('submitted', 'under_review', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected');
create type public.incident_category as enum ('blockage', 'flooding', 'debris', 'damaged_culvert', 'other');
create type public.task_status as enum ('open', 'in_progress', 'completed', 'cancelled');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) between 2 and 160),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role public.member_role not null, is_active boolean not null default true, created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id, organization_id);

-- Authentication creates a profile, never an organization membership or role.
create function accraflow_private.create_profile_for_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,display_name) values(new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'display_name'),120),''),'New user'));
 return new;
end $$;
revoke all on function accraflow_private.create_profile_for_auth_user() from public, anon, authenticated;
create trigger accraflow_auth_user_created after insert on auth.users for each row execute function accraflow_private.create_profile_for_auth_user();

-- SECURITY DEFINER helpers only answer questions about the caller, never an arbitrary user.
create function accraflow_private.has_role(p_org uuid, p_roles public.member_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.memberships m where m.organization_id = p_org
      and m.user_id = (select auth.uid()) and m.is_active and m.role = any(p_roles)
  );
$$;
revoke all on function accraflow_private.has_role(uuid, public.member_role[]) from public, anon;
grant execute on function accraflow_private.has_role(uuid, public.member_role[]) to authenticated;

create table public.data_sources (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null, source_url text, collected_at timestamptz, license text, notes text,
 verification_status text not null default 'unverified' check (verification_status in ('unverified','approved','rejected')),
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
 unique (id, organization_id)
);
create table public.catchments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null, geometry extensions.geometry(MultiPolygon,4326), source_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id, organization_id),
 foreign key (source_id, organization_id) references public.data_sources(id, organization_id),
 check (geometry is null or extensions.st_isvalid(geometry))
);
create index catchments_geometry_gix on public.catchments using gist(geometry);
create table public.drainage_assets (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null, asset_type text not null, condition text, geometry extensions.geometry(Geometry,4326), source_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id, organization_id),
 foreign key (source_id, organization_id) references public.data_sources(id, organization_id),
 check (geometry is null or extensions.st_isvalid(geometry))
);
create index drainage_assets_geometry_gix on public.drainage_assets using gist(geometry);
create table public.drainage_segments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 asset_id uuid, catchment_id uuid, source_id uuid, geometry extensions.geometry(LineString,4326) not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id, organization_id),
 foreign key (asset_id, organization_id) references public.drainage_assets(id, organization_id),
 foreign key (catchment_id, organization_id) references public.catchments(id, organization_id),
 foreign key (source_id, organization_id) references public.data_sources(id, organization_id),
 check (extensions.st_isvalid(geometry) and not extensions.st_isempty(geometry))
);
create index drainage_segments_geometry_gix on public.drainage_segments using gist(geometry);
create table public.culverts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 asset_id uuid, source_id uuid, geometry extensions.geometry(Point,4326) not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id, organization_id),
 foreign key (asset_id, organization_id) references public.drainage_assets(id, organization_id),
 foreign key (source_id, organization_id) references public.data_sources(id, organization_id),
 check (not extensions.st_isempty(geometry))
);
create index culverts_geometry_gix on public.culverts using gist(geometry);

create table public.incidents (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 reported_by uuid not null references public.profiles(id), title text not null check(length(trim(title)) between 5 and 120),
 description text not null check(length(trim(description)) between 15 and 2000), category public.incident_category not null,
 status public.incident_status not null default 'submitted', location extensions.geometry(Point,4326) not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id, organization_id),
 foreign key (organization_id, reported_by) references public.memberships(organization_id, user_id),
 check (not extensions.st_isempty(location) and extensions.st_x(location) between -0.45 and 0.1 and extensions.st_y(location) between 5.4 and 5.85)
);
create index incidents_org_status_idx on public.incidents(organization_id, status, created_at desc);
create index incidents_location_gix on public.incidents using gist(location);
create table public.incident_status_history (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, incident_id uuid not null,
 previous_status public.incident_status, new_status public.incident_status not null, actor_id uuid not null references public.profiles(id),
 reason text, created_at timestamptz not null default now(),
 foreign key (incident_id, organization_id) references public.incidents(id, organization_id)
);
create index incident_history_idx on public.incident_status_history(incident_id, created_at);
create table public.incident_photos (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, incident_id uuid not null,
 object_path text not null unique, uploaded_by uuid not null references public.profiles(id),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 size_bytes integer not null check(size_bytes between 1 and 5242880), created_at timestamptz not null default now(),
 foreign key (incident_id, organization_id) references public.incidents(id, organization_id)
);
create table public.maintenance_tasks (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 incident_id uuid, asset_id uuid, title text not null check(length(trim(title)) between 5 and 160),
 priority public.task_priority not null default 'medium', status public.task_status not null default 'open',
 due_at timestamptz, completion_notes text, created_by uuid not null references public.profiles(id), completed_by uuid references public.profiles(id),
 completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id, organization_id),
 foreign key (incident_id, organization_id) references public.incidents(id, organization_id),
 foreign key (asset_id, organization_id) references public.drainage_assets(id, organization_id),
 check (incident_id is not null or asset_id is not null),
 check ((status = 'completed' and completed_at is not null and completed_by is not null and completion_notes is not null and length(trim(completion_notes)) >= 5)
     or (status <> 'completed' and completed_at is null and completed_by is null and completion_notes is null))
);
create index maintenance_org_status_idx on public.maintenance_tasks(organization_id, status, due_at);
create unique index maintenance_one_active_incident_idx on public.maintenance_tasks(organization_id, incident_id) where incident_id is not null and status in ('open','in_progress');
create table public.maintenance_assignments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, task_id uuid not null, assigned_user_id uuid not null,
 assigned_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 unique(task_id, assigned_user_id), foreign key (task_id, organization_id) references public.maintenance_tasks(id, organization_id),
 foreign key (organization_id, assigned_user_id) references public.memberships(organization_id, user_id)
);
create table public.rainfall_observations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 source_id uuid not null, observed_at timestamptz not null, rainfall_mm numeric not null check(rainfall_mm >= 0),
 duration_minutes integer not null check(duration_minutes > 0), location extensions.geometry(Point,4326), created_at timestamptz not null default now(),
 foreign key (source_id, organization_id) references public.data_sources(id, organization_id)
);
create index rainfall_location_gix on public.rainfall_observations using gist(location);
create table public.simulation_scenarios (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 catchment_id uuid, name text not null, inputs jsonb not null default '{}'::jsonb, created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), unique(id, organization_id),
 foreign key (catchment_id, organization_id) references public.catchments(id, organization_id)
);
create table public.simulation_runs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, scenario_id uuid not null,
 status text not null default 'not_started' check(status in ('not_started','queued','running','succeeded','failed')),
 model_version text, assumptions jsonb, input_provenance jsonb, uncertainty text, execution_log text,
 created_at timestamptz not null default now(), unique(id, organization_id),
 foreign key (scenario_id, organization_id) references public.simulation_scenarios(id, organization_id)
);
create table public.simulation_results (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, run_id uuid not null,
 result jsonb not null, validated boolean not null default false, created_at timestamptz not null default now(),
 foreign key (run_id, organization_id) references public.simulation_runs(id, organization_id)
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 actor_id uuid references public.profiles(id), action text not null, entity_type text not null, entity_id uuid not null,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs(organization_id, created_at desc);

-- Deny all direct writes by default. Authenticated users only read rows allowed by RLS;
-- mutations are performed through narrowly scoped RPCs below.
revoke all on public.organizations, public.profiles, public.memberships, public.data_sources, public.catchments,
 public.drainage_assets, public.drainage_segments, public.culverts, public.incidents, public.incident_status_history,
 public.incident_photos, public.maintenance_tasks, public.maintenance_assignments, public.rainfall_observations,
 public.simulation_scenarios, public.simulation_runs, public.simulation_results, public.audit_logs from anon, authenticated;
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
create policy organizations_read on public.organizations for select to authenticated using (accraflow_private.has_role(id, array['resident','moderator','operator','admin']::public.member_role[]));
create policy profiles_self_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy memberships_self_read on public.memberships for select to authenticated using (user_id = (select auth.uid()) and is_active);
grant select on public.organizations, public.profiles, public.memberships to authenticated;

do $$ declare t text; begin
  foreach t in array array['data_sources','catchments','drainage_assets','drainage_segments','culverts','maintenance_tasks','maintenance_assignments','rainfall_observations','simulation_scenarios','simulation_runs','simulation_results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy member_read on public.%I for select to authenticated using (accraflow_private.has_role(organization_id, array[''moderator'',''operator'',''admin'']::public.member_role[]))', t);
  end loop;
end $$;
alter table public.incidents enable row level security;
alter table public.incident_status_history enable row level security;
alter table public.incident_photos enable row level security;
alter table public.audit_logs enable row level security;
grant select on public.incidents, public.incident_status_history, public.incident_photos, public.audit_logs to authenticated;
create policy incidents_read on public.incidents for select to authenticated using (
 accraflow_private.has_role(organization_id, array['resident','moderator','operator','admin']::public.member_role[])
 and (reported_by = (select auth.uid()) or accraflow_private.has_role(organization_id,array['moderator','operator','admin']::public.member_role[]))
);
create policy history_read on public.incident_status_history for select to authenticated using (
 exists (select 1 from public.incidents i where i.id = public.incident_status_history.incident_id and i.organization_id = public.incident_status_history.organization_id)
);
create policy photos_read on public.incident_photos for select to authenticated using (
 exists (select 1 from public.incidents i where i.id = public.incident_photos.incident_id and i.organization_id = public.incident_photos.organization_id)
);
-- Unvalidated model results are not exposed to application clients.
drop policy member_read on public.simulation_results;
create policy validated_results_read on public.simulation_results for select to authenticated using (validated = true and accraflow_private.has_role(organization_id,array['resident','moderator','operator','admin']::public.member_role[]));
create policy audit_read on public.audit_logs for select to authenticated using (accraflow_private.has_role(organization_id,array['admin']::public.member_role[]));

create function public.submit_incident(p_organization_id uuid, p_title text, p_description text, p_category public.incident_category, p_longitude double precision, p_latitude double precision) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid := auth.uid(); begin
 if not accraflow_private.has_role(p_organization_id,array['resident','moderator','operator','admin']::public.member_role[]) then raise exception 'not authorized' using errcode='42501'; end if;
 if p_longitude is null or p_latitude is null or p_longitude not between -0.45 and 0.1 or p_latitude not between 5.4 and 5.85 then raise exception 'coordinates out of bounds' using errcode='22023'; end if;
 insert into public.incidents(organization_id, reported_by, title, description, category, location)
 values(p_organization_id,v_user,trim(p_title),trim(p_description),p_category,extensions.st_setsrid(extensions.st_makepoint(p_longitude,p_latitude),4326)) returning id into v_id;
 insert into public.incident_status_history(organization_id,incident_id,new_status,actor_id) values(p_organization_id,v_id,'submitted',v_user);
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id) values(p_organization_id,v_user,'incident.submitted','incident',v_id);
 return v_id;
end $$;
create function public.transition_incident(p_incident_id uuid, p_new_status public.incident_status, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_incident public.incidents%rowtype; v_user uuid := auth.uid(); begin
 select * into v_incident from public.incidents where id=p_incident_id for update;
 if not found or not accraflow_private.has_role(v_incident.organization_id,array['moderator','operator','admin']::public.member_role[]) then raise exception 'not found or not authorized' using errcode='42501'; end if;
 if p_new_status in ('under_review','verified','rejected') and not accraflow_private.has_role(v_incident.organization_id,array['moderator','admin']::public.member_role[]) then raise exception 'moderator role required' using errcode='42501'; end if;
 if p_new_status in ('assigned','in_progress','resolved') and not accraflow_private.has_role(v_incident.organization_id,array['operator','admin']::public.member_role[]) then raise exception 'operator role required' using errcode='42501'; end if;
 if not ((v_incident.status='submitted' and p_new_status in ('under_review','rejected')) or (v_incident.status='under_review' and p_new_status in ('verified','rejected')) or (v_incident.status='verified' and p_new_status='assigned') or (v_incident.status='assigned' and p_new_status='in_progress') or (v_incident.status='in_progress' and p_new_status='resolved')) then raise exception 'invalid status transition' using errcode='22023'; end if;
 if (p_reason is not null and length(p_reason) > 1000) or (p_new_status='rejected' and (p_reason is null or length(trim(p_reason)) < 5)) then raise exception 'rejection reason required' using errcode='22023'; end if;
 update public.incidents set status=p_new_status,updated_at=now() where id=p_incident_id;
 insert into public.incident_status_history(organization_id,incident_id,previous_status,new_status,actor_id,reason) values(v_incident.organization_id,p_incident_id,v_incident.status,p_new_status,v_user,nullif(trim(p_reason),''));
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v_incident.organization_id,v_user,'incident.status_changed','incident',p_incident_id,jsonb_build_object('from',v_incident.status,'to',p_new_status));
end $$;
create function public.create_maintenance_task(p_incident_id uuid,p_title text,p_priority public.task_priority default 'medium',p_due_at timestamptz default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_incident public.incidents%rowtype; v_id uuid; v_user uuid := auth.uid(); begin
 select * into v_incident from public.incidents where id=p_incident_id for update;
 if not found or not accraflow_private.has_role(v_incident.organization_id,array['operator','admin']::public.member_role[]) then raise exception 'not found or not authorized' using errcode='42501'; end if;
 if v_incident.status not in ('verified','assigned','in_progress') then raise exception 'incident must be verified and active' using errcode='22023'; end if;
 insert into public.maintenance_tasks(organization_id,incident_id,title,priority,due_at,created_by) values(v_incident.organization_id,p_incident_id,trim(p_title),p_priority,p_due_at,v_user) returning id into v_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v_incident.organization_id,v_user,'maintenance.created','maintenance_task',v_id,jsonb_build_object('incident_id',p_incident_id));
 return v_id;
end $$;
create function public.assign_maintenance_task(p_task_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_task public.maintenance_tasks%rowtype; v_user uuid := auth.uid(); begin
 select * into v_task from public.maintenance_tasks where id=p_task_id for update;
 if not found or not accraflow_private.has_role(v_task.organization_id,array['operator','admin']::public.member_role[]) then raise exception 'not found or not authorized' using errcode='42501'; end if;
 if v_task.status not in ('open','in_progress') then raise exception 'task is closed' using errcode='22023'; end if;
 if not exists(select 1 from public.memberships where organization_id=v_task.organization_id and user_id=p_user_id and is_active and role in ('operator','admin')) then raise exception 'assignee must be an operator in this organization' using errcode='22023'; end if;
 insert into public.maintenance_assignments(organization_id,task_id,assigned_user_id,assigned_by) values(v_task.organization_id,p_task_id,p_user_id,v_user);
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v_task.organization_id,v_user,'maintenance.assigned','maintenance_task',p_task_id,jsonb_build_object('assignee_id',p_user_id));
end $$;
create function public.complete_maintenance_task(p_task_id uuid,p_notes text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_task public.maintenance_tasks%rowtype; v_user uuid := auth.uid(); begin
 select * into v_task from public.maintenance_tasks where id=p_task_id for update;
 if not found or not accraflow_private.has_role(v_task.organization_id,array['operator','admin']::public.member_role[]) then raise exception 'not found or not authorized' using errcode='42501'; end if;
 if v_task.status not in ('open','in_progress') then raise exception 'task is closed' using errcode='22023'; end if;
 if p_notes is null or length(trim(p_notes)) not between 5 and 2000 then raise exception 'completion notes required' using errcode='22023'; end if;
 update public.maintenance_tasks set status='completed',completion_notes=trim(p_notes),completed_by=v_user,completed_at=now(),updated_at=now() where id=p_task_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id) values(v_task.organization_id,v_user,'maintenance.completed','maintenance_task',p_task_id);
end $$;
revoke all on function public.submit_incident(uuid,text,text,public.incident_category,double precision,double precision) from public, anon;
revoke all on function public.transition_incident(uuid,public.incident_status,text) from public, anon;
revoke all on function public.create_maintenance_task(uuid,text,public.task_priority,timestamptz) from public, anon;
revoke all on function public.assign_maintenance_task(uuid,uuid) from public, anon;
revoke all on function public.complete_maintenance_task(uuid,text) from public, anon;
grant execute on function public.submit_incident(uuid,text,text,public.incident_category,double precision,double precision) to authenticated;
grant execute on function public.transition_incident(uuid,public.incident_status,text) to authenticated;
grant execute on function public.create_maintenance_task(uuid,text,public.task_priority,timestamptz) to authenticated;
grant execute on function public.assign_maintenance_task(uuid,uuid) to authenticated;
grant execute on function public.complete_maintenance_task(uuid,text) to authenticated;

-- SECURITY INVOKER intentionally preserves incident RLS when returning coordinates.
create function public.list_incidents(p_organization_id uuid)
returns table(id uuid, organization_id uuid, reported_by uuid, title text, description text,
 category public.incident_category, status public.incident_status, longitude double precision,
 latitude double precision, created_at timestamptz, updated_at timestamptz)
language sql stable security invoker set search_path = '' as $$
 select i.id, i.organization_id, i.reported_by, i.title, i.description, i.category, i.status,
        extensions.st_x(i.location), extensions.st_y(i.location), i.created_at, i.updated_at
 from public.incidents i where i.organization_id = p_organization_id
 order by i.created_at desc limit 500;
$$;
revoke all on function public.list_incidents(uuid) from public, anon;
grant execute on function public.list_incidents(uuid) to authenticated;

-- A limited roster avoids exposing email addresses or membership lists to residents.
create function public.list_assignable_operators(p_organization_id uuid)
returns table(user_id uuid, display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not accraflow_private.has_role(p_organization_id, array['operator','admin']::public.member_role[]) then
   raise exception 'not authorized' using errcode='42501';
 end if;
 return query select m.user_id, p.display_name from public.memberships m
 join public.profiles p on p.id=m.user_id
 where m.organization_id=p_organization_id and m.is_active and m.role in ('operator','admin') order by p.display_name, m.user_id;
end $$;
revoke all on function public.list_assignable_operators(uuid) from public, anon;
grant execute on function public.list_assignable_operators(uuid) to authenticated;

-- Administrators manage membership without deleting rows referenced by audit history.
-- Lock the organization row first so concurrent changes cannot remove the last admin.
create function public.list_organization_members(p_organization_id uuid)
returns table(user_id uuid, display_name text, role public.member_role, is_active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not accraflow_private.has_role(p_organization_id,array['admin']::public.member_role[]) then raise exception 'not authorized' using errcode='42501'; end if;
 return query select m.user_id,p.display_name,m.role,m.is_active from public.memberships m
 join public.profiles p on p.id=m.user_id where m.organization_id=p_organization_id order by p.display_name,m.user_id;
end $$;
create function public.set_organization_member(p_organization_id uuid,p_user_id uuid,p_role public.member_role) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old_role public.member_role; v_was_active boolean; v_actor uuid:=auth.uid();
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not found or not accraflow_private.has_role(p_organization_id,array['admin']::public.member_role[]) then raise exception 'not found or not authorized' using errcode='42501'; end if;
 if p_role is null or p_user_id is null then raise exception 'user and role required' using errcode='22023'; end if;
 select role,is_active into v_old_role,v_was_active from public.memberships where organization_id=p_organization_id and user_id=p_user_id;
 if v_old_role='admin' and v_was_active and p_role<>'admin' and (select count(*) from public.memberships where organization_id=p_organization_id and role='admin' and is_active)<=1 then raise exception 'cannot remove the last active admin' using errcode='22023'; end if;
 insert into public.memberships(organization_id,user_id,role,is_active) values(p_organization_id,p_user_id,p_role,true)
 on conflict(organization_id,user_id) do update set role=excluded.role,is_active=true;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(p_organization_id,v_actor,'membership.set','profile',p_user_id,jsonb_build_object('old_role',v_old_role,'new_role',p_role,'previously_active',v_was_active));
end $$;
create function public.deactivate_organization_member(p_organization_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old_role public.member_role; v_active boolean; v_actor uuid:=auth.uid();
begin
 perform 1 from public.organizations where id=p_organization_id for update;
 if not found or not accraflow_private.has_role(p_organization_id,array['admin']::public.member_role[]) then raise exception 'not found or not authorized' using errcode='42501'; end if;
 select role,is_active into v_old_role,v_active from public.memberships where organization_id=p_organization_id and user_id=p_user_id;
 if not found or not v_active then raise exception 'active membership not found' using errcode='22023'; end if;
 if v_old_role='admin' and (select count(*) from public.memberships where organization_id=p_organization_id and role='admin' and is_active)<=1 then raise exception 'cannot remove the last active admin' using errcode='22023'; end if;
 update public.memberships set is_active=false where organization_id=p_organization_id and user_id=p_user_id;
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(p_organization_id,v_actor,'membership.deactivated','profile',p_user_id,jsonb_build_object('old_role',v_old_role));
end $$;
revoke all on function public.list_organization_members(uuid),public.set_organization_member(uuid,uuid,public.member_role),public.deactivate_organization_member(uuid,uuid) from public,anon;
grant execute on function public.list_organization_members(uuid),public.set_organization_member(uuid,uuid,public.member_role),public.deactivate_organization_member(uuid,uuid) to authenticated;
