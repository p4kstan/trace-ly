/**
 * IntegrationSearch — top-level search input for filtering both gateways
 * and destinations on the Integrations page.
 */
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface IntegrationSearchProps {
  value: string;
  onChange: (v: string) => void;
}

export function IntegrationSearch({ value, onChange }: IntegrationSearchProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        placeholder="Buscar por nome, provedor ou ID…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}
