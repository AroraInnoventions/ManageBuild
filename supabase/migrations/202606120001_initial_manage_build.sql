create type public.corp_lane_role as enum ('requirements', 'design', 'develop', 'test', 'accept');
create type public.corp_system_role as enum ('superadmin', 'customer_admin', 'project_admin', 'member');
create type public.corp_project_status as enum ('active', 'paused', 'complete');
create type public.corp_task_priority as enum ('low', 'medium', 'high', 'critical');

create table public.corp_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  global_role public.corp_system_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.corp_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.corp_customer_members (
  customer_id uuid not null references public.corp_customers(id) on delete cascade,
  user_id uuid not null references public.corp_profiles(id) on delete cascade,
  role public.corp_system_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (customer_id, user_id)
);

create table public.corp_projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.corp_customers(id) on delete cascade,
  name text not null,
  code text not null,
  description text not null default '',
  status public.corp_project_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, code)
);

create table public.corp_project_members (
  project_id uuid not null references public.corp_projects(id) on delete cascade,
  user_id uuid not null references public.corp_profiles(id) on delete cascade,
  system_role public.corp_system_role not null default 'member',
  lane_roles public.corp_lane_role[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.corp_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.corp_projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  lane public.corp_lane_role not null default 'requirements',
  priority public.corp_task_priority not null default 'medium',
  assignee_id uuid references public.corp_profiles(id) on delete set null,
  story_points numeric(6, 2) not null default 1 check (story_points >= 0),
  has_impediment boolean not null default false,
  impediment_text text,
  due_date date,
  accepted_at timestamptz,
  created_by uuid references public.corp_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (has_impediment = false and impediment_text is null)
    or (has_impediment = true and nullif(btrim(impediment_text), '') is not null)
  )
);

create table public.corp_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.corp_tasks(id) on delete cascade,
  actor_id uuid references public.corp_profiles(id) on delete set null,
  from_lane public.corp_lane_role,
  to_lane public.corp_lane_role,
  event_type text not null check (event_type in ('created', 'moved', 'impediment_added', 'impediment_cleared', 'assigned', 'accepted')),
  created_at timestamptz not null default now()
);

create table public.corp_task_dependencies (
  task_id uuid not null references public.corp_tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.corp_tasks(id) on delete cascade,
  dependency_type text not null default 'blocks' check (dependency_type in ('blocks', 'relates_to')),
  created_by uuid references public.corp_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create index corp_tasks_project_lane_idx on public.corp_tasks (project_id, lane);
create index corp_tasks_assignee_idx on public.corp_tasks (assignee_id);
create index corp_task_dependencies_depends_on_idx on public.corp_task_dependencies (depends_on_task_id);
create index corp_project_members_user_idx on public.corp_project_members (user_id);
create index corp_customer_members_user_idx on public.corp_customer_members (user_id);

create or replace function public.corp_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger corp_profiles_touch_updated_at before update on public.corp_profiles
for each row execute function public.corp_touch_updated_at();

create trigger corp_customers_touch_updated_at before update on public.corp_customers
for each row execute function public.corp_touch_updated_at();

create trigger corp_projects_touch_updated_at before update on public.corp_projects
for each row execute function public.corp_touch_updated_at();

create trigger corp_tasks_touch_updated_at before update on public.corp_tasks
for each row execute function public.corp_touch_updated_at();

create or replace function public.corp_is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.corp_profiles
    where id = auth.uid()
      and global_role = 'superadmin'
  );
$$;

