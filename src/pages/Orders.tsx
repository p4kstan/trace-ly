import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-tracking-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, ShoppingCart, TrendingUp, AlertTriangle, Search, RefreshCw, CreditCard, ArrowDownRight } from "lucide-react";

const statusColors: Record<string, string> = {
  paid: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  canceled: "bg-muted text-muted-foreground border-muted",
  refused: "bg-red-500/20 text-red-400 border-red-500/30",
  refunded: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  chargeback: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function Orders() {
  const { data: workspace } = useWorkspace();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gatewayFilter, setGatewayFilter] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data: ordersResult, isLoading, refetch } = useQuery({
    queryKey: ["orders", workspace?.id, statusFilter, gatewayFilter, page],
    queryFn: async () => {
      if (!workspace?.id) return { data: [], count: 0 };
      let q = supabase.from("orders").select("*", { count: "exact" }).eq("workspace_id", workspace.id).order("created_at", { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (gatewayFilter !== "all") q = q.eq("gateway", gatewayFilter);
      const { data, count } = await q;
      return { data: data || [], count: count || 0 };
    },
    enabled: !!workspace?.id,
  });

  const orders = ordersResult?.data || [];
  const totalCount = ordersResult?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const filtered = (orders || []).filter(o =>
    !search || o.customer_email?.toLowerCase().includes(search.toLowerCase()) ||
    o.gateway_order_id?.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  const paidOrders = (orders || []).filter(o => o.status === "paid");
  const totalRevenue = paidOrders.reduce((s, o) => s + (Number(o.total_value) || 0), 0);
  const avgTicket = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;
  const refundCount = (orders || []).filter(o => o.status === "refunded" || o.status === "chargeback").length;
  const gateways = [...new Set((orders || []).map(o => o.gateway))];

  // Revenue by gateway
  const revenueByGateway = gateways.map(g => ({
    gateway: g,
    revenue: paidOrders.filter(o => o.gateway === g).reduce((s, o) => s + (Number(o.total_value) || 0), 0),
    count: paidOrders.filter(o => o.gateway === g).length,
  })).sort((a, b) => b.revenue - a.revenue);

  // Revenue by UTM source
  const sources = [...new Set(paidOrders.map(o => o.utm_source).filter(Boolean))];
  const revenueBySource = sources.map(s => ({
    source: s,
    revenue: paidOrders.filter(o => o.utm_source === s).reduce((s2, o) => s2 + (Number(o.total_value) || 0), 0),
    count: paidOrders.filter(o => o.utm_source === s).length,
  })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedidos & Receita</h1>
          <p className="text-muted-foreground text-sm mt-1">Pedidos recebidos via gateways de pagamento</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="glass-card"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="w-3.5 h-3.5" />Receita Aprovada</div>
          <p className="text-xl font-bold text-foreground">R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><ShoppingCart className="w-3.5 h-3.5" />Pedidos</div>
          <p className="text-xl font-bold text-foreground">{(orders || []).length}</p>
          <p className="text-xs text-emerald-400">{paidOrders.length} pagos</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingUp className="w-3.5 h-3.5" />Ticket Médio</div>
          <p className="text-xl font-bold text-foreground">R$ {avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><CreditCard className="w-3.5 h-3.5" />Gateways</div>
          <p className="text-xl font-bold text-foreground">{gateways.length}</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><AlertTriangle className="w-3.5 h-3.5" />Reembolsos</div>
          <p className="text-xl font-bold text-foreground">{refundCount}</p>
        </CardContent></Card>
      </div>

      {/* Breakdown cards */}
      {(revenueByGateway.length > 0 || revenueBySource.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {revenueByGateway.length > 0 && (
            <Card className="glass-card"><CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">Receita por Gateway</p>
              <div className="space-y-2">
                {revenueByGateway.map(g => (
                  <div key={g.gateway} className="flex items-center justify-between">
                    <span className="text-sm text-foreground font-medium">{g.gateway}</span>
                    <div className="text-right">
                      <span className="text-sm font-bold text-foreground">R$ {g.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      <span className="text-xs text-muted-foreground ml-2">({g.count})</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          )}
          {revenueBySource.length > 0 && (
            <Card className="glass-card"><CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">Receita por UTM Source</p>
              <div className="space-y-2">
                {revenueBySource.map(s => (
                  <div key={s.source} className="flex items-center justify-between">
                    <span className="text-sm text-foreground font-medium">{s.source}</span>
                    <div className="text-right">
                      <span className="text-sm font-bold text-foreground">R$ {s.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      <span className="text-xs text-muted-foreground ml-2">({s.count})</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por email, nome ou order ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={gatewayFilter} onValueChange={setGatewayFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos gateways</SelectItem>
            {gateways.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="paid">Pagos</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="canceled">Cancelados</SelectItem>
            <SelectItem value="refunded">Reembolsados</SelectItem>
            <SelectItem value="chargeback">Chargebacks</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
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
                <TableHead>Campanha</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum pedido encontrado</TableCell></TableRow>
              ) : filtered.map(order => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs font-medium">{order.gateway}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[100px] truncate">{order.gateway_order_id || "—"}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{order.customer_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{order.customer_email || ""}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {order.currency || "BRL"} {Number(order.total_value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-xs">{order.payment_method || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[order.status] || ""}>{order.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{order.utm_source || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[100px] truncate">{order.utm_campaign || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString("pt-BR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">{totalCount} pedidos • Página {page + 1} de {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
