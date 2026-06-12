export const lanes = ["requirements", "design", "develop", "test", "accept"] as const;

export type Lane = (typeof lanes)[number];

export type LaneRole = Lane;

export type SystemRole = "superadmin" | "customer_admin" | "project_admin" | "member";

export type Priority = "low" | "medium" | "high" | "critical";

export type BuildTask = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  lane: Lane;
  priority: Priority;
  assigneeId: string | null;
  assigneeName: string | null;
  storyPoints: number;
  hasImpediment: boolean;
  impedimentText: string | null;
  dependencyIds: string[];
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMember = {
  id: string;
  name: string;
  email: string;
  roles: LaneRole[];
  systemRole: SystemRole;
};

export type Project = {
  id: string;
  customerId: string;
  customerName: string;
  name: string;
  code: string;
  description: string;
  status: "active" | "paused" | "complete";
  members: ProjectMember[];
};

export type FlowMetric = {
  label: string;
  value: string;
  trend: string;
};
