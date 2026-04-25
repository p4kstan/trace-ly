/**
 * Passo U — Workspace selector chip.
 *
 * Renders a Select only when the user has more than one workspace.
 * For single-workspace users it displays a static label so the operator
 * still sees which workspace they are operating on.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";
import type { WorkspaceListItem } from "@/hooks/use-workspaces";

interface Props {
  workspaces: WorkspaceListItem[] | undefined;
  activeId: string | undefined;
  onChange: (id: string) => void;
}

export function WorkspaceSelector({ workspaces, activeId, onChange }: Props) {
  if (!workspaces || workspaces.length === 0) return null;
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  if (workspaces.length === 1) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" />
        <span>Workspace ativa:</span>
        <Badge variant="outline" className="font-mono text-[10px]">
          {active.name ?? active.id.slice(0, 8)}
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select value={active.id} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[260px]">
          <SelectValue placeholder="Selecione a workspace" />
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              <div className="flex items-center justify-between gap-3 w-full">
                <span>{w.name ?? w.id.slice(0, 8)}</span>
                {w.role && (
                  <Badge variant="outline" className="text-[10px]">
                    {w.role}
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
