import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Zap, Mail, Lock, User, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Erro ao entrar com Google");
    if (result.redirected) return;
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Verifique seu e-mail para confirmar a conta.");
      setMode("login");
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Link de redefinição enviado para seu e-mail.");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden p-4">
      {/* Subtle background grid */}
      <div className="absolute inset-0 dot-grid opacity-30" />
      {/* Gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px]" />

      <div className="w-full max-w-sm space-y-8 animate-fade-in relative z-10">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-gradient-primary">CapiTrack AI</h1>
          <p className="text-muted-foreground text-xs mt-1 tracking-wide">Server-side tracking platform</p>
        </div>

        <div className="surface-elevated p-6 space-y-5">
          <h2 className="text-sm font-semibold text-foreground text-center">
            {mode === "login" ? "Bem-vindo de volta" : mode === "signup" ? "Criar conta" : "Redefinir senha"}
          </h2>

          {mode !== "forgot" && (
            <>
              <Button
                variant="outline"
                className="w-full gap-2 h-10 text-sm border-border/60 hover:bg-secondary/60"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continuar com Google
              </Button>

              <div className="flex items-center gap-3">
                <Separator className="flex-1 bg-border/40" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">ou</span>
                <Separator className="flex-1 bg-border/40" />
              </div>
            </>
          )}

          <form onSubmit={mode === "login" ? handleLogin : mode === "signup" ? handleSignup : handleForgotPassword} className="space-y-3.5">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs text-muted-foreground">Nome completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground/60" />
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" className="pl-9 h-9 text-sm bg-muted/30 border-border/40 focus:border-primary/40" required />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs text-muted-foreground">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground/60" />
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="pl-9 h-9 text-sm bg-muted/30 border-border/40 focus:border-primary/40" required />
              </div>
            </div>
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs text-muted-foreground">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground/60" />
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-9 h-9 text-sm bg-muted/30 border-border/40 focus:border-primary/40" required minLength={6} />
                </div>
              </div>
            )}
            <Button type="submit" className="w-full h-9 text-sm gap-2 glow-primary" disabled={loading}>
              {loading ? "Aguarde..." : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
              {!loading && <ArrowRight className="w-3.5 h-3.5" />}
            </Button>
          </form>

          <div className="text-center space-y-1.5 text-xs">
            {mode === "login" && (
              <>
                <button onClick={() => setMode("forgot")} className="text-muted-foreground hover:text-primary transition-colors block mx-auto">Esqueci a senha</button>
                <p className="text-muted-foreground">Não tem conta? <button onClick={() => setMode("signup")} className="text-primary hover:underline font-medium">Criar conta</button></p>
              </>
            )}
            {mode === "signup" && (
              <p className="text-muted-foreground">Já tem conta? <button onClick={() => setMode("login")} className="text-primary hover:underline font-medium">Entrar</button></p>
            )}
            {mode === "forgot" && (
              <button onClick={() => setMode("login")} className="text-primary hover:underline font-medium">Voltar ao login</button>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/40">
          © 2026 CapiTrack AI · Tracking server-side inteligente
        </p>
      </div>
    </div>
  );
}
