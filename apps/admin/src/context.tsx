import { createContext, useContext } from "react";
import type {
  User,
  RecordData,
  Module,
} from "../../../packages/shared/src/index.ts";
export type Workspace = {
  user: User;
  company: { code: string; name: string };
  users: (User & { version: number })[];
  policies: Record<string, number>;
  modules: Module[];
  records: Record<string, RecordData[]>;
  inventory: any[];
  activeShift: any;
};
export const WorkspaceContext = createContext<{
  workspace: Workspace;
  refresh: () => Promise<void>;
  notify: (text: string) => void;
  version: number;
}>(null!);
export const useWorkspace = () => useContext(WorkspaceContext);
export function label(workspace: Workspace, key: string, value: any): string {
  if (value === undefined || value === null || value === "") return "—";
  if (["assignedTo", "jointWith", "recipientId", "ownerId"].includes(key))
    return workspace.users.find((u) => u.id === value)?.name || value;
  const list = Object.values(workspace.records).flat();
  if (typeof value === "string") {
    const r = list.find((r) => r.id === value);
    if (r) return r.name || r.title || value;
  }
  if (Array.isArray(value))
    return value
      .map((x) =>
        typeof x === "string" ? label(workspace, key, x) : JSON.stringify(x),
      )
      .join(", ");
  return String(value);
}
