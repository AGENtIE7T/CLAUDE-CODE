-- ═══════════════════════════════════════════════════════════════════════════
--  SEO Command Center — schema (additive; lives alongside AEO Autopilot)
-- ═══════════════════════════════════════════════════════════════════════════
--  Multi-tenant. "Workspace" == the existing `organizations` table; we reuse it
--  and its `memberships` so SEO Command Center shares auth and tenancy with the
--  existing product. Every SEO table is scoped by workspace_id and guarded by
--  RLS using the existing is_org_member() helper.
--
--  This migration ONLY adds objects. It does not alter or drop anything from
--  0001, so both products coexist.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── enums ────────────────────────────────────────────────────────────────
create type seo_role         as enum ('OWNER','ADMIN','SEO_MANAGER','EDITOR','VIEWER');
create type seo_mode         as enum ('audit','preview','execute');
create type seo_risk         as enum ('low','medium','high','prohibited');
create type website_env      as enum ('production','staging');
create type cms_type         as enum ('wordpress','shopify','custom','unknown');
create type connection_kind  as enum ('wordpress','shopify','custom','search_console','analytics','seo_data','email');
create type connection_access as enum ('read_only','read_write');
create type seo_task_status  as enum (
  'parsed','needs_clarification','planned','running','awaiting_approval',
  'approved','executing','completed','rejected','failed','blocked'
);
create type preview_status   as enum ('open','approved','rejected','expired','stale');
create type crawl_status     as enum ('queued','running','paused','completed','cancelled','failed');

-- Give memberships a typed SEO role without disturbing the existing text role.
alter table memberships add column if not exists seo_role seo_role not null default 'VIEWER';

