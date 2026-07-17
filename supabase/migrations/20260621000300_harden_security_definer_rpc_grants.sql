-- CMS mutation RPCs are invoked via service_role from server actions only.
-- RBAC helpers (current_enterprise_role, has_cms_*) remain callable by authenticated for RLS and login.

revoke all on function public.assert_cms_write_permission() from authenticated;
revoke all on function public.cms_insert_content_revision(text, text, jsonb, text, uuid) from authenticated;
revoke all on function public.cms_mutate_content_with_revision(text, text, text, jsonb, jsonb, text, uuid, text, integer) from authenticated;
revoke all on function public.record_content_revision(text, text, integer, jsonb, text) from authenticated;

grant execute on function public.assert_cms_write_permission() to service_role;
grant execute on function public.cms_insert_content_revision(text, text, jsonb, text, uuid) to service_role;
grant execute on function public.cms_mutate_content_with_revision(text, text, text, jsonb, jsonb, text, uuid, text, integer) to service_role;
grant execute on function public.record_content_revision(text, text, integer, jsonb, text) to service_role;
