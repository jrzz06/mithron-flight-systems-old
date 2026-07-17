-- Hide seeded placeholder reviews so storefront shows real Wix / customer reviews only.
update public.customer_order_reviews
set
  is_visible = false,
  pinned = false,
  updated_at = now()
where source = 'customer'
  and external_id like 'seed-%'
  and is_visible = true;
