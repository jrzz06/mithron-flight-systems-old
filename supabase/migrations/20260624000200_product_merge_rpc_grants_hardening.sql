-- merge_product_into_canonical is server-only (service_role). Revoke default PUBLIC execute.

revoke all on function public.merge_product_into_canonical(text, text, text) from public;
revoke all on function public.merge_product_into_canonical(text, text, text) from anon;
revoke all on function public.merge_product_into_canonical(text, text, text) from authenticated;

grant execute on function public.merge_product_into_canonical(text, text, text) to service_role;