create or replace function public.corp_can_access_customer(target_customer_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.corp_is_superadmin()
    or exists (
      select 1
      from public.corp_customer_members cm
      where cm.customer_id = target_customer_id
        and cm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.corp_project_members pm
      join public.corp_projects p on p.id = pm.project_id
      where p.customer_id = target_customer_id
        and pm.user_id = auth.uid()
    );
$$;

create or replace function public.corp_can_access_project(target_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.corp_is_superadmin()
    or exists (
      select 1
      from public.corp_project_members pm
      where pm.project_id = target_project_id
        and pm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.corp_customer_members cm
      join public.corp_projects p on p.customer_id = cm.customer_id
      where p.id = target_project_id
        and cm.user_id = auth.uid()
        and cm.role = 'customer_admin'
    );
$$;

create or replace function public.corp_can_admin_project(target_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.corp_is_superadmin()
    or exists (
      select 1
      from public.corp_project_members pm
      where pm.project_id = target_project_id
        and pm.user_id = auth.uid()
        and pm.system_role = 'project_admin'
    )
    or exists (
      select 1
      from public.corp_customer_members cm
      join public.corp_projects p on p.customer_id = cm.customer_id
      where p.id = target_project_id
        and cm.user_id = auth.uid()
        and cm.role = 'customer_admin'
    );
$$;

create or replace function public.corp_has_lane_role(target_project_id uuid, target_lane public.corp_lane_role)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.corp_can_admin_project(target_project_id)
    or exists (
      select 1
      from public.corp_project_members pm
      where pm.project_id = target_project_id
        and pm.user_id = auth.uid()
        and target_lane = any(pm.lane_roles)
    );
$$;

alter table public.corp_profiles enable row level security;
alter table public.corp_customers enable row level security;
alter table public.corp_customer_members enable row level security;
alter table public.corp_projects enable row level security;
alter table public.corp_project_members enable row level security;
alter table public.corp_tasks enable row level security;
alter table public.corp_task_events enable row level security;
alter table public.corp_task_dependencies enable row level security;

create policy "profiles readable by self and shared projects"
on public.corp_profiles for select
using (
  id = auth.uid()
  or public.corp_is_superadmin()
  or exists (
    select 1
    from public.corp_project_members mine
    join public.corp_project_members theirs on theirs.project_id = mine.project_id
    where mine.user_id = auth.uid()
      and theirs.user_id = corp_profiles.id
  )
);

create policy "profiles self update"
on public.corp_profiles for update
using (id = auth.uid() or public.corp_is_superadmin())
with check (id = auth.uid() or public.corp_is_superadmin());

create policy "customers project scoped read"
on public.corp_customers for select
using (public.corp_can_access_customer(id));

create policy "customers superadmin write"
on public.corp_customers for all
using (public.corp_is_superadmin())
with check (public.corp_is_superadmin());

create policy "customer members scoped read"
on public.corp_customer_members for select
using (public.corp_can_access_customer(customer_id));

create policy "customer members admin write"
on public.corp_customer_members for all
using (
  public.corp_is_superadmin()
  or exists (
    select 1
    from public.corp_customer_members cm
    where cm.customer_id = corp_customer_members.customer_id
      and cm.user_id = auth.uid()
      and cm.role = 'customer_admin'
  )
)
with check (
  public.corp_is_superadmin()
  or exists (
    select 1
    from public.corp_customer_members cm
    where cm.customer_id = corp_customer_members.customer_id
      and cm.user_id = auth.uid()
      and cm.role = 'customer_admin'
  )
);

create policy "projects scoped read"
on public.corp_projects for select
using (public.corp_can_access_project(id));

create policy "projects admin write"
on public.corp_projects for all
using (
  public.corp_is_superadmin()
  or exists (
    select 1
    from public.corp_customer_members cm
    where cm.customer_id = corp_projects.customer_id
      and cm.user_id = auth.uid()
      and cm.role = 'customer_admin'
  )
)
with check (
  public.corp_is_superadmin()
  or exists (
    select 1
    from public.corp_customer_members cm
    where cm.customer_id = corp_projects.customer_id
      and cm.user_id = auth.uid()
      and cm.role = 'customer_admin'
  )
);

create policy "project members scoped read"
on public.corp_project_members for select
using (public.corp_can_access_project(project_id));

create policy "project members admin write"
on public.corp_project_members for all
using (public.corp_can_admin_project(project_id))
with check (public.corp_can_admin_project(project_id));

create policy "tasks scoped read"
on public.corp_tasks for select
using (public.corp_can_access_project(project_id));

create policy "tasks lane create"
on public.corp_tasks for insert
with check (public.corp_has_lane_role(project_id, lane));

create policy "tasks lane update"
on public.corp_tasks for update
using (public.corp_can_access_project(project_id))
with check (public.corp_has_lane_role(project_id, lane));

create policy "tasks admin delete"
on public.corp_tasks for delete
using (public.corp_can_admin_project(project_id));

create policy "task events scoped read"
on public.corp_task_events for select
using (
  exists (
    select 1
    from public.corp_tasks t
    where t.id = corp_task_events.task_id
      and public.corp_can_access_project(t.project_id)
  )
);

create policy "task events scoped insert"
on public.corp_task_events for insert
with check (
  exists (
    select 1
    from public.corp_tasks t
    where t.id = corp_task_events.task_id
      and public.corp_can_access_project(t.project_id)
  )
);

create policy "task dependencies scoped read"
on public.corp_task_dependencies for select
using (
  exists (
    select 1
    from public.corp_tasks t
    where t.id = corp_task_dependencies.task_id
      and public.corp_can_access_project(t.project_id)
  )
);

create policy "task dependencies scoped write"
on public.corp_task_dependencies for all
using (
  exists (
    select 1
    from public.corp_tasks t
    where t.id = corp_task_dependencies.task_id
      and public.corp_can_admin_project(t.project_id)
  )
)
with check (
  exists (
    select 1
    from public.corp_tasks t
    join public.corp_tasks dependency on dependency.id = corp_task_dependencies.depends_on_task_id
    where t.id = corp_task_dependencies.task_id
      and t.project_id = dependency.project_id
      and public.corp_can_admin_project(t.project_id)
  )
);

create view public.corp_project_flow_metrics as
select
  p.id as project_id,
  count(t.id) as total_cards,
  count(t.id) filter (where t.has_impediment) as impediment_cards,
  count(t.id) filter (where t.lane = 'accept') as accepted_cards,
  coalesce(sum(t.story_points), 0) as total_points,
  coalesce(sum(t.story_points) filter (where t.lane = 'accept'), 0) as accepted_points,
  percentile_cont(0.5) within group (
    order by extract(epoch from (coalesce(t.accepted_at, now()) - t.created_at)) / 86400
  ) filter (where t.lane = 'accept') as median_cycle_days
from public.corp_projects p
left join public.corp_tasks t on t.project_id = p.id
group by p.id;

create view public.corp_user_lane_workload as
select
  t.project_id,
  t.assignee_id,
  t.lane,
  count(*) as cards,
  coalesce(sum(t.story_points), 0) as story_points,
  count(*) filter (where t.has_impediment) as impediment_cards
from public.corp_tasks t
where t.assignee_id is not null
group by t.project_id, t.assignee_id, t.lane;
