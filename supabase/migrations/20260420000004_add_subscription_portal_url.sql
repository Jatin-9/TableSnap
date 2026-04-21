-- Store the Lemon Squeezy customer portal URL per user so the
-- "Manage subscription" button can link directly to their portal
-- instead of the generic /my-orders page.
alter table users
  add column if not exists subscription_portal_url text;
