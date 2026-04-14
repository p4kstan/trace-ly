import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Workflow, Monitor, Cloud, Database, Send, ArrowRight } from "lucide-react";
import PlatformWizard from "@/components/how-it-works/PlatformWizard";
import { FACEBOOK_STEPS } from "@/components/how-it-works/facebook-steps";
import { GOOGLE_STEPS } from "@/components/how-it-works/google-steps";

export default function HowItWorks() {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gradient-primary">Como Funciona</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure o rastreamento server-side passo a passo para cada plataforma
        </p>
      </div>

      {/* Architecture overview */}
      <Card className="glass-card overflow-hidden">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Workflow className="w-4 h-4 text-primary" /> Arquitetura — Visão Geral
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            {[
              { icon: Monitor, label: "Seu Site", sub: "SDK captura eventos" },
              { icon: Cloud, label: "CapiTrack", sub: "Servidor (Edge Functions)" },
              { icon: Database, label: "Banco de Dados", sub: "Eventos persistidos" },
              { icon: Send, label: "Plataformas", sub: "Meta / GA4 / Google Ads" },
            ].map((item, i, arr) => (
              <div key={i} className="flex items-center gap-2">
                <div className="bg-muted/40 border border-border/30 rounded-lg px-4 py-3 text-center min-w-[100px]">
                  <item.icon className="w-4 h-4 text-primary mx-auto mb-1" />
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                </div>
                {i < arr.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Platform tabs */}
      <Tabs defaultValue="facebook" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="facebook" className="gap-2 text-xs">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            Facebook / Meta
          </TabsTrigger>
          <TabsTrigger value="google" className="gap-2 text-xs">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Google (GA4 + Ads)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="facebook">
          <PlatformWizard
            steps={FACEBOOK_STEPS}
            platformColor="text-blue-400"
            platformBg="bg-blue-500/10"
            platformBorder="border-blue-500/20"
          />
        </TabsContent>

        <TabsContent value="google">
          <PlatformWizard
            steps={GOOGLE_STEPS}
            platformColor="text-amber-400"
            platformBg="bg-amber-500/10"
            platformBorder="border-amber-500/20"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
