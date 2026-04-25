/**
 * Passo U — Workspace selector hook.
 *
 * Returns the list of workspaces the current user belongs to (own + member),
 * plus a localStorage-backed `activeWorkspaceId` selector. When the user has
 * exactly one workspace, the existing single-workspace UX is preserved (the
 * selector simply doesn't render).
 *
 * No PII is stored in localStorage — only the workspace UUID.
 */
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "active_workspace_id";

export interface WorkspaceListItem {
  id: string;
  name: string | null;
  slug: string | null;
  role: "owner" | "admin" | "member" | "viewer" | null;
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces-list"],
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceListItem[]> => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return [];

      // Owned workspaces (always at least the default one created by handle_new_user).
      const { data: owned } = await supabase
        .from("workspaces")
        .select("id,name,slug,owner_user_id")
        .eq("owner_user_id", uid);

      // Membership-derived workspaces (may include the same rows or others).
      const { data: members } = await supabase
        .from("workspace_members")
        .select("workspace_id,role,workspaces:workspace_id(name,slug)")
        .eq("user_id", uid);

      const map = new Map<string, WorkspaceListItem>();
      for (const w of owned ?? []) {
        map.set(w.id, { id: w.id, name: w.name, slug: w.slug, role: "owner" });
      }
      for (const m of members ?? []) {
        const wsId = (m as { workspace_id: string }).workspace_id;
        const ws = (m as { workspaces?: { name?: string | null; slug?: string | null } }).workspaces;
        const role = ((m as { role?: string }).role ?? "member") as WorkspaceListItem["role"];
        if (!map.has(wsId)) {
          map.set(wsId, {
            id: wsId,
            name: ws?.name ?? null,
            slug: ws?.slug ?? null,
            role,
          });
        }
      }
      return Array.from(map.values()).sort((a, b) =>
        (a.name ?? a.id).localeCompare(b.name ?? b.id),
      );
    },
  });
}

/**
 * Tracks the active workspace UUID in localStorage. When the stored value is
 * missing or no longer in the workspaces list, falls back to the first item.
 *
 * Returns `[activeId, setActiveId, options]` so callers can render a selector
 * only when there is more than one workspace (preserving the legacy UX).
 */
export function useActiveWorkspaceId(workspaces: WorkspaceListItem[] | undefined) {
  const [activeId, setActiveIdState] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
  });

  // Reconcile against the latest workspaces list — pick first if stored id is invalid.
  useEffect(() => {
    if (!workspaces || workspaces.length === 0) return;
    const valid = workspaces.some((w) => w.id === activeId);
    if (!valid) {
      const fallback = workspaces[0].id;
      setActiveIdState(fallback);
      try { window.localStorage.setItem(STORAGE_KEY, fallback); } catch { /* ignore */ }
    }
  }, [workspaces, activeId]);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
  }, []);

  return { activeId, setActiveId, count: workspaces?.length ?? 0 };
}
