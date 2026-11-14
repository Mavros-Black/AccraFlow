-- Before applying, create a PRIVATE `accraflow-incident-photos` Storage bucket
-- through the Supabase Storage API/dashboard with a 5 MiB limit and only image/jpeg.
-- The application re-encodes images and strips metadata before uploading.
-- Restrictive guards below prevent unrelated permissive policies from exposing this bucket.

create function accraflow_private.can_upload_incident_photo(p_path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_incident uuid; v_user uuid := auth.uid(); v_row public.incidents%rowtype;
begin
 if v_user is null or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then return false; end if;
 v_org := split_part(p_path,'/',1)::uuid; v_incident := split_part(p_path,'/',2)::uuid;
 select * into v_row from public.incidents where id=v_incident and organization_id=v_org;
 if not found or not accraflow_private.has_role(v_org,array['resident','moderator','operator','admin']::public.member_role[]) then return false; end if;
 return ((v_row.reported_by=v_user and v_row.status in ('submitted','under_review')) or accraflow_private.has_role(v_org,array['moderator','operator','admin']::public.member_role[]))
   and (select count(*) from public.incident_photos p where p.incident_id=v_incident and p.organization_id=v_org) < 10;
end $$;
create function accraflow_private.can_read_incident_photo(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
 select (select auth.uid()) is not null and exists (
  select 1 from public.incident_photos p join public.incidents i on i.id=p.incident_id and i.organization_id=p.organization_id
  where p.object_path=p_path and accraflow_private.has_role(i.organization_id,array['resident','moderator','operator','admin']::public.member_role[])
    and (i.reported_by=(select auth.uid()) or accraflow_private.has_role(i.organization_id,array['moderator','operator','admin']::public.member_role[]))
 );
$$;
create function accraflow_private.can_delete_pending_photo(p_path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_incident uuid;
begin
 if (select auth.uid()) is null or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then return false; end if;
 v_org:=split_part(p_path,'/',1)::uuid; v_incident:=split_part(p_path,'/',2)::uuid;
 return accraflow_private.has_role(v_org,array['resident','moderator','operator','admin']::public.member_role[])
   and exists(select 1 from public.incidents i where i.id=v_incident and i.organization_id=v_org and (i.reported_by=(select auth.uid()) or accraflow_private.has_role(v_org,array['moderator','operator','admin']::public.member_role[])))
   and not exists(select 1 from public.incident_photos p where p.object_path=p_path);
end $$;
revoke all on function accraflow_private.can_upload_incident_photo(text), accraflow_private.can_read_incident_photo(text), accraflow_private.can_delete_pending_photo(text) from public, anon;
grant execute on function accraflow_private.can_upload_incident_photo(text), accraflow_private.can_read_incident_photo(text), accraflow_private.can_delete_pending_photo(text) to authenticated;

-- Restrictive policies are ANDed with all permissive policies. They apply only to
-- this bucket, even if the project has an unrelated broad storage policy.
create policy accraflow_photo_anon_guard on storage.objects as restrictive for all to anon
 using(bucket_id <> 'accraflow-incident-photos') with check(bucket_id <> 'accraflow-incident-photos');
create policy accraflow_photo_select_guard on storage.objects as restrictive for select to authenticated
 using(bucket_id <> 'accraflow-incident-photos' or accraflow_private.can_read_incident_photo(name) or (owner_id=(select auth.uid())::text and accraflow_private.can_upload_incident_photo(name)));
create policy accraflow_photo_insert_guard on storage.objects as restrictive for insert to authenticated
 with check(bucket_id <> 'accraflow-incident-photos' or (owner_id=(select auth.uid())::text and accraflow_private.can_upload_incident_photo(name)));
create policy accraflow_photo_update_guard on storage.objects as restrictive for update to authenticated
 using(bucket_id <> 'accraflow-incident-photos') with check(bucket_id <> 'accraflow-incident-photos');
create policy accraflow_photo_delete_guard on storage.objects as restrictive for delete to authenticated
 using(bucket_id <> 'accraflow-incident-photos' or (owner_id=(select auth.uid())::text and accraflow_private.can_delete_pending_photo(name)));

create policy accraflow_photo_insert on storage.objects for insert to authenticated
 with check(bucket_id='accraflow-incident-photos' and owner_id=(select auth.uid())::text and accraflow_private.can_upload_incident_photo(name));
create policy accraflow_photo_read on storage.objects for select to authenticated
 using(bucket_id='accraflow-incident-photos' and (accraflow_private.can_read_incident_photo(name) or (owner_id=(select auth.uid())::text and accraflow_private.can_upload_incident_photo(name))));
create policy accraflow_photo_cleanup on storage.objects for delete to authenticated
 using(bucket_id='accraflow-incident-photos' and owner_id=(select auth.uid())::text and accraflow_private.can_delete_pending_photo(name));

create function public.register_incident_photo(p_incident_id uuid,p_photo_id uuid,p_size_bytes integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_incident public.incidents%rowtype; v_path text; v_user uuid := auth.uid();
begin
 select * into v_incident from public.incidents where id=p_incident_id for update;
 if not found or v_user is null then raise exception 'not found or not authorized' using errcode='42501'; end if;
 v_path := v_incident.organization_id::text || '/' || p_incident_id::text || '/' || p_photo_id::text || '.jpg';
 if not accraflow_private.can_upload_incident_photo(v_path) then raise exception 'not found or not authorized' using errcode='42501'; end if;
 if p_size_bytes is null or p_size_bytes not between 1 and 5242880 then raise exception 'invalid photo size' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='accraflow-incident-photos' and o.name=v_path and o.owner_id=v_user::text and case when o.metadata->>'size' ~ '^[0-9]{1,7}$' then (o.metadata->>'size')::integer=p_size_bytes else false end) then
  raise exception 'photo upload not found or size mismatch' using errcode='22023';
 end if;
 insert into public.incident_photos(id,organization_id,incident_id,object_path,uploaded_by,mime_type,size_bytes) values(p_photo_id,v_incident.organization_id,p_incident_id,v_path,v_user,'image/jpeg',p_size_bytes);
 insert into public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,metadata) values(v_incident.organization_id,v_user,'incident.photo_added','incident',p_incident_id,jsonb_build_object('photo_id',p_photo_id));
 return p_photo_id;
end $$;
revoke all on function public.register_incident_photo(uuid,uuid,integer) from public, anon;
grant execute on function public.register_incident_photo(uuid,uuid,integer) to authenticated;