-- ── websites ───────────────────────────────────────────────────────────────
create table websites (
  id                    uuid primary key default uuid_generate_v4(),
  workspace_id          uuid not null references organizations(id) on delete cascade,
  name                  text not null,
  url                   text not null,
  canonical_domain      text not null,
  cms_type              cms_type not null default 'unknown',
  environment           website_env not null default 'production',
  status                text not null default 'active',
  primary_country       text,
  primary_language      text,
  ownership_verified_at timestamptz,
  ownership_method      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table website_settings (
  website_id             uuid primary key references websites(id) on delete cascade,
  sitemap_url            text,
  robots_url             text,
  include_patterns       text[] not null default '{}',
  exclude_patterns       text[] not null default '{}',
  max_pages_per_crawl    int not null default 200 check (max_pages_per_crawl between 1 and 10000),
  max_crawl_depth        int not null default 5   check (max_crawl_depth between 1 and 20),
  crawl_frequency        text not null default 'manual',
  audit_external_links   boolean not null default true,
  search_console_connected boolean not null default false,
  analytics_connected    boolean not null default false
);

create table protected_urls (
  id          uuid primary key default uuid_generate_v4(),
  website_id  uuid not null references websites(id) on delete cascade,
  pattern     text not null,
  reason      text,
  created_at  timestamptz not null default now()
);

-- ── connections ──────────────────────────────────────────────────────────
create table seo_connections (
  id             uuid primary key default uuid_generate_v4(),
  workspace_id   uuid not null references organizations(id) on delete cascade,
  website_id     uuid references websites(id) on delete cascade,
  kind           connection_kind not null,
  label          text not null,
  access         connection_access not null default 'read_only',
  scopes         text[] not null default '{}',
  -- Encrypted credential blob. NEVER returned to the client. NEVER logged.
  encrypted_credentials bytea,
  status         text not null default 'connected',
  last_tested_at timestamptz,
  last_error     text,
  created_at     timestamptz not null default now()
);

-- ── crawl runs / pages / links / versions ──────────────────────────────────
create table crawl_runs (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references organizations(id) on delete cascade,
  website_id   uuid not null references websites(id) on delete cascade,
  status       crawl_status not null default 'queued',
  pages_found  int not null default 0,
  pages_crawled int not null default 0,
  max_pages    int not null default 200,
  max_depth    int not null default 5,
  started_at   timestamptz,
  finished_at  timestamptz,
  error        text,
  created_at   timestamptz not null default now()
);

create table crawl_pages (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid not null references organizations(id) on delete cascade,
  crawl_run_id  uuid not null references crawl_runs(id) on delete cascade,
  website_id    uuid not null references websites(id) on delete cascade,
  url           text not null,
  final_url     text,
  status_code   int,
  content_type  text,
  depth         int,
  title         text,
  meta_description text,
  canonical_url text,
  indexable     boolean,
  response_ms   int,
  bytes         int,
  content_hash  text,
  created_at    timestamptz not null default now()
);

create table page_links (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid not null references organizations(id) on delete cascade,
  crawl_run_id  uuid not null references crawl_runs(id) on delete cascade,
  source_url    text not null,
  target_url    text not null,
  anchor_text   text,
  rel           text,
  is_internal   boolean not null default true,
  http_status   int,
  created_at    timestamptz not null default now()
);

create table page_versions (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references organizations(id) on delete cascade,
  website_id   uuid not null references websites(id) on delete cascade,
  url          text not null,
  content_hash text not null,
  html         text,
  captured_at  timestamptz not null default now()
);

-- ── tasks & plans ──────────────────────────────────────────────────────────
create table seo_tasks (
  id             uuid primary key default uuid_generate_v4(),
  workspace_id   uuid not null references organizations(id) on delete cascade,
  website_id     uuid references websites(id) on delete set null,
  requested_by   uuid references auth.users(id),
  task_type      text not null,
  raw_instruction text not null,
  parsed_plan    jsonb,
  mode           seo_mode not null default 'audit',
  risk_level     seo_risk not null default 'low',
  status         seo_task_status not null default 'parsed',
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

-- ── previews / candidates / approvals / revisions ──────────────────────────
create table seo_previews (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references organizations(id) on delete cascade,
  task_id      uuid not null references seo_tasks(id) on delete cascade,
  website_id   uuid not null references websites(id) on delete cascade,
  content_hash text not null,
  status       preview_status not null default 'open',
  expires_at   timestamptz not null,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create table preview_items (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references organizations(id) on delete cascade,
  preview_id   uuid not null references seo_previews(id) on delete cascade,
  url          text not null,
  before_text  text,
  after_text   text,
  detail       jsonb,
  created_at   timestamptz not null default now()
);

create table link_candidates (
  id             uuid primary key default uuid_generate_v4(),
  workspace_id   uuid not null references organizations(id) on delete cascade,
  task_id        uuid references seo_tasks(id) on delete cascade,
  source_url     text not null,
  target_url     text not null,
  proposed_anchor text,
  confidence     numeric(4,3),
  score_components jsonb,
  reason         text,
  created_at     timestamptz not null default now()
);

create table seo_approvals (
  id                     uuid primary key default uuid_generate_v4(),
  workspace_id           uuid not null references organizations(id) on delete cascade,
  preview_id             uuid not null references seo_previews(id) on delete cascade,
  website_id             uuid not null references websites(id) on delete cascade,
  approved_by            uuid references auth.users(id),
  approved_revision_hash text not null,
  approved_at            timestamptz not null default now(),
  expires_at             timestamptz not null
);

create table revisions (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid not null references organizations(id) on delete cascade,
  website_id    uuid not null references websites(id) on delete cascade,
  preview_id    uuid references seo_previews(id) on delete set null,
  revision_hash text not null,
  status        text not null default 'proposed',
  applied_at    timestamptz,
  rolled_back_at timestamptz,
  created_at    timestamptz not null default now()
);

create table revision_items (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references organizations(id) on delete cascade,
  revision_id  uuid not null references revisions(id) on delete cascade,
  url          text not null,
  before_html  text,
  after_html   text,
  applied      boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ── external SEO (backlinks / outreach) ────────────────────────────────────
create table backlink_prospects (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references organizations(id) on delete cascade,
  website_id   uuid not null references websites(id) on delete cascade,
  domain       text not null,
  url          text,
  reason       text,
  stage        text not null default 'prospect',
  created_at   timestamptz not null default now()
);

create table outreach_drafts (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references organizations(id) on delete cascade,
  prospect_id  uuid references backlink_prospects(id) on delete cascade,
  subject      text,
  body         text,
  status       text not null default 'draft',
  created_at   timestamptz not null default now()
);

create table outreach_events (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references organizations(id) on delete cascade,
  draft_id     uuid references outreach_drafts(id) on delete cascade,
  event        text not null,
  detail       jsonb,
  created_at   timestamptz not null default now()
);

-- ── audit log ──────────────────────────────────────────────────────────────
create table audit_logs (
  id             uuid primary key default uuid_generate_v4(),
  workspace_id   uuid not null references organizations(id) on delete cascade,
  user_id        uuid references auth.users(id),
  action         text not null,
  resource_type  text not null,
  resource_id    text,
  input_hash     text,
  result_summary text not null,
  ip_address     text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

-- ── indexes ──────────────────────────────────────────────────────────────
create index on websites (workspace_id);
create index on crawl_runs (workspace_id, website_id, status);
create index on crawl_pages (workspace_id, crawl_run_id);
create index on crawl_pages (website_id, url);
create index on page_links (crawl_run_id, is_internal);
create index on seo_tasks (workspace_id, status);
create index on seo_previews (workspace_id, status);
create index on link_candidates (task_id);
create index on audit_logs (workspace_id, created_at);

-- ── Row-Level Security ──────────────────────────────────────────────────────
-- Reuse is_org_member() from 0001. Every SEO table keys on workspace_id.
do $$
declare t text;
begin
  foreach t in array array[
    'websites','website_settings','protected_urls','seo_connections',
    'crawl_runs','crawl_pages','page_links','page_versions','seo_tasks',
    'seo_previews','preview_items','link_candidates','seo_approvals',
    'revisions','revision_items','backlink_prospects','outreach_drafts',
    'outreach_events','audit_logs'
  ] loop
    execute format('alter table %I enable row level security;', t);
  end loop;
end $$;

-- website_settings has no workspace_id column; scope it through its website.
create policy ws_settings_rw on website_settings
  using (exists (select 1 from websites w
                 where w.id = website_settings.website_id and is_org_member(w.workspace_id)))
  with check (exists (select 1 from websites w
                 where w.id = website_settings.website_id and is_org_member(w.workspace_id)));

create policy purls_rw on protected_urls
  using (exists (select 1 from websites w
                 where w.id = protected_urls.website_id and is_org_member(w.workspace_id)))
  with check (exists (select 1 from websites w
                 where w.id = protected_urls.website_id and is_org_member(w.workspace_id)));

-- The rest all carry workspace_id directly.
do $$
declare t text;
begin
  foreach t in array array[
    'websites','seo_connections','crawl_runs','crawl_pages','page_links',
    'page_versions','seo_tasks','seo_previews','preview_items',
    'link_candidates','seo_approvals','revisions','revision_items',
    'backlink_prospects','outreach_drafts','outreach_events'
  ] loop
    execute format(
      'create policy %1$s_rw on %1$I using (is_org_member(workspace_id)) with check (is_org_member(workspace_id));',
      t
    );
  end loop;
end $$;

-- Audit logs are append-only. Members may SELECT and INSERT their workspace's
-- rows; there is no UPDATE or DELETE policy, so RLS denies both — history
-- cannot be quietly rewritten. (Service-role bypasses RLS by design; keep the
-- service key server-only.)
create policy audit_select on audit_logs for select using (is_org_member(workspace_id));
create policy audit_insert on audit_logs for insert with check (is_org_member(workspace_id));
