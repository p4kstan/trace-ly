/**
 * Custom hooks for the Integrations page (gateways + destinations + Meta pixels).
 * Centralizes all React Query logic so pages stay focused on UI/UX.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ONE_DAY_AGO = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

// ── Gateway integrations ─────────────────────────────────
export function useGatewayIntegrations(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["gateway_integrations", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("gateway_integrations")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });
}

export function useCreateGatewayIntegration(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: { provider: string; name: string; environment: string; fieldValues: Record<string, string> }) => {
      if (!workspaceId) throw new Error("No workspace");
      const credentials = form.fieldValues.credentials || form.fieldValues.apiSecret || null;
      const webhookSecret = form.fieldValues.webhookSecret || null;
      const extraSettings = Object.fromEntries(
        Object.entries(form.fieldValues).filter(
          ([key, value]) => !["credentials", "webhookSecret", "apiSecret"].includes(key) && value
        )
      );
      const { error } = await supabase.from("gateway_integrations").insert({
        workspace_id: workspaceId,
        provider: form.provider,
        name: form.name,
        credentials_encrypted: credentials,
        webhook_secret_encrypted: webhookSecret,
        settings_json: Object.keys(extraSettings).length > 0 ? extraSettings : null,
        environment: form.environment,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gateway_integrations"] });
      toast.success("Integração criada com sucesso!");
    },
    onError: (e) => toast.error(String(e)),
  });
}

export function useToggleGatewayIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("gateway_integrations")
        .update({ status: status === "active" ? "inactive" : "active" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gateway_integrations"] });
      toast.success("Status atualizado");
    },
  });
}

export function useDeleteGatewayIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gateway_integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gateway_integrations"] });
      toast.success("Integração removida");
    },
  });
}

// ── Conversion destinations (Google Ads / TikTok / GA4 / Firebase) ──
export function useDestinations(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["integration_destinations", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("integration_destinations")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });
}

export function useToggleDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("integration_destinations")
        .update({ is_active: !isActive })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integration_destinations"] });
      toast.success("Status atualizado");
    },
  });
}

export function useDeleteDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("integration_destinations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integration_destinations"] });
      toast.success("Destino removido");
    },
  });
}

export function useCreateDestination(workspaceId: string | undefined, onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      provider: string;
      destinationId: string;
      displayName: string;
      accessToken?: string;
      testEventCode?: string;
      configJson: Record<string, string>;
    }) => {
      if (!workspaceId) throw new Error("No workspace");
      if (!input.destinationId) throw new Error("ID do destino é obrigatório");
      const { error } = await supabase.from("integration_destinations").insert({
        workspace_id: workspaceId,
        provider: input.provider,
        destination_id: input.destinationId,
        display_name: input.displayName,
        access_token_encrypted: input.accessToken || null,
        config_json: input.configJson,
        test_event_code: input.testEventCode || null,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integration_destinations"] });
      onDone?.();
    },
    onError: (e) => toast.error(String(e)),
  });
}

// ── Aggregated delivery stats per destination (last 24h) ─
export function useDeliveryStats(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["destination_delivery_stats", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("event_deliveries")
        .select("provider, destination, status")
        .eq("workspace_id", workspaceId!)
        .gte("created_at", ONE_DAY_AGO());
      const stats = new Map<string, { delivered: number; failed: number }>();
      for (const d of data || []) {
        const key = `${d.provider}::${d.destination}`;
        const s = stats.get(key) || { delivered: 0, failed: 0 };
        if (d.status === "delivered") s.delivered++;
        else s.failed++;
        stats.set(key, s);
      }
      return stats;
    },
  });
}

// ── Meta pixels (legacy table, separate from destinations) ──
export function useMetaPixels(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["meta_pixels_count", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("meta_pixels")
        .select("id, pixel_id, is_active")
        .eq("workspace_id", workspaceId!);
      return data || [];
    },
  });
}

// ── Webhook health & logs (per gateway integration) ──────
export function useIntegrationHealth(integrationId: string | undefined) {
  return useQuery({
    queryKey: ["integration_health", integrationId],
    enabled: !!integrationId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [recentRes, errorRes] = await Promise.all([
        supabase
          .from("gateway_webhook_logs")
          .select("received_at, processing_status")
          .eq("gateway_integration_id", integrationId!)
          .order("received_at", { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from("gateway_webhook_logs")
          .select("id", { count: "exact", head: true })
          .eq("gateway_integration_id", integrationId!)
          .in("processing_status", ["failed", "rejected"])
          .gte("received_at", ONE_DAY_AGO()),
      ]);
      return {
        lastEvent: recentRes.data?.received_at || null,
        errorsLast24h: errorRes.count || 0,
      };
    },
  });
}

export function useWebhookLogs(integrationId: string | undefined) {
  return useQuery({
    queryKey: ["webhook_logs", integrationId],
    enabled: !!integrationId,
    queryFn: async () => {
      const { data } = await supabase
        .from("gateway_webhook_logs")
        .select("id, received_at, event_type, processing_status, error_message")
        .eq("gateway_integration_id", integrationId!)
        .order("received_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  });
}
