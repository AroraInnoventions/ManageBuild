import { FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CirclePlus,
  Filter,
  Gauge,
  Search,
  ShieldCheck,
  Users
} from "lucide-react";
import { laneLabels, priorityLabels, systemRoleLabels } from "./lib/labels";
import { sampleMetrics, sampleProjects, sampleTasks } from "./lib/sampleData";
import { isSupabaseConfigured } from "./lib/supabase";
import { BuildTask, Lane, Priority, lanes } from "./lib/types";

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

const emptyTask: NewTaskFields = {
  title: "",
  description: "",
  lane: "requirements",
  priority: "medium",
  storyPoints: 3,
  dependencyId: "none"
};

export function App() {
  const [activeProjectId, setActiveProjectId] = useState(sampleProjects[0].id);
  const [tasks, setTasks] = useState<BuildTask[]>(sampleTasks);
  const [query, setQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [newTask, setNewTask] = useState<NewTaskFields>(emptyTask);
  const [editingImpedimentTaskId, setEditingImpedimentTaskId] = useState<string | null>(null);
  const [impedimentDraft, setImpedimentDraft] = useState("");

  const activeProject = sampleProjects.find((project) => project.id === activeProjectId) ?? sampleProjects[0];
  const activeProjectTasks = tasks.filter((task) => task.projectId === activeProject.id);
  const projectTasks = activeProjectTasks
    .filter((task) => {
      const text = `${task.title} ${task.description} ${task.assigneeName ?? ""}`.toLowerCase();
      const matchesQuery = text.includes(query.toLowerCase());
      const matchesAssignee = assigneeFilter === "all" || task.assigneeId === assigneeFilter;
      return matchesQuery && matchesAssignee;
    })
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

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

  function moveTask(taskId: string, direction: -1 | 1) {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) return task;
        if (direction === 1 && getUnresolvedDependencies(task).length > 0) return task;
        const currentIndex = lanes.indexOf(task.lane);
        const nextLane = lanes[currentIndex + direction];
        return nextLane ? { ...task, lane: nextLane, updatedAt: new Date().toISOString() } : task;
      })
    );
  }

  function openImpedimentEditor(task: BuildTask) {
    setEditingImpedimentTaskId(task.id);
    setImpedimentDraft(task.impedimentText ?? "");
  }

  function clearImpediment(taskId: string) {
    setEditingImpedimentTaskId((current) => (current === taskId ? null : current));
    setImpedimentDraft("");
    setTasks((current) =>
      current.map((candidate) =>
        candidate.id === taskId
          ? { ...candidate, hasImpediment: false, impedimentText: null, updatedAt: new Date().toISOString() }
          : candidate
      )
    );
  }

  function saveImpediment(taskId: string) {
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
  }

  function handleImpedimentAction(taskId: string) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;

    if (task.hasImpediment) {
      clearImpediment(taskId);
      return;
    }

    openImpedimentEditor(task);
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTask.title.trim();
    if (!title) return;

    setTasks((current) => [
      {
        id: crypto.randomUUID(),
        projectId: activeProject.id,
        title,
        description: newTask.description.trim() || "No description yet.",
        lane: newTask.lane,
        priority: newTask.priority,
        assigneeId: activeProject.members[0]?.id ?? null,
        assigneeName: activeProject.members[0]?.name ?? null,
        storyPoints: newTask.storyPoints,
        hasImpediment: false,
        impedimentText: null,
        dependencyIds: newTask.dependencyId === "none" ? [] : [newTask.dependencyId],
        dueDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      ...current
    ]);
    setNewTask(emptyTask);
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">MB</div>
          <div>
            <h1>Manage Build</h1>
            <p>{isSupabaseConfigured ? "Supabase connected" : "Local demo mode"}</p>
          </div>
        </div>

        <section className="panel">
          <div className="panelHeader">
            <Users size={18} />
            <h2>Projects</h2>
          </div>
          <div className="projectList">
            {sampleProjects.map((project) => (
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

        <section className="metrics" aria-label="Agile performance metrics">
          {sampleMetrics.map((metric) => (
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
                          <span className={priorityClass[task.priority]}>{priorityLabels[task.priority]}</span>
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
                              saveImpediment(task.id);
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
                            onClick={() => moveTask(task.id, -1)}
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
                            onClick={() => moveTask(task.id, 1)}
                            title={hasUnresolvedDependencies ? "Resolve dependencies first" : "Move right"}
                            type="button"
                          >
                            {task.lane === "accept" ? <CheckCircle2 size={16} /> : <ArrowRight size={16} />}
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
