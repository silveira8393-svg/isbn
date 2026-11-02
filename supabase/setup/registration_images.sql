-- PREPARED ONLY. Apply to project jcxdkrpmrfbrhzwbzhph after explicit approval.
-- Private book photographs. No product tables, public access, UPDATE or DELETE permissions.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('isbn-registration-images', 'isbn-registration-images', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']);

create policy isbn_registration_images_read on storage.objects
for select to authenticated using (
  bucket_id = 'isbn-registration-images'
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
  and exists (select 1 from public.store_users su
    where su.user_id = (select auth.uid()) and su.active
      and su.role in ('admin', 'operator', 'developer')
      and su.store_id::text = (storage.foldername(name))[1])
);

create policy isbn_registration_images_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'isbn-registration-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.(jpg|png|webp)$'
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active)
  and exists (select 1 from public.store_users su
    where su.user_id = (select auth.uid()) and su.active
      and su.role in ('admin', 'operator', 'developer')
      and su.store_id::text = (storage.foldername(name))[1])
);
commit;
