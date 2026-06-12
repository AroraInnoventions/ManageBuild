create type public.lane_role as enum ('requirements', 'design', 'develop', 'test', 'accept');
create type public.system_role as enum ('superadmin', 'customer_admin', 'project_admin', 'member');
create type public.project_status as enum ('active', 'paused', 'complete');
create type public.task_priority as enum ('low', 'medium', 'high', 'critical');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  global_role public.system_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_members (
  customer_id uuid not null references public.customers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.system_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (customer_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  code text not null,
  description text not null default '',
  status public.project_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, code)
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  system_role public.system_role not null default 'member',
  lane_roles public.lane_role[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  lane public.lane_role not null default 'requirements',
  priority public.task_priority not null default 'medium',
  assignee_id uuid references public.profiles(id) on delete set null,
  story_points numeric(6, 2) not null default 1 check (story_points >= 0),
  has_impediment boolean not null default false,
  impediment_text text,
  due_date date,
  accepted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (has_impediment = false and impediment_text is null)
    or (has_impediment = true and nullif(btrim(impediment_text), '') is not null)
  )
);

create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  from_lane public.lane_role,
  to_lane public.lane_role,
  event_type text not null check (event_type in ('created', 'moved', 'impediment_added', 'impediment_cleared', 'assigned', 'accepted')),
  created_at timestamptz not null default now()
);

create table public.task_dependencies (
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  dependency_type text not null default 'blocks' check (dependency_type in ('blocks', 'relates_to')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create index tasks_project_lane_idx on public.tasks (project_id, lane);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index task_dependencies_depends_on_idx on public.task_dependencies (depends_on_task_id);
create index project_members_user_idx on public.project_members (user_id);
create index customer_members_user_idx on public.customer_members (user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger customers_touch_updated_at before update on public.customers
for each row execute function public.touch_updated_at();

create trigger projects_touch_updated_at before update on public.projects
for each row execute function public.touch_updated_at();

create trigger tasks_touch_updated_at before update on public.tasks
for each row execute function public.touch_updated_at();

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and global_role = 'superadmin'
  );
$$;

create or replace function public.can_access_customer(target_customer_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_superadmin()
    or exists (
      select 1
      from public.customer_members cm
      where cm.customer_id = target_customer_id
        and cm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.project_members pm
      join public.projects p on p.id = pm.project_id
      where p.customer_id = target_customer_id
        and pm.user_id = auth.uid()
    );
$$;

create or replace function public.can_access_project(target_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_superadmin()
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = target_project_id
        and pm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.customer_members cm
      join public.projects p on p.customer_id = cm.customer_id
      where p.id = target_project_id
        and cm.user_id = auth.uid()
        and cm.role = 'customer_admin'
    );
$$;

create or replace function public.can_admin_project(target_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_superadmin()
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = target_project_id
        and pm.user_id = auth.uid()
        and pm.system_role = 'project_admin'
    )
    or exists (
      select 1
      from public.customer_members cm
      join public.projects p on p.customer_id = cm.customer_id
      where p.id = target_project_id
        and cm.user_id = auth.uid()
        and cm.role = 'customer_admin'
    );
$$;

create or replace function public.has_lane_role(target_project_id uuid, target_lane public.lane_role)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.can_admin_project(target_project_id)
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = target_project_id
        and pm.user_id = auth.uid()
        and target_lane = any(pm.lane_roles)
    );
$$;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.customer_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_events enable row level security;
alter table public.task_dependencies enable row level security;

create policy "profiles readable by self and shared projects"
on public.profiles for select
using (
  id = auth.uid()
  or public.is_superadmin()
  or exists (
    select 1
    from public.project_members mine
    join public.project_members theirs on theirs.project_id = mine.project_id
    where mine.user_id = auth.uid()
      and theirs.user_id = profiles.id
  )
);

create policy "profiles self update"
on public.profiles for update
using (id = auth.uid() or public.is_superadmin())
with check (id = auth.uid() or public.is_superadmin());

create policy "customers project scoped read"
on public.customers for select
using (public.can_access_customer(id));

create policy "customers superadmin write"
on public.customers for all
using (public.is_superadmin())
with check (public.is_superadmin());

create policy "customer members scoped read"
on public.customer_members for select
using (public.can_access_customer(customer_id));

create policy "customer members admin write"
on public.customer_members for all
using (
  public.is_superadmin()
  or exists (
    select 1
    from public.customer_members cm
    where cm.customer_id = customer_members.customer_id
      and cm.user_id = auth.uid()
      and cm.role = 'customer_admin'
  )
)
with check (
  public.is_superadmin()
  or exists (
    select 1
    from public.customer_members cm
    where cm.customer_id = customer_members.customer_id
      and cm.user_id = auth.uid()
      and cm.role = 'customer_admin'
  )
);

create policy "projects scoped read"
on public.projects for select
using (public.can_access_project(id));

create policy "projects admin write"
on public.projects for all
using (
  public.is_superadmin()
  or exists (
    select 1
    from public.customer_members cm
    where cm.customer_id = projects.customer_id
      and cm.user_id = auth.uid()
      and cm.role = 'customer_admin'
  )
)
with check (
  public.is_superadmin()
  or exists (
    select 1
    from public.customer_members cm
    where cm.customer_id = projects.customer_id
      and cm.user_id = auth.uid()
      and cm.role = 'customer_admin'
  )
);

create policy "project members scoped read"
on public.project_members for select
using (public.can_access_project(project_id));

create policy "project members admin write"
on public.project_members for all
using (public.can_admin_project(project_id))
with check (public.can_admin_project(project_id));

create policy "tasks scoped read"
on public.tasks for select
using (public.can_access_project(project_id));

create policy "tasks lane create"
on public.tasks for insert
with check (public.has_lane_role(project_id, lane));

create policy "tasks lane update"
on public.tasks for update
using (public.can_access_project(project_id))
with check (public.has_lane_role(project_id, lane));

create policy "tasks admin delete"
on public.tasks for delete
using (public.can_admin_project(project_id));

create policy "task events scoped read"
on public.task_events for select
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_events.task_id
      and public.can_access_project(t.project_id)
  )
);

create policy "task events scoped insert"
on public.task_events for insert
with check (
  exists (
    select 1
    from public.tasks t
    where t.id = task_events.task_id
      and public.can_access_project(t.project_id)
  )
);

create policy "task dependencies scoped read"
on public.task_dependencies for select
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_dependencies.task_id
      and public.can_access_project(t.project_id)
  )
);

create policy "task dependencies scoped write"
on public.task_dependencies for all
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_dependencies.task_id
      and public.can_admin_project(t.project_id)
  )
)
with check (
  exists (
    select 1
    from public.tasks t
    join public.tasks dependency on dependency.id = task_dependencies.depends_on_task_id
    where t.id = task_dependencies.task_id
      and t.project_id = dependency.project_id
      and public.can_admin_project(t.project_id)
  )
);

create view public.project_flow_metrics as
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
from public.projects p
left join public.tasks t on t.project_id = p.id
group by p.id;

create view public.user_lane_workload as
select
  t.project_id,
  t.assignee_id,
  t.lane,
  count(*) as cards,
  coalesce(sum(t.story_points), 0) as story_points,
  count(*) filter (where t.has_impediment) as impediment_cards
from public.tasks t
where t.assignee_id is not null
group by t.project_id, t.assignee_id, t.lane;
