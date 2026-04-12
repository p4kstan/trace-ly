import { supabase } from "@/integrations/supabase/client";

/** Get the current user's workspace */
export async function getCurrentWorkspace() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Update workspace name */
export async function updateWorkspaceName(workspaceId: string, name: string) {
  const { error } = await supabase
    .from("workspaces")
    .update({ name })
    .eq("id", workspaceId);

  if (error) throw error;
}
