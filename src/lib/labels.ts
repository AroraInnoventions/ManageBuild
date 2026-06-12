import type { Lane, Priority, SystemRole } from "./types";

export const laneLabels: Record<Lane, string> = {
  requirements: "Requirements",
  design: "Design",
  develop: "Develop",
  test: "Test",
  accept: "Accept"
};

export const priorityLabels: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical"
};

export const systemRoleLabels: Record<SystemRole, string> = {
  superadmin: "Superadmin",
  customer_admin: "Customer admin",
  project_admin: "Project admin",
  member: "Member"
};
