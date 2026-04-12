import {
  LayoutDashboard, GitBranch, MonitorDot, ScrollText, Bug, Settings,
  Zap, Brain, CreditCard, HeartPulse, Key, LogOut, ShoppingCart, Webhook, Inbox,
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
  { title: "Fila / Queue", url: "/queue", icon: Inbox },
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
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center glow-primary">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && <span className="text-lg font-bold gradient-text">CapiTrack AI</span>}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/60 text-xs uppercase tracking-wider">
            {!collapsed && "Analytics"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} end={item.url === "/"} className="transition-colors" activeClassName="bg-sidebar-accent text-primary font-medium">
                      <item.icon className="w-4 h-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/60 text-xs uppercase tracking-wider">
            {!collapsed && "Config"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} className="transition-colors" activeClassName="bg-sidebar-accent text-primary font-medium">
                      <item.icon className="w-4 h-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border space-y-3">
        {!collapsed && (
          <div className="glass-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Free Plan</p>
            <p className="text-xs text-primary font-medium">{eventCount.toLocaleString()} / {eventLimit.toLocaleString()} events</p>
            <div className="w-full h-1 bg-muted rounded-full mt-2">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${eventPct}%` }} />
            </div>
          </div>
        )}
        {user && !collapsed && (
          <button onClick={signOut} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full px-2">
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair ({user.email?.split("@")[0]})</span>
          </button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
