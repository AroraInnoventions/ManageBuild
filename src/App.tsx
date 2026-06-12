import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CirclePlus,
  Filter,
  Gauge,
  LogOut,
  Search,
  ShieldCheck,
  Trash2,
  Users
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { laneLabels, priorityLabels, systemRoleLabels } from "./lib/labels";
import { sampleProjects, sampleTasks } from "./lib/sampleData";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { BuildTask, FlowMetric, Lane, Priority, Project, ProjectMember, lanes } from "./lib/types";

const priorityOrder: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

const priorityClass: Record<Priority, string> = {
  critical: "priorityCritical",
  high: "priorityHigh",
  medium: "priorityMedium",
  low: "priorityLow"
};

type NewTaskFields = {
  title: string;
  description: string;
  lane: Lane;
  priority: Priority;
  storyPoints: number;
  dependencyId: string;
};

type DbProject = {
  id: string;
  customer_id: string;
  name: string;
  code: string;
  description: string;
  status: Project["status"];
};

type DbCustomer = {
  id: string;
  name: string;
};

type DbProfile = {
  id: string;
  full_name: string;
  email: string;
  global_role: ProjectMember["systemRole"];
};

type DbProjectMember = {
  project_id: string;
  user_id: string;
  system_role: ProjectMember["systemRole"];
  lane_roles: Lane[];
};

type DbTask = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  lane: Lane;
  priority: Priority;
  assignee_id: string | null;
  story_points: number;
  has_impediment: boolean;
  impediment_text: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

type DbTaskDependency = {
  task_id: string;
  depends_on_task_id: string;
};

