-- Migrate live archived/trashed operational records to terminal statuses and clear soft-hide flags.
-- Columns are retained for cold-storage archive jobs; admin UI no longer writes them.

-- Orders: archived or soft-deleted → cancelled
update public.orders
set
  status = 'cancelled',
  fulfillment_status = 'cancelled',
  updated_at = now()
where (archived_at is not null or deleted_at is not null)
  and status <> 'cancelled';

update public.orders
set
  archived_at = null,
  deleted_at = null,
  deleted_by = null,
  updated_at = now()
where archived_at is not null
   or deleted_at is not null;

-- Enquiries: archived → lost
update public.enquiries
set
  status = 'lost',
  updated_at = now()
where archived_at is not null
  and status not in ('lost', 'converted');

update public.enquiries
set
  archived_at = null,
  deleted_at = null,
  updated_at = now()
where archived_at is not null
   or deleted_at is not null;

-- Contact requests: archived status/flag → rejected
update public.contact_requests
set
  status = 'rejected',
  updated_at = now()
where (status = 'archived' or archived_at is not null)
  and status <> 'converted';

update public.contact_requests
set
  archived_at = null,
  deleted_at = null,
  updated_at = now()
where archived_at is not null
   or deleted_at is not null;
