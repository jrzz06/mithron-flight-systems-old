-- Remove obsolete account navigation references.
-- Additive content correction only: keep auth, RBAC, storefront rendering, and fallback systems intact.

update public.footer_links
set href = '/login',
    updated_at = now()
where href = '/' || 'account';

update public.site_navigation
set href = '/login',
    updated_at = now()
where href = '/' || 'account';
