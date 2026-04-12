import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, ShoppingCart, TrendingUp, AlertTriangle, Search, RefreshCw } from "lucide-react";

const statusColors: Record<string, string> = {
  paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  refused: "bg-red-500/20 text-red-400 border-red-500/30",
  refunded: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  chargeback: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function Orders() {
  const { data: workspace } = useWorkspace();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["orders", workspace?.id, statusFilter],
    queryFn: async () => {
      if (!workspace?.id) return [];
      let q = supabase
        .from("orders")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data } = await q;
      return data || [];
    },
    enabled: !!workspace?.id,
  });

  const filtered = (orders || []).filter(o =>
    !search || o.customer_email?.toLowerCase().includes(search.toLowerCase()) ||
    o.gateway_order_id?.toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = (orders || []).filter(o => o.status === "paid" || o.status === "approved").reduce((s, o) => s + (Number(o.total_value) || 0), 0);
  const totalOrders = (orders || []).length;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const refundCount = (orders || []).filter(o => o.status === "refunded" || o.status === "chargeback").length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Orders</h1>
          <p className="text-muted-foreground text-sm mt-1">Pedidos recebidos via gateways de pagamento</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="w-3.5 h-3.5" />Receita</div>
          <p className="text-xl font-bold text-foreground">R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><ShoppingCart className="w-3.5 h-3.5" />Pedidos</div>
          <p className="text-xl font-bold text-foreground">{totalOrders}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingUp className="w-3.5 h-3.5" />Ticket Médio</div>
          <p className="text-xl font-bold text-foreground">R$ {avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><AlertTriangle className="w-3.5 h-3.5" />Reembolsos</div>
          <p className="text-xl font-bold text-foreground">{refundCount}</p>
        </CardContent></Card>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por email ou order ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="paid">Pagos</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="refused">Recusados</SelectItem>
            <SelectItem value="refunded">Reembolsados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="glass-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gateway</TableHead>
                <TableHead>Order ID</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>UTM Source</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum pedido encontrado</TableCell></TableRow>
              ) : filtered.map(order => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs">{order.gateway}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[120px] truncate">{order.gateway_order_id}</TableCell>
                  <TableCell className="text-sm">{order.customer_email || "—"}</TableCell>
                  <TableCell className="font-medium">
                    {order.currency || "BRL"} {Number(order.total_value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-xs">{order.payment_method || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[order.status] || ""}>{order.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{order.utm_source || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString("pt-BR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
