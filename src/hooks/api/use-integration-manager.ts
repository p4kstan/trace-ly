/**
 * useIntegrationManager — orchestrates everything the Integrations page
 * needs: gateway CRUD, destinations CRUD, search filtering, webhook URL
 * helpers and the test-event flow. Keeps the page presentation-only.
 */
import { useMemo, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  useGatewayIntegrations,
  useCreateGatewayIntegration,
  useToggleGatewayIntegration,
  useDeleteGatewayIntegration,
  useDestinations,
  useToggleDestination,
  useDeleteDestination,
  useDeliveryStats,
  useMetaPixels,
} from "./use-integrations";

interface CreateGatewayForm {
  provider: string;
  name: string;
  environment: string;
  fieldValues: Record<string, string>;
}

function buildTestPayload(provider: string): Record<string, unknown> {
  const base = {
    event: "test_event",
    id: `test_${Date.now()}`,
    status: "approved",
    customer: { name: "Teste Usuario", email: "teste@exemplo.com", phone: "11999999999" },
    amount: 9990,
    currency: "BRL",
  };
  switch (provider) {
    case "stripe":
      return {
        type: "payment_intent.succeeded",
        id: `evt_test_${Date.now()}`,
        data: {
          object: {
            id: `pi_test`, amount: 9990, currency: "usd", status: "succeeded",
            customer_details: { email: "test@example.com", name: "Test User" },
          },
        },
      };
    case "hotmart":
      return {
        event: "PURCHASE_COMPLETE",
        hottok: "test",
        data: {
          buyer: { email: "teste@exemplo.com", name: "Teste" },
          purchase: {
            transaction: `ht_test_${Date.now()}`,
            status: "COMPLETE",
            price: { value: 99.9, currency_value: "BRL" },
            payment: { type: "CREDIT_CARD" },
          },
          product: { name: "Produto Teste", id: "12345" },
        },
      };
    default:
      return { ...base, event: "order_paid" };
  }
}

export function useIntegrationManager(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

  const integrationsQ = useGatewayIntegrations(workspaceId);
  const createMutation = useCreateGatewayIntegration(workspaceId);
  const toggleMutation = useToggleGatewayIntegration();
  const deleteMutation = useDeleteGatewayIntegration();

  const destinationsQ = useDestinations(workspaceId);
  const toggleDestination = useToggleDestination();
  const deleteDestination = useDeleteDestination();
  const deliveryStatsQ = useDeliveryStats(workspaceId);
  const metaPixelsQ = useMetaPixels(workspaceId);

  const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL;

  const getWebhookUrl = useCallback(
    (integrationId: string, provider: string): string =>
      `${supabaseUrl}/functions/v1/gateway-webhook?workspace_id=${workspaceId ?? ""}&provider=${provider}&integration_id=${integrationId}`,
    [supabaseUrl, workspaceId],
  );

  const copyWebhookUrl = useCallback(
    (integrationId: string, provider: string): void => {
      navigator.clipboard.writeText(getWebhookUrl(integrationId, provider));
      toast.success("URL do webhook copiada!");
    },
    [getWebhookUrl],
  );

  const testWebhook = useCallback(
    async (integrationId: string, provider: string): Promise<void> => {
      setTestingId(integrationId);
      try {
        const testPayload = buildTestPayload(provider);
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-test-mode": "1",
        };
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
        const res = await fetch(getWebhookUrl(integrationId, provider), {
          method: "POST",
          headers,
          body: JSON.stringify(testPayload),
        });
        const data = await res.json();
        if (res.ok) {
          toast.success("Teste enviado!", { description: `Evento: ${data.internal_event ?? "ok"}` });
          queryClient.invalidateQueries({ queryKey: ["webhook_logs", integrationId] });
          queryClient.invalidateQueries({ queryKey: ["integration_health", integrationId] });
        } else {
          toast.error("Erro no teste", { description: data.error ?? "Falha" });
        }
      } catch {
        toast.error("Erro de rede");
      } finally {
        setTestingId(null);
      }
    },
    [getWebhookUrl, queryClient],
  );

  const createGateway = useCallback(
    (form: CreateGatewayForm, onDone: () => void): void => {
      createMutation.mutate(form, { onSuccess: () => onDone() });
    },
    [createMutation],
  );

  // Filtered lists (search applies to gateway + destination names)
  const filteredIntegrations = useMemo(() => {
    const list = integrationsQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (i) => i.name?.toLowerCase().includes(q) || i.provider?.toLowerCase().includes(q),
    );
  }, [integrationsQ.data, search]);

  const filteredDestinations = useMemo(() => {
    const list = destinationsQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (d) =>
        d.display_name?.toLowerCase().includes(q) ||
        d.provider?.toLowerCase().includes(q) ||
        d.destination_id?.toLowerCase().includes(q),
    );
  }, [destinationsQ.data, search]);

  return {
    // search
    search, setSearch,
    // gateways
    integrations: filteredIntegrations,
    integrationsLoading: integrationsQ.isLoading,
    createMutation,
    createGateway,
    toggleMutation,
    deleteMutation,
    // destinations
    destinations: filteredDestinations,
    destinationsLoading: destinationsQ.isLoading,
    toggleDestination,
    deleteDestination,
    deliveryStats: deliveryStatsQ.data,
    metaPixels: metaPixelsQ.data ?? [],
    // webhook helpers
    supabaseUrl,
    getWebhookUrl,
    copyWebhookUrl,
    testWebhook,
    testingId,
  };
}
