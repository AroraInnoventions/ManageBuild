import type { BuildTask, FlowMetric, Project } from "./types";

export const sampleProjects: Project[] = [
  {
    id: "project-river-house",
    customerId: "customer-arora",
    customerName: "Arora Innovations",
    name: "River House Remodel",
    code: "RHR",
    description: "Kitchen, structure, and final acceptance workflow.",
    status: "active",
    members: [
      {
        id: "user-rohit",
        name: "Rohit Arora",
        email: "rohit@example.com",
        roles: ["requirements", "design", "develop", "test", "accept"],
        systemRole: "superadmin"
      },
      {
        id: "user-maya",
        name: "Maya Shah",
        email: "maya@example.com",
        roles: ["requirements", "accept"],
        systemRole: "customer_admin"
      },
      {
        id: "user-eli",
        name: "Eli Carter",
        email: "eli@example.com",
        roles: ["design", "develop", "test"],
        systemRole: "project_admin"
      }
    ]
  },
  {
    id: "project-market-fitout",
    customerId: "customer-northline",
    customerName: "Northline Foods",
    name: "Market Fit-out",
    code: "MFO",
    description: "Tenant improvement project with staged sign-off.",
    status: "active",
    members: [
      {
        id: "user-rohit",
        name: "Rohit Arora",
        email: "rohit@example.com",
        roles: ["requirements", "design", "develop", "test", "accept"],
        systemRole: "superadmin"
      },
      {
        id: "user-jules",
        name: "Jules Moreno",
        email: "jules@example.com",
        roles: ["requirements", "test", "accept"],
        systemRole: "project_admin"
      }
    ]
  }
];

export const sampleTasks: BuildTask[] = [
  {
    id: "task-1",
    projectId: "project-river-house",
    title: "Capture cabinet finish requirements",
    description: "Confirm color, hardware, and approval photos with the customer.",
    lane: "requirements",
    priority: "high",
    assigneeId: "user-maya",
    assigneeName: "Maya Shah",
    storyPoints: 3,
    hasImpediment: false,
    impedimentText: null,
    dependencyIds: [],
    dueDate: "2026-06-18",
    createdAt: "2026-06-10T14:00:00Z",
    updatedAt: "2026-06-12T12:30:00Z"
  },
  {
    id: "task-6",
    projectId: "project-river-house",
    title: "Approve appliance cut sheet requirements",
    description: "Finalize appliance dimensions before cabinet finish decisions can be approved.",
    lane: "requirements",
    priority: "critical",
    assigneeId: "user-maya",
    assigneeName: "Maya Shah",
    storyPoints: 2,
    hasImpediment: false,
    impedimentText: null,
    dependencyIds: ["task-1"],
    dueDate: "2026-06-16",
    createdAt: "2026-06-11T14:00:00Z",
    updatedAt: "2026-06-12T13:15:00Z"
  },
  {
    id: "task-2",
    projectId: "project-river-house",
    title: "Issue structural opening detail",
    description: "Engineer-approved beam note and field measurement package.",
    lane: "design",
    priority: "critical",
    assigneeId: "user-eli",
    assigneeName: "Eli Carter",
    storyPoints: 8,
    hasImpediment: true,
    impedimentText: "Waiting on engineer response before design can proceed.",
    dependencyIds: ["task-6"],
    dueDate: "2026-06-14",
    createdAt: "2026-06-07T14:00:00Z",
    updatedAt: "2026-06-12T08:20:00Z"
  },
  {
    id: "task-3",
    projectId: "project-river-house",
    title: "Rough-in plumbing inspection prep",
    description: "Verify fixture locations and attach photos before inspector visit.",
    lane: "develop",
    priority: "medium",
    assigneeId: "user-eli",
    assigneeName: "Eli Carter",
    storyPoints: 5,
    hasImpediment: false,
    impedimentText: null,
    dependencyIds: [],
    dueDate: "2026-06-21",
    createdAt: "2026-06-08T14:00:00Z",
    updatedAt: "2026-06-11T16:45:00Z"
  },
  {
    id: "task-4",
    projectId: "project-river-house",
    title: "Punch list smoke test",
    description: "Walk the room, mark misses, and decide what can move to acceptance.",
    lane: "test",
    priority: "medium",
    assigneeId: "user-rohit",
    assigneeName: "Rohit Arora",
    storyPoints: 2,
    hasImpediment: false,
    impedimentText: null,
    dependencyIds: [],
    dueDate: "2026-06-23",
    createdAt: "2026-06-09T14:00:00Z",
    updatedAt: "2026-06-12T10:00:00Z"
  },
  {
    id: "task-5",
    projectId: "project-market-fitout",
    title: "Confirm refrigerated case requirements",
    description: "Document power, drainage, and delivery timing.",
    lane: "requirements",
    priority: "high",
    assigneeId: "user-jules",
    assigneeName: "Jules Moreno",
    storyPoints: 5,
    hasImpediment: false,
    impedimentText: null,
    dependencyIds: [],
    dueDate: "2026-06-20",
    createdAt: "2026-06-12T09:00:00Z",
    updatedAt: "2026-06-12T09:00:00Z"
  }
];

export const sampleMetrics: FlowMetric[] = [
  { label: "Cycle time", value: "4.8d", trend: "down 12%" },
  { label: "Throughput", value: "18/wk", trend: "up 4" },
  { label: "Impediments", value: "1", trend: "needs attention" },
  { label: "Acceptance rate", value: "91%", trend: "stable" }
];
