/**
 * CampaignSettings — targeting (bid modifiers, schedule, locations) +
 * change history view for the Google Ads Campaign Detail page.
 */
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CampaignDataTable as SimpleTable } from "@/components/dashboard/CampaignDataTable";

interface QueryLike {
  isLoading: boolean;
  data?: { rows?: Array<Record<string, unknown>> } | undefined;
}

interface CampaignSettingsProps {
  bidModifiers: QueryLike;
  adSchedule: QueryLike;
  locationsTargeted: QueryLike;
  history: QueryLike;
}

export function CampaignSettings({
  bidModifiers,
  adSchedule,
  locationsTargeted,
  history,
}: CampaignSettingsProps) {
  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Ajustes de lance (Bid Modifiers)</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Modificadores aplicados a dispositivo, interação, etc. Ex: 1.20 = +20%.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <SimpleTable
            loading={bidModifiers.isLoading}
            rows={bidModifiers.data?.rows}
            columns={["name", "bid_modifier"]}
            labels={{ name: "Tipo", bid_modifier: "Modificador" }}
          />
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Programação de anúncios</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">Dias e horários em que a campanha está ativa.</p>
        </CardHeader>
        <CardContent className="p-0">
          <SimpleTable
            loading={adSchedule.isLoading}
            rows={adSchedule.data?.rows}
            columns={["name", "bid_modifier"]}
            labels={{ name: "Janela", bid_modifier: "Ajuste de lance" }}
          />
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Localizações segmentadas</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">Regiões alvo da campanha (positivas e negativas).</p>
        </CardHeader>
        <CardContent className="p-0">
          <SimpleTable
            loading={locationsTargeted.isLoading}
            rows={locationsTargeted.data?.rows}
            columns={["name", "negative", "bid_modifier"]}
            labels={{ name: "Local", negative: "Excluída", bid_modifier: "Ajuste" }}
          />
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="py-3"><CardTitle className="text-sm">Histórico de mudanças (últimos 30 dias)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {history.isLoading ? (
            <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : !history.data?.rows?.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma mudança registrada</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b border-border/50 bg-muted/20">
                  <tr>
                    <th className="text-left py-2.5 px-3 font-semibold">Data</th>
                    <th className="text-left py-2.5 px-2 font-semibold">Usuário</th>
                    <th className="text-left py-2.5 px-2 font-semibold">Operação</th>
                    <th className="text-left py-2.5 px-2 font-semibold">Recurso</th>
                    <th className="text-left py-2.5 px-2 font-semibold">Cliente</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.rows.map((r, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-2 px-3 font-mono text-[10px]">{String(r.change_date_time ?? "")}</td>
                      <td className="py-2 px-2">{String(r.user_email ?? "—")}</td>
                      <td className="py-2 px-2"><Badge variant="outline" className="text-[10px]">{String(r.operation ?? "")}</Badge></td>
                      <td className="py-2 px-2 font-mono text-[10px]">{String(r.resource_type ?? "")}</td>
                      <td className="py-2 px-2 text-[10px]">{String(r.client_type ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
