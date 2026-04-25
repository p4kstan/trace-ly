// Tiny hook to fetch the caller's role within a workspace.
// Returns 'owner' | 'admin' | 'member' | null.
// Workspaces.owner_user_id always wins; falls back to workspace_members.role.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceRole = "owner" | "admin" | "member" | null;

export function useWorkspaceRole(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["workspace-role", workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceRole> => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return null;

      // Owner check.
      const { data: ws } = await supabase
        .from("workspaces")
        .select("owner_user_id")
        .eq("id", workspaceId!)
        .maybeSingle();
      if (ws?.owner_user_id === uid) return "owner";

      // Membership role.
      const { data: mem } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId!)
        .eq("user_id", uid)
        .maybeSingle();
      const role = (mem?.role as WorkspaceRole) || null;
      if (role === "owner" || role === "admin" || role === "member") return role;
      return null;
    },
  });
}

export function canEditRateLimitConfigs(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}
