-- AEO Autopilot — initial schema
-- Multi-tenant. Every row is scoped to an organization, enforced by RLS.

create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ── enums ────────────────────────────────────────────────────────────────
create type answer_engine  as enum ('chatgpt','perplexity','google_ai_overviews','claude','gemini');
create type channel_kind   as enum ('owned_site','social','directory','community');
create type autonomy_level as enum ('approval_queue','semi_auto','fully_auto');
create type content_type   as enum ('faq_page','glossary','comparison','how_to','stat_roundup','community_answer','social_post');
create type content_status as enum ('draft','pending_approval','approved','scheduled','published','rejected','failed');
create type prompt_intent  as enum ('definitional','comparative','how_to','commercial');
create type publication_state as enum ('queued','posting','live','error');

-- ── organizations ───────────────────────────────────────────────────────
create table organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  domain      text not null,
  brand_guide text,
  plan        text not null default 'free',
  created_at  timestamptz not null default now()
);

-- Maps auth users to the orgs they belong to (drives every RLS policy).
create table memberships (
  org_id  uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role    text not null default 'member',
  primary key (org_id, user_id)
);

-- ── prompt sets (target AI questions) ────────────────────────────────────
create table prompt_sets (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references organizations(id) on delete cascade,
  query      text not null,
  intent     prompt_intent not null default 'definitional',
  priority   int not null default 3 check (priority between 1 and 5),
  embedding  vector(1536),
  created_at timestamptz not null default now()
);

-- ── channels (connected destinations) ────────────────────────────────────
create table channels (
  id              uuid primary key default uuid_generate_v4(),
  org_id          uuid not null references organizations(id) on delete cascade,
  kind            channel_kind not null,
  label           text not null,
  autonomy_level  autonomy_level not null default 'approval_queue',
  rate_cap_per_day int not null default 3,
  connected       boolean not null default false,
  credentials     jsonb, -- encrypted at rest in production
  created_at      timestamptz not null default now()
);

-- ── content items (drafts + published assets) ────────────────────────────
create table content_items (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id) on delete cascade,
  prompt_id      uuid references prompt_sets(id) on delete set null,
  type           content_type not null,
  channel_kind   channel_kind not null,
  title          text not null,
  body           text not null,
  schema_jsonld  jsonb,
  status         content_status not null default 'draft',
  created_at     timestamptz not null default now()
);

-- ── publications (publish attempts + results) ────────────────────────────
create table publications (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references organizations(id) on delete cascade,
  content_id uuid not null references content_items(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  url        text,
  state      publication_state not null default 'queued',
  posted_at  timestamptz,
  error      text
);

-- ── visibility probes (AI-engine measurements) ───────────────────────────
create table visibility_probes (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  engine      answer_engine not null,
  prompt      text not null,
  mentioned   boolean not null default false,
  cited_urls  text[] not null default '{}',
  measured_at timestamptz not null default now()
);

-- ── approvals (audit trail) ──────────────────────────────────────────────
create table approvals (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references organizations(id) on delete cascade,
  content_id uuid not null references content_items(id) on delete cascade,
  approver   uuid references auth.users(id),
  decision   text not null check (decision in ('approved','rejected','edited')),
  note       text,
  created_at timestamptz not null default now()
);

create index on prompt_sets (org_id);
create index on content_items (org_id, status);
create index on publications (org_id, state);
create index on visibility_probes (org_id, engine, measured_at);

-- ── Row-Level Security ────────────────────────────────────────────────────
-- A user can only touch rows belonging to an org they are a member of.
create or replace function is_org_member(target uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from memberships m
    where m.org_id = target and m.user_id = auth.uid()
  );
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','prompt_sets','channels','content_items',
    'publications','visibility_probes','approvals'
  ] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- organizations keys on id; the rest key on org_id.
create policy org_rw on organizations using (is_org_member(id)) with check (is_org_member(id));
create policy ps_rw  on prompt_sets       using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy ch_rw  on channels          using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy ci_rw  on content_items     using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy pub_rw on publications      using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy vp_rw  on visibility_probes using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy ap_rw  on approvals         using (is_org_member(org_id)) with check (is_org_member(org_id));

create policy mem_read on memberships for select using (user_id = auth.uid());
alter table memberships enable row level security;
