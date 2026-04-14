import { TrackingHubGuide } from "@/components/TrackingHubGuide";

export default function TrackingGuide() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary">Guia do Tracking Hub</h1>
        <p className="text-sm text-muted-foreground">
          Passo a passo completo para configurar coleta, distribuição e monitoramento de eventos
        </p>
      </div>
      <TrackingHubGuide variant="full" />
    </div>
  );
}
