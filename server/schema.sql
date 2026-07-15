-- i_luv_pen PostgreSQL schema
-- Supports community posts, comments, threaded replies, and @mentions.

create table if not exists users (
  id bigserial primary key,
  nickname text not null unique,
  password_hash text not null,
  profile_image text,
  created_at timestamptz not null default now()
);

alter table users
  add column if not exists password_hash text;

alter table users
  add column if not exists profile_image text;

create table if not exists community_posts (
  id text primary key,
  nickname text not null,
  topic text not null default 'General',
  title text not null,
  content text not null,
  image text,
  likes integer not null default 0,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

alter table community_posts
  add column if not exists topic text not null default 'General';

create table if not exists pen_items (
  id text primary key,
  name text not null,
  series text not null,
  year integer not null,
  release_month integer,
  price text,
  description text,
  description_long text,
  keywords jsonb not null default '[]'::jsonb,
  images jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table pen_items
  add column if not exists price text;

alter table pen_items
  add column if not exists release_month integer;

create table if not exists site_settings (
  setting_key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists news_posts (
  slug text primary key,
  title text not null,
  subtitle text,
  cover_image text,
  category text,
  tags jsonb not null default '[]'::jsonb,
  published_at timestamptz not null default now(),
  reading_time integer not null default 5,
  content text not null
);

create table if not exists comments (
  id text primary key,
  target_id text not null,
  nickname text not null,
  content text not null,
  image text,
  likes integer not null default 0,
  parent_id text references comments(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_comments_target_id on comments(target_id);
create index if not exists idx_comments_parent_id on comments(parent_id);

create table if not exists comment_mentions (
  id bigserial primary key,
  comment_id text not null references comments(id) on delete cascade,
  mentioned_nickname text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_comment_mentions_comment_id on comment_mentions(comment_id);
create index if not exists idx_comment_mentions_nickname on comment_mentions(mentioned_nickname);

create table if not exists admin_audit_logs (
  id bigserial primary key,
  actor_nickname text not null,
  action text not null,
  target_type text not null,
  target_id text not null default '',
  before_json jsonb,
  after_json jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_created_at on admin_audit_logs(created_at desc);
create index if not exists idx_admin_audit_logs_action on admin_audit_logs(action);
create index if not exists idx_admin_audit_logs_target on admin_audit_logs(target_type, target_id);
