-- ===========================================================================
-- 0001_enquiries.sql — enquiry persistence for scottymassa.com
--
-- Run this once in a fresh Supabase project (SQL editor, or `supabase db
-- push`). It is safe to run again: every object is created IF NOT EXISTS,
-- every function with CREATE OR REPLACE, and the trigger is dropped before it
-- is recreated.
--
-- Access model: these tables are reached only by the serverless functions in
-- api/, using the service role key, which bypasses row-level security. RLS is
-- therefore enabled with NO policy at all — the anon and authenticated roles
-- that back the public Supabase URL can read nothing and write nothing, even
-- if the project's anon key leaks (it is a public key by design). Do not add
-- a policy here to "make the admin board work"; the board talks to
-- /api/enquiries with a bearer token, never to Supabase directly.
--
-- gen_random_uuid() is core PostgreSQL from 13 onward, so no extension is
-- required.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Reference sequence
--
-- Enquiry references read SM-2026-00042. The number comes from here so it is
-- monotonic and unique; a deployment with no database mints a random one
-- instead and says so in the internal email.
-- ---------------------------------------------------------------------------
create sequence if not exists public.enquiry_ref_seq as bigint start with 1 increment by 1;

-- ---------------------------------------------------------------------------
-- enquiries — one row per person who completed step 1
--
-- A row is created at step 1, before the project details exist, because the
-- point of the two-step form is to keep the enquiry when someone abandons
-- step 2. Almost every column is therefore nullable: only the reference, the
-- email and the status are guaranteed.
-- ---------------------------------------------------------------------------
create table if not exists public.enquiries (
  id                  uuid primary key default gen_random_uuid(),
  enquiry_ref         text        not null,
  status              text        not null default 'new',
  segments            text[]      not null default array['TATTOO_ENQUIRY']::text[],

  -- Step 1
  first_name          text,
  last_name           text,
  email               text        not null,
  country             text,
  instagram           text,
  project_type        text,
  scale               text,
  -- Where the work happens: studio in Malta, Scotty travels, or undecided.
  location            text,

  -- Step 2
  idea                text,
  placement           text,
  existing_tattoos    text,
  preferred_timing    text,
  heard_from          text,
  additional_info     text,
  reference_count     integer     not null default 0,

  -- Triage aid only — never shown to the client, never auto-declines anything.
  lead_score          integer,
  lead_label          text,

  -- First-touch attribution, captured client-side and posted with step 1.
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  utm_content         text,
  utm_term            text,
  landing_page        text,
  referrer            text,

  -- Deliverability. 'hard_bounced' permanently suppresses every follow-up.
  email_status        text        not null default 'unknown',
  emails_sent         text[]      not null default '{}'::text[],

  -- Funnel timestamps. step1_at drives the follow-up windows; submitted_at
  -- being non-null is on its own enough to suppress every reminder.
  step1_at            timestamptz,
  submitted_at        timestamptz,
  reviewed_at         timestamptz,
  unsubscribed_at     timestamptz,
  reminder_01_sent_at timestamptz,
  reminder_02_sent_at timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Unique as an index rather than a table constraint, so re-running the file
-- is a no-op instead of a duplicate-constraint error.
create unique index if not exists enquiries_enquiry_ref_idx
  on public.enquiries (enquiry_ref);

-- The admin board's default query: every column, newest first, optionally
-- filtered to one status.
create index if not exists enquiries_status_created_at_idx
  on public.enquiries (status, created_at desc);

-- The daily follow-up cron scans a window of step1_at among enquiries that
-- were never submitted; the partial index keeps that scan off the bulk of the
-- table, which is completed enquiries.
create index if not exists enquiries_step1_at_open_idx
  on public.enquiries (step1_at)
  where submitted_at is null;

create index if not exists enquiries_email_idx
  on public.enquiries (email);

-- Board statuses are a closed set (§12). Constrained here because a typo in a
-- PATCH would otherwise create a tenth, invisible column on the board.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'enquiries_status_check') then
    alter table public.enquiries
      add constraint enquiries_status_check
      check (status in ('new','reviewing','qualified','contacted','consultation','deposit','booked','completed','lost'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- enquiry_events — append-only lifecycle log
--
-- Deliberately NOT constrained to a fixed list of event names. This is a log:
-- recording an event nobody anticipated is more useful than rejecting the
-- write and losing it. The canonical list lives in api/_lib/enquiry.js.
-- ---------------------------------------------------------------------------
create table if not exists public.enquiry_events (
  id          bigint generated always as identity primary key,
  enquiry_ref text        not null,
  event       text        not null,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists enquiry_events_enquiry_ref_idx
  on public.enquiry_events (enquiry_ref, created_at);

-- ---------------------------------------------------------------------------
-- enquiry_email_activity — what MailerSend told us happened to each message
--
-- No foreign key to enquiries: webhooks arrive out of order and occasionally
-- for an address we no longer hold, and a rejected insert would make
-- MailerSend retry the delivery forever. The ref is matched in the
-- application instead.
-- ---------------------------------------------------------------------------
create table if not exists public.enquiry_email_activity (
  id          bigint generated always as identity primary key,
  enquiry_ref text,
  email       text,
  template    text,
  message_id  text,
  event_type  text        not null,
  occurred_at timestamptz not null default now(),
  raw         jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists enquiry_email_activity_enquiry_ref_idx
  on public.enquiry_email_activity (enquiry_ref, occurred_at desc);

create index if not exists enquiry_email_activity_message_id_idx
  on public.enquiry_email_activity (message_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists enquiries_set_updated_at on public.enquiries;
create trigger enquiries_set_updated_at
  before update on public.enquiries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- next_enquiry_seq() — the RPC api/_lib/store.js calls to mint a reference
--
-- SECURITY DEFINER with a pinned search_path so the sequence can be advanced
-- without granting the API role any rights over the sequence itself. Execute
-- is granted to service_role only; the public Supabase roles cannot call it,
-- which stops anyone burning through reference numbers from the browser.
-- ---------------------------------------------------------------------------
create or replace function public.next_enquiry_seq()
returns bigint
language sql
security definer
set search_path = public, pg_temp
as $$
  select nextval('public.enquiry_ref_seq');
$$;

revoke all on function public.next_enquiry_seq() from public;
revoke all on function public.next_enquiry_seq() from anon, authenticated;
grant execute on function public.next_enquiry_seq() to service_role;

-- ---------------------------------------------------------------------------
-- Row-level security: on, with no policy anywhere.
--
-- No policy means no row is visible or writable to anon or authenticated.
-- The service role used by api/_lib/store.js bypasses RLS, so the functions
-- keep working. Enquiries contain names, email addresses and free text about
-- people's bodies — there is no version of this that should be readable from
-- a browser.
-- ---------------------------------------------------------------------------
alter table public.enquiries             enable row level security;
alter table public.enquiry_events        enable row level security;
alter table public.enquiry_email_activity enable row level security;

revoke all on table public.enquiries             from anon, authenticated;
revoke all on table public.enquiry_events        from anon, authenticated;
revoke all on table public.enquiry_email_activity from anon, authenticated;
revoke all on sequence public.enquiry_ref_seq    from anon, authenticated;
