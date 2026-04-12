import {
  LayoutDashboard, GitBranch, MonitorDot, ScrollText, Bug, Settings,
  Zap, Brain, CreditCard, HeartPulse, Key, LogOut, ShoppingCart, Webhook, Inbox, BookOpen, Cpu,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace, useEventStats } from "@/hooks/use-tracking-data";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Attribution", url: "/attribution", icon: GitBranch },
  { title: "Pixels", url: "/pixels", icon: MonitorDot },
  { title: "Orders", url: "/orders", icon: ShoppingCart },
  { title: "Event Logs", url: "/logs", icon: ScrollText },
  { title: "Debugger", url: "/debugger", icon: Bug },
  { title: "AI Analytics", url: "/ai-analytics", icon: Brain },
];

const settingsItems = [
  { title: "API Keys", url: "/api-keys", icon: Key },
  { title: "Integrations", url: "/integrations", icon: Zap },
  { title: "Webhook Logs", url: "/webhook-logs", icon: Webhook },
  { title: "Queue", url: "/queue", icon: Inbox },
  { title: "Tutorials", url: "/tutorials", icon: BookOpen },
  { title: "MCP", url: "/mcp", icon: Cpu },
  { title: "Plans", url: "/plans", icon: CreditCard },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "System Health", url: "/system-diagnostic", icon: HeartPulse },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const { user, signOut } = useAuth();
  const { data: workspace } = useWorkspace();
  const { data: stats } = useEventStats(workspace?.id);

  const eventCount = stats?.totalEvents || 0;
  const eventLimit = 10000;
  const eventPct = Math.min(100, Math.round((eventCount / eventLimit) * 100));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 border-b border-sidebar-border/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          {!collapsed && (
            <span className="text-base font-semibold tracking-tight text-gradient-primary">
              CapiTrack AI
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/50 px-3 mb-1">
            {!collapsed && "Analytics"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="group flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-150 text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60"
                      activeClassName="!bg-primary/10 !text-primary font-medium"
                    >
                      <item.icon className="w-4 h-4 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/50 px-3 mb-1">
            {!collapsed && "Settings"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      className="group flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-150 text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60"
                      activeClassName="!bg-primary/10 !text-primary font-medium"
                    >
                      <item.icon className="w-4 h-4 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border/60 space-y-2.5">
        {!collapsed && (
          <div className="rounded-lg bg-sidebar-accent/50 border border-border/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-muted-foreground">Free Plan</span>
              <span className="text-[11px] font-semibold text-primary tabular-nums">
                {eventCount.toLocaleString()}/{eventLimit.toLocaleString()}
              </span>
            </div>
            <div className="w-full h-1 bg-muted/60 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/80 transition-all duration-500"
                style={{ width: `${eventPct}%` }}
              />
            </div>
          </div>
        )}
        {user && !collapsed && (
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full px-2 py-1 rounded-md hover:bg-sidebar-accent/40"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="truncate">Sair ({user.email?.split("@")[0]})</span>
          </button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
