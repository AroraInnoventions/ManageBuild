create or replace function public.corp_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.corp_profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email;

  return new;
end;
$$;

drop trigger if exists corp_on_auth_user_created on auth.users;

create trigger corp_on_auth_user_created
after insert on auth.users
for each row execute function public.corp_handle_new_user();

create or replace function public.corp_bootstrap_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  user_email text;
  user_name text;
  seed_customer_id uuid;
  seed_project_id uuid;
  requirement_1_id uuid;
  requirement_2_id uuid;
  design_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select
    u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))
  into user_email, user_name
  from auth.users u
  where u.id = current_user_id;

  insert into public.corp_profiles (id, full_name, email)
  values (current_user_id, user_name, user_email)
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email;

  if exists (
    select 1
    from public.corp_project_members pm
    where pm.user_id = current_user_id
  ) then
    return;
  end if;

  insert into public.corp_customers (name)
  values ('Sample Customer')
  returning id into seed_customer_id;

  insert into public.corp_customer_members (customer_id, user_id, role)
  values (seed_customer_id, current_user_id, 'customer_admin');

  insert into public.corp_projects (customer_id, name, code, description)
  values (
    seed_customer_id,
    'Sample Build Project',
    'SAMPLE',
    'Starter project with editable sample requirements, dependencies, and impediments.'
  )
  returning id into seed_project_id;

  insert into public.corp_project_members (project_id, user_id, system_role, lane_roles)
  values (
    seed_project_id,
    current_user_id,
    'project_admin',
    array['requirements', 'design', 'develop', 'test', 'accept']::public.corp_lane_role[]
  );

  insert into public.corp_tasks (
    project_id,
    title,
    description,
    lane,
    priority,
    assignee_id,
    story_points,
    due_date,
    created_by
  )
  values (
    seed_project_id,
    'Confirm scope and acceptance criteria',
    'Capture what must be true before this build can be accepted.',
    'requirements',
    'high',
    current_user_id,
    3,
    current_date + 7,
    current_user_id
  )
  returning id into requirement_1_id;

  insert into public.corp_tasks (
    project_id,
    title,
    description,
    lane,
    priority,
    assignee_id,
    story_points,
    due_date,
    created_by
  )
  values (
    seed_project_id,
    'Approve material selections',
    'Finalize selections that downstream design and development work depends on.',
    'requirements',
    'critical',
    current_user_id,
    5,
    current_date + 10,
    current_user_id
  )
  returning id into requirement_2_id;

  insert into public.corp_task_dependencies (task_id, depends_on_task_id, created_by)
  values (requirement_2_id, requirement_1_id, current_user_id);

  insert into public.corp_tasks (
    project_id,
    title,
    description,
    lane,
    priority,
    assignee_id,
    story_points,
    has_impediment,
    impediment_text,
    due_date,
    created_by
  )
  values (
    seed_project_id,
    'Draft build design package',
    'Prepare the first design package once material selections are approved.',
    'design',
    'medium',
    current_user_id,
    8,
    true,
    'Waiting for material selections to be approved.',
    current_date + 14,
    current_user_id
  )
  returning id into design_id;

  insert into public.corp_task_dependencies (task_id, depends_on_task_id, created_by)
  values (design_id, requirement_2_id, current_user_id);

  insert into public.corp_tasks (
    project_id,
    title,
    description,
    lane,
    priority,
    assignee_id,
    story_points,
    due_date,
    created_by
  )
  values
    (
      seed_project_id,
      'Start field work',
      'Execute the approved design package and keep progress visible.',
      'develop',
      'medium',
      current_user_id,
      8,
      current_date + 21,
      current_user_id
    ),
    (
      seed_project_id,
      'Run quality walkthrough',
      'Review completed work against acceptance criteria.',
      'test',
      'medium',
      current_user_id,
      3,
      current_date + 24,
      current_user_id
    );
end;
$$;

grant execute on function public.corp_bootstrap_current_user() to authenticated;
