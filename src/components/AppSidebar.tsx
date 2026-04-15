import {
  LayoutDashboard, GitBranch, MonitorDot, ScrollText, Bug, Settings,
  Zap, Brain, CreditCard, HeartPulse, Key, LogOut, ShoppingCart, Webhook, Inbox, BookOpen, Cpu, Gauge,
  Shield, TrendingUp, Lightbulb, Filter, Radio, Send, Code, FileText, HelpCircle,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace, useEventStats } from "@/hooks/use-tracking-data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Painel", url: "/", icon: LayoutDashboard },
  { title: "Tempo Real & ML", url: "/realtime", icon: Gauge },
  { title: "Insights IA", url: "/ai-analytics", icon: Brain },
  { title: "Predições", url: "/predictions", icon: TrendingUp },
  { title: "Otimização", url: "/optimization", icon: Lightbulb },
  { title: "Atribuição", url: "/attribution", icon: GitBranch },
  { title: "Funis", url: "/funnels", icon: Filter },
  { title: "Pedidos", url: "/orders", icon: ShoppingCart },
  { title: "Pixels", url: "/pixels", icon: MonitorDot },
  { title: "Logs de Eventos", url: "/logs", icon: ScrollText },
  { title: "Depurador", url: "/debugger", icon: Bug },
];

const trackingHubItems = [
  { title: "Fontes de Tracking", url: "/tracking-sources", icon: Radio },
  { title: "Destinos", url: "/destinations", icon: Send },
  { title: "Instalação SDK", url: "/sdk-setup", icon: Code },
  { title: "Logs de Integração", url: "/integration-logs", icon: FileText },
  
  { title: "Setup Facebook / Meta", url: "/setup-facebook", icon: Send },
  { title: "Setup Google (GA4+Ads)", url: "/setup-google", icon: Send },
  { title: "Guia de Setup", url: "/tracking-guide", icon: BookOpen },
];

const settingsItems = [
  { title: "Chaves API", url: "/api-keys", icon: Key },
  { title: "Integrações", url: "/integrations", icon: Zap },
  { title: "Logs Webhook", url: "/webhook-logs", icon: Webhook },
  { title: "Fila", url: "/queue", icon: Inbox },
  { title: "Tutoriais", url: "/tutorials", icon: BookOpen },
  { title: "MCP", url: "/mcp", icon: Cpu },
  { title: "Enterprise", url: "/enterprise", icon: Shield },
  { title: "Planos", url: "/plans", icon: CreditCard },
  { title: "Uso", url: "/usage", icon: Gauge },
  { title: "Configurações", url: "/settings", icon: Settings },
  { title: "Saúde do Sistema", url: "/system-diagnostic", icon: HeartPulse },
];

function SidebarNavGroup({ items, label, collapsed }: { items: typeof mainItems; label: string; collapsed: boolean }) {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40 px-3 mb-1">
        {!collapsed && label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={isActive(item.url)}>
                <NavLink
                  to={item.url}
                  end={item.url === "/"}
                  className="group flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60"
                  activeClassName="!bg-primary/10 !text-primary font-medium glow-border"
                >
                  <item.icon className="w-4 h-4 shrink-0 opacity-60 group-hover:opacity-100 group-hover:drop-shadow-[0_0_4px_hsl(199_89%_48%/0.3)] transition-all duration-300" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, signOut } = useAuth();
  const { data: workspace } = useWorkspace();
  const { data: stats } = useEventStats(workspace?.id);

  const { data: usageData } = useQuery({
    queryKey: ["sidebar-usage", workspace?.id],
    enabled: !!workspace?.id,
    refetchInterval: 60000,
    queryFn: async () => {
      const currentMonth = new Date().toISOString().substring(0, 7);
      const [{ data: usage }, { data: limit }] = await Promise.all([
        supabase.from("workspace_usage").select("event_count").eq("workspace_id", workspace!.id).eq("month", currentMonth).maybeSingle(),
        supabase.from("plan_limits").select("max_events_per_month").eq("plan_name", workspace!.plan || "free").maybeSingle(),
      ]);
      return {
        count: Number(usage?.event_count || 0),
        limit: Number(limit?.max_events_per_month || 10000),
      };
    },
  });

  const eventCount = usageData?.count || stats?.totalEvents || 0;
  const eventLimit = usageData?.limit || 10000;
  const eventPct = Math.min(100, Math.round((eventCount / eventLimit) * 100));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 border-b border-sidebar-border/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center relative gradient-border"
            style={{ background: 'hsl(199 89% 48% / 0.08)' }}>
            <Zap className="w-4 h-4 text-primary drop-shadow-[0_0_8px_hsl(199_89%_48%/0.5)]" />
          </div>
          {!collapsed && (
            <span className="text-base font-bold tracking-tight text-gradient-primary">
              CapiTrack AI
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarNavGroup items={mainItems} label="Análises" collapsed={collapsed} />
        <div className="my-3 mx-3 h-px bg-sidebar-border/30" />
        <SidebarNavGroup items={trackingHubItems} label="Hub de Tracking" collapsed={collapsed} />
        <div className="my-3 mx-3 h-px bg-sidebar-border/30" />
        <SidebarNavGroup items={settingsItems} label="Configurações" collapsed={collapsed} />
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border/40 space-y-2.5">
        {!collapsed && (
          <div className="rounded-lg bg-sidebar-accent/30 border border-border/20 p-3 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider capitalize">Plano {workspace?.plan || "Free"}</span>
              <span className="text-[10px] font-bold text-primary tabular-nums">
                {eventCount.toLocaleString()}/{eventLimit.toLocaleString()}
              </span>
            </div>
            <div className="w-full h-1 bg-muted/40 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${eventPct}%`,
                  background: 'linear-gradient(90deg, hsl(199 89% 48%), hsl(265 80% 60%))',
                }}
              />
            </div>
          </div>
        )}
        {user && !collapsed && (
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-all duration-200 w-full px-2 py-1.5 rounded-md hover:bg-sidebar-accent/40"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="truncate">Sair ({user.email?.split("@")[0]})</span>
          </button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
