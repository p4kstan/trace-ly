import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const initials = user?.email?.slice(0, 2).toUpperCase() || "CT";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center justify-between px-4 glass-header sticky top-0 z-20">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground hover-glow transition-all duration-200" />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-all duration-200">
                <Bell className="w-4 h-4" />
              </Button>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-primary-foreground gradient-border"
                style={{ background: 'linear-gradient(135deg, hsl(199 89% 48% / 0.2), hsl(265 80% 60% / 0.2))' }}>
                <span className="text-gradient-primary font-bold">{initials}</span>
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
