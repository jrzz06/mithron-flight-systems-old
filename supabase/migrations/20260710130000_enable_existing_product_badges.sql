-- Re-enable storefront visibility for ribbons imported into badge_text during badge_controls migration.
update public.mithron_products
set badge_enabled = true
where badge_enabled = false
  and nullif(btrim(badge_text), '') is not null;