const emptyTask: NewTaskFields = {
  title: "",
  description: "",
  lane: "requirements",
  priority: "medium",
  storyPoints: 3,
  dependencyId: "none"
};

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState(sampleProjects[0].id);
  const [projects, setProjects] = useState<Project[]>(sampleProjects);
  const [tasks, setTasks] = useState<BuildTask[]>(sampleTasks);
  const [query, setQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [newTask, setNewTask] = useState<NewTaskFields>(emptyTask);
  const [email, setEmail] = useState("");
  const [editingImpedimentTaskId, setEditingImpedimentTaskId] = useState<string | null>(null);
  const [impedimentDraft, setImpedimentDraft] = useState("");

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    void loadBoard();
  }, [session]);

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  const activeProjectTasks = activeProject ? tasks.filter((task) => task.projectId === activeProject.id) : [];
  const projectTasks = activeProjectTasks
    .filter((task) => {
      const text = `${task.title} ${task.description} ${task.assigneeName ?? ""}`.toLowerCase();
      const matchesQuery = text.includes(query.toLowerCase());
      const matchesAssignee = assigneeFilter === "all" || task.assigneeId === assigneeFilter;
      return matchesQuery && matchesAssignee;
    })
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const metrics = useMemo<FlowMetric[]>(() => {
    const accepted = activeProjectTasks.filter((task) => task.lane === "accept").length;
    const total = activeProjectTasks.length || 1;
    return [
      { label: "Cycle time", value: "Live", trend: "from DB" },
      { label: "Throughput", value: `${accepted}`, trend: "accepted cards" },
      {
        label: "Impediments",
        value: `${activeProjectTasks.filter((task) => task.hasImpediment).length}`,
        trend: "active"
      },
      { label: "Acceptance rate", value: `${Math.round((accepted / total) * 100)}%`, trend: "current project" }
    ];
  }, [activeProjectTasks]);

  const laneTotals = useMemo(
    () =>
      lanes.reduce<Record<Lane, { cards: number; points: number; impediments: number }>>((totals, lane) => {
        const laneTasks = projectTasks.filter((task) => task.lane === lane);
        totals[lane] = {
          cards: laneTasks.length,
          points: laneTasks.reduce((sum, task) => sum + task.storyPoints, 0),
          impediments: laneTasks.filter((task) => task.hasImpediment).length
        };
        return totals;
      }, {} as Record<Lane, { cards: number; points: number; impediments: number }>),
    [projectTasks]
  );

  const requirementOptions = activeProjectTasks.filter((task) => task.lane === "requirements");
  const isDbMode = Boolean(supabase && session);

  async function loadBoard() {
    if (!supabase) return;
    setDataLoading(true);
    setError(null);

    try {
      const { error: bootstrapError } = await supabase.rpc("corp_bootstrap_current_user");
      if (bootstrapError) throw bootstrapError;

      const [
        projectsResult,
        customersResult,
        membersResult,
        profilesResult,
        tasksResult,
        dependenciesResult
      ] = await Promise.all([
        supabase.from("corp_projects").select("id, customer_id, name, code, description, status").order("created_at"),
        supabase.from("corp_customers").select("id, name"),
        supabase.from("corp_project_members").select("project_id, user_id, system_role, lane_roles"),
        supabase.from("corp_profiles").select("id, full_name, email, global_role"),
        supabase.from("corp_tasks").select("*").order("created_at", { ascending: false }),
        supabase.from("corp_task_dependencies").select("task_id, depends_on_task_id")
      ]);

      for (const result of [
        projectsResult,
        customersResult,
        membersResult,
        profilesResult,
        tasksResult,
        dependenciesResult
      ]) {
        if (result.error) throw result.error;
      }

      const customerById = new Map((customersResult.data as DbCustomer[]).map((customer) => [customer.id, customer]));
      const profileById = new Map((profilesResult.data as DbProfile[]).map((profile) => [profile.id, profile]));
      const membersByProject = new Map<string, ProjectMember[]>();

      for (const member of membersResult.data as DbProjectMember[]) {
        const profile = profileById.get(member.user_id);
        const projectMembers = membersByProject.get(member.project_id) ?? [];
        projectMembers.push({
          id: member.user_id,
          name: profile?.full_name ?? "Unknown user",
          email: profile?.email ?? "",
          roles: member.lane_roles,
          systemRole: member.system_role
        });
        membersByProject.set(member.project_id, projectMembers);
      }

      const dependencyIdsByTask = new Map<string, string[]>();
      for (const dependency of dependenciesResult.data as DbTaskDependency[]) {
        const ids = dependencyIdsByTask.get(dependency.task_id) ?? [];
        ids.push(dependency.depends_on_task_id);
        dependencyIdsByTask.set(dependency.task_id, ids);
      }

      const nextProjects = (projectsResult.data as DbProject[]).map((project) => ({
        id: project.id,
        customerId: project.customer_id,
        customerName: customerById.get(project.customer_id)?.name ?? "Unknown customer",
        name: project.name,
        code: project.code,
        description: project.description,
        status: project.status,
        members: membersByProject.get(project.id) ?? []
      }));

      const nextTasks = (tasksResult.data as DbTask[]).map((task) => {
        const assignee = task.assignee_id ? profileById.get(task.assignee_id) : null;
        return {
          id: task.id,
          projectId: task.project_id,
          title: task.title,
          description: task.description,
          lane: task.lane,
          priority: task.priority,
          assigneeId: task.assignee_id,
          assigneeName: assignee?.full_name ?? null,
          storyPoints: Number(task.story_points),
          hasImpediment: task.has_impediment,
          impedimentText: task.impediment_text,
          dependencyIds: dependencyIdsByTask.get(task.id) ?? [],
          dueDate: task.due_date,
          createdAt: task.created_at,
          updatedAt: task.updated_at
        };
      });

      setProjects(nextProjects);
      setTasks(nextTasks);
      setActiveProjectId((current) => {
        if (nextProjects.some((project) => project.id === current)) return current;
        return nextProjects[0]?.id ?? "";
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load board data.");
    } finally {
      setDataLoading(false);
    }
  }

  function findTask(taskId: string) {
    return tasks.find((task) => task.id === taskId);
  }

  function getUnresolvedDependencies(task: BuildTask) {
    return task.dependencyIds
      .map((dependencyId) => findTask(dependencyId))
      .filter((dependency): dependency is BuildTask => dependency !== undefined && dependency.lane !== "accept");
  }

  function getDependentTasks(task: BuildTask) {
    return activeProjectTasks.filter((candidate) => candidate.dependencyIds.includes(task.id));
  }

  async function moveTask(taskId: string, direction: -1 | 1) {
    const task = findTask(taskId);
    if (!task) return;
    if (direction === 1 && getUnresolvedDependencies(task).length > 0) return;

    const currentIndex = lanes.indexOf(task.lane);
    const nextLane = lanes[currentIndex + direction];
    if (!nextLane) return;

    setTasks((current) =>
      current.map((candidate) =>
        candidate.id === taskId ? { ...candidate, lane: nextLane, updatedAt: new Date().toISOString() } : candidate
      )
    );

    if (supabase && session) {
      const { error: updateError } = await supabase
        .from("corp_tasks")
        .update({ lane: nextLane, accepted_at: nextLane === "accept" ? new Date().toISOString() : null })
        .eq("id", taskId);
      if (updateError) {
        setError(updateError.message);
        await loadBoard();
      }
    }
  }

  function openImpedimentEditor(task: BuildTask) {
    setEditingImpedimentTaskId(task.id);
    setImpedimentDraft(task.impedimentText ?? "");
  }

  async function clearImpediment(taskId: string) {
    setEditingImpedimentTaskId((current) => (current === taskId ? null : current));
    setImpedimentDraft("");
    setTasks((current) =>
      current.map((candidate) =>
        candidate.id === taskId
          ? { ...candidate, hasImpediment: false, impedimentText: null, updatedAt: new Date().toISOString() }
          : candidate
      )
    );

    if (supabase && session) {
      const { error: updateError } = await supabase
        .from("corp_tasks")
        .update({ has_impediment: false, impediment_text: null })
        .eq("id", taskId);
      if (updateError) {
        setError(updateError.message);
        await loadBoard();
      }
    }
  }

  async function saveImpediment(taskId: string) {
    const text = impedimentDraft.trim();
    if (!text) return;

    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              hasImpediment: true,
              impedimentText: text,
              updatedAt: new Date().toISOString()
            }
          : task
      )
    );
    setEditingImpedimentTaskId(null);
    setImpedimentDraft("");

    if (supabase && session) {
      const { error: updateError } = await supabase
        .from("corp_tasks")
        .update({ has_impediment: true, impediment_text: text })
        .eq("id", taskId);
      if (updateError) {
        setError(updateError.message);
        await loadBoard();
      }
    }
  }

  function handleImpedimentAction(taskId: string) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;

    if (task.hasImpediment) {
      void clearImpediment(taskId);
      return;
    }

    openImpedimentEditor(task);
  }

  async function deleteTask(taskId: string) {
    setTasks((current) => current.filter((task) => task.id !== taskId));

    if (supabase && session) {
      const { error: deleteError } = await supabase.from("corp_tasks").delete().eq("id", taskId);
      if (deleteError) {
        setError(deleteError.message);
        await loadBoard();
      }
    }
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProject) return;
    const title = newTask.title.trim();
    if (!title) return;

    const fallbackTask: BuildTask = {
      id: crypto.randomUUID(),
      projectId: activeProject.id,
      title,
      description: newTask.description.trim() || "No description yet.",
      lane: newTask.lane,
      priority: newTask.priority,
      assigneeId: activeProject.members[0]?.id ?? session?.user.id ?? null,
      assigneeName: activeProject.members[0]?.name ?? session?.user.email ?? null,
      storyPoints: newTask.storyPoints,
      hasImpediment: false,
      impedimentText: null,
      dependencyIds: newTask.dependencyId === "none" ? [] : [newTask.dependencyId],
      dueDate: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!supabase || !session) {
      setTasks((current) => [fallbackTask, ...current]);
      setNewTask(emptyTask);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("corp_tasks")
      .insert({
        project_id: activeProject.id,
        title,
        description: fallbackTask.description,
        lane: newTask.lane,
        priority: newTask.priority,
        assignee_id: session.user.id,
        story_points: newTask.storyPoints,
        created_by: session.user.id
      })
      .select("id")
      .single();

    if (insertError) {
      setError(insertError.message);
      return;
    }

    if (newTask.dependencyId !== "none") {
      const { error: dependencyError } = await supabase.from("corp_task_dependencies").insert({
        task_id: data.id,
        depends_on_task_id: newTask.dependencyId,
        created_by: session.user.id
      });
      if (dependencyError) {
        setError(dependencyError.message);
      }
    }

    setNewTask(emptyTask);
    await loadBoard();
  }

  async function signInWithGoogle() {
    if (!supabase) return;
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin
      }
    });
    if (signInError) setError(signInError.message);
  }

  async function signInWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !email.trim()) return;

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin
      }
    });

    if (signInError) {
      setError(signInError.message);
      return;
    }

    setError("Check your email for the sign-in link.");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProjects(sampleProjects);
    setTasks(sampleTasks);
  }

  if (authLoading) {
    return <main className="startupError">Loading Manage Build...</main>;
  }

  if (isSupabaseConfigured && !session) {
    return (
      <main className="authScreen">
        <section className="authPanel">
          <div className="brandMark">MB</div>
          <h1>Manage Build</h1>
          <p>Sign in to manage real projects, tasks, dependencies, and impediments from Supabase.</p>
          <form className="authForm" onSubmit={signInWithEmail}>
            <input
              aria-label="Email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
            <button type="submit">Email sign-in link</button>
          </form>
          <button onClick={signInWithGoogle} type="button">
            Continue with Google
          </button>
          {error ? <span>{error}</span> : null}
        </section>
      </main>
    );
  }

  if (!activeProject) {
    return <main className="startupError">No projects found.</main>;
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">MB</div>
          <div>
            <h1>Manage Build</h1>
            <p>{isDbMode ? "Supabase live" : "Local demo mode"}</p>
          </div>
        </div>

        <section className="panel">
          <div className="panelHeader">
            <Users size={18} />
            <h2>Projects</h2>
          </div>
          <div className="projectList">
            {projects.map((project) => (
              <button
                className={project.id === activeProject.id ? "projectButton active" : "projectButton"}
                key={project.id}
                onClick={() => {
                  setActiveProjectId(project.id);
                  setAssigneeFilter("all");
                  setQuery("");
                }}
                type="button"
              >
                <span>{project.code}</span>
                <strong>{project.name}</strong>
                <small>{project.customerName}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <ShieldCheck size={18} />
            <h2>Access</h2>
          </div>
          <div className="memberList">
            {activeProject.members.map((member) => (
              <div className="member" key={member.id}>
                <div>
                  <strong>{member.name}</strong>
                  <small>{systemRoleLabels[member.systemRole]}</small>
                </div>
                <div className="roleChips">
                  {member.roles.map((role) => (
                    <span key={role}>{laneLabels[role]}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeProject.customerName}</p>
            <h2>{activeProject.name}</h2>
            <p>{activeProject.description}</p>
          </div>
          <div className="topbarActions">
            {isDbMode ? (
              <button className="iconTextButton" onClick={signOut} type="button">
                <LogOut size={18} />
                Sign out
              </button>
            ) : null}
            <div className="searchBox">
              <Search size={18} />
              <input
                aria-label="Search work items"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search cards"
                value={query}
              />
            </div>
            <label className="selectBox">
              <Filter size={18} />
              <select
                aria-label="Filter by assignee"
                onChange={(event) => setAssigneeFilter(event.target.value)}
                value={assigneeFilter}
              >
                <option value="all">All assignees</option>
                {activeProject.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        {error ? <div className="appNotice">{error}</div> : null}
        {dataLoading ? <div className="appNotice">Syncing with Supabase...</div> : null}

        <section className="metrics" aria-label="Agile performance metrics">
          {metrics.map((metric) => (
            <article className="metric" key={metric.label}>
              <Gauge size={18} />
              <div>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.trend}</small>
              </div>
            </article>
          ))}
        </section>

        <form className="quickAdd" onSubmit={addTask}>
          <CirclePlus size={20} />
          <input
            aria-label="New card title"
            onChange={(event) => setNewTask((current) => ({ ...current, title: event.target.value }))}
            placeholder="Add a work item"
            value={newTask.title}
          />
          <input
            aria-label="New card description"
            onChange={(event) => setNewTask((current) => ({ ...current, description: event.target.value }))}
            placeholder="Short description"
            value={newTask.description}
          />
          <select
            aria-label="New card lane"
            onChange={(event) => setNewTask((current) => ({ ...current, lane: event.target.value as Lane }))}
            value={newTask.lane}
          >
            {lanes.map((lane) => (
              <option key={lane} value={lane}>
                {laneLabels[lane]}
              </option>
            ))}
          </select>
          <select
            aria-label="New card priority"
            onChange={(event) => setNewTask((current) => ({ ...current, priority: event.target.value as Priority }))}
            value={newTask.priority}
          >
            {Object.entries(priorityLabels).map(([priority, label]) => (
              <option key={priority} value={priority}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="New card dependency"
            onChange={(event) => setNewTask((current) => ({ ...current, dependencyId: event.target.value }))}
            value={newTask.dependencyId}
          >
            <option value="none">No dependency</option>
            {requirementOptions.map((task) => (
              <option key={task.id} value={task.id}>
                Depends on: {task.title}
              </option>
            ))}
          </select>
          <button type="submit">Add</button>
        </form>

        <section className="board" aria-label="Kanban board">
          {lanes.map((lane) => {
            const laneTasks = projectTasks.filter((task) => task.lane === lane);
            const totals = laneTotals[lane];
            return (
              <article className="lane" key={lane}>
                <header className="laneHeader">
                  <div>
                    <h3>{laneLabels[lane]}</h3>
                    <p>
                      {totals.cards} cards - {totals.points} pts
                    </p>
                  </div>
                  {totals.impediments > 0 ? (
                    <span className="impedimentPill">{totals.impediments} impediment</span>
                  ) : null}
                </header>

                <div className="cards">
                  {laneTasks.map((task) => {
                    const unresolvedDependencies = getUnresolvedDependencies(task);
                    const dependentTasks = getDependentTasks(task);
                    const hasUnresolvedDependencies = unresolvedDependencies.length > 0;

                    return (
                      <article className="taskCard" key={task.id}>
                        <div className="taskTopline">
                          <span className={priorityClass[task.priority]}>{task.priority}</span>
                          <small>{task.storyPoints} pts</small>
                        </div>
                        <h4>{task.title}</h4>
                        <p>{task.description}</p>
                        {task.dependencyIds.length > 0 ? (
                          <div className="dependencyBox dependencyBlocked">
                            <strong>Blocked by</strong>
                            {task.dependencyIds.map((dependencyId) => {
                              const dependency = findTask(dependencyId);
                              return <span key={dependencyId}>{dependency?.title ?? "Missing requirement"}</span>;
                            })}
                          </div>
                        ) : null}
                        {dependentTasks.length > 0 ? (
                          <div className="dependencyBox dependencyFeeds">
                            <strong>Blocks</strong>
                            {dependentTasks.map((dependentTask) => (
                              <span key={dependentTask.id}>{dependentTask.title}</span>
                            ))}
                          </div>
                        ) : null}
                        {task.hasImpediment ? (
                          <div className="impedimentBox">
                            <strong>Impediment</strong>
                            <span>{task.impedimentText}</span>
                          </div>
                        ) : null}
                        {editingImpedimentTaskId === task.id ? (
                          <form
                            className="impedimentEditor"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void saveImpediment(task.id);
                            }}
                          >
                            <label htmlFor={`impediment-${task.id}`}>Impediment</label>
                            <textarea
                              autoFocus
                              id={`impediment-${task.id}`}
                              onChange={(event) => setImpedimentDraft(event.target.value)}
                              placeholder="What is preventing progress?"
                              rows={3}
                              value={impedimentDraft}
                            />
                            <div className="impedimentEditorActions">
                              <button disabled={!impedimentDraft.trim()} type="submit">
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingImpedimentTaskId(null);
                                  setImpedimentDraft("");
                                }}
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : null}
                        <div className="taskMeta">
                          <span>{task.assigneeName ?? "Unassigned"}</span>
                          {task.dueDate ? <span>Due {new Date(task.dueDate).toLocaleDateString()}</span> : null}
                        </div>
                        <div className="taskActions">
                          <button
                            aria-label={`Move ${task.title} left`}
                            disabled={lanes.indexOf(task.lane) === 0}
                            onClick={() => void moveTask(task.id, -1)}
                            title="Move left"
                            type="button"
                          >
                            <ArrowLeft size={16} />
                          </button>
                          <button
                            aria-label={task.hasImpediment ? `Clear impediment for ${task.title}` : `Add impediment for ${task.title}`}
                            className={task.hasImpediment ? "impedimentButton active" : "impedimentButton"}
                            onClick={() => handleImpedimentAction(task.id)}
                            title={task.hasImpediment ? "Clear impediment" : "Add impediment"}
                            type="button"
                          >
                            <AlertTriangle size={16} />
                          </button>
                          <button
                            aria-label={`Move ${task.title} right`}
                            disabled={lanes.indexOf(task.lane) === lanes.length - 1 || hasUnresolvedDependencies}
                            onClick={() => void moveTask(task.id, 1)}
                            title={hasUnresolvedDependencies ? "Resolve dependencies first" : "Move right"}
                            type="button"
                          >
                            {task.lane === "accept" ? <CheckCircle2 size={16} /> : <ArrowRight size={16} />}
                          </button>
                          <button
                            aria-label={`Delete ${task.title}`}
                            onClick={() => void deleteTask(task.id)}
                            title="Delete"
                            type="button"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
