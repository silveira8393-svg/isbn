-- PREPARED ONLY. Predicate to paste into the EXISTING policy in Dashboard > Storage > Policies.
-- This is NOT a standalone SQL command. Do not run it through execute_sql/SQL Editor.
-- Policy: isbn_registration_images_insert; command: INSERT; role: authenticated; keep all these attributes.
-- WITH CHECK = audited original predicate AND aal2. Compare current predicate before editing.
(((bucket_id = 'isbn-registration-images'::text) AND ((storage.foldername(name))[2] = (( SELECT auth.uid() AS uid))::text) AND (name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.(jpg|png|webp)$'::text) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.active))) AND (EXISTS ( SELECT 1
   FROM store_users su
  WHERE ((su.user_id = ( SELECT auth.uid() AS uid)) AND su.active AND (su.role = ANY (ARRAY['admin'::user_role, 'operator'::user_role, 'developer'::user_role])) AND ((su.store_id)::text = (storage.foldername(objects.name))[1]))))))
AND ((select auth.jwt()->>'aal') = 'aal2')
