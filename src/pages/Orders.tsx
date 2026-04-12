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
import { DollarSign, ShoppingCart, TrendingUp, AlertTriangle, Search, RefreshCw, CreditCard } from "lucide-react";
import { OrdersSkeleton } from "@/components/features/orders/OrdersSkeleton";
import { OrdersEmptyState } from "@/components/features/orders/OrdersEmptyState";
import { ROWS_PER_PAGE } from "@/lib/constants";

const statusColors: Record<string, string> = {
  paid: "bg-success/20 text-success border-success/30",
  pending: "bg-warning/20 text-warning border-warning/30",
  canceled: "bg-muted text-muted-foreground border-muted",
  refused: "bg-destructive/20 text-destructive border-destructive/30",
  refunded: "bg-primary/20 text-primary border-primary/30",
  chargeback: "bg-destructive/20 text-destructive border-destructive/30",
};

export default function Orders() {
  const { data: workspace } = useWorkspace();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gatewayFilter, setGatewayFilter] = useState("all");
  const [page, setPage] = useState(0);

  const { data: ordersResult, isLoading, refetch } = useQuery({
    queryKey: ["orders", workspace?.id, statusFilter, gatewayFilter, page],
    queryFn: async () => {
      if (!workspace?.id) return { data: [], count: 0 };
      let q = supabase.from("orders").select("*", { count: "exact" }).eq("workspace_id", workspace.id).order("created_at", { ascending: false }).range(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE - 1);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (gatewayFilter !== "all") q = q.eq("gateway", gatewayFilter);
      const { data, count } = await q;
      return { data: data || [], count: count || 0 };
    },
    enabled: !!workspace?.id,
  });

  const orders = ordersResult?.data || [];
  const totalCount = ordersResult?.count || 0;
  const totalPages = Math.ceil(totalCount / ROWS_PER_PAGE);

  const filtered = orders.filter(o =>
    !search || o.customer_email?.toLowerCase().includes(search.toLowerCase()) ||
    o.gateway_order_id?.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  const paidOrders = orders.filter(o => o.status === "paid");
  const totalRevenue = paidOrders.reduce((s, o) => s + (Number(o.total_value) || 0), 0);
  const avgTicket = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;
  const refundCount = orders.filter(o => o.status === "refunded" || o.status === "chargeback").length;
  const gateways = [...new Set(orders.map(o => o.gateway))];

  if (isLoading) return <OrdersSkeleton />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedidos & Receita</h1>
          <p className="text-muted-foreground text-sm mt-1">Pedidos recebidos via gateways de pagamento</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2" aria-label="Atualizar lista de pedidos">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </Button>
      </div>

      {/* KPIs — responsive grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="surface-elevated hover-lift"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="w-3.5 h-3.5" aria-hidden="true" />Receita Aprovada</div>
          <p className="text-xl font-bold text-foreground tabular-nums">R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </CardContent></Card>
        <Card className="surface-elevated hover-lift"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><ShoppingCart className="w-3.5 h-3.5" aria-hidden="true" />Pedidos</div>
          <p className="text-xl font-bold text-foreground tabular-nums">{orders.length}</p>
          <p className="text-xs text-success">{paidOrders.length} pagos</p>
        </CardContent></Card>
        <Card className="surface-elevated hover-lift"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />Ticket Médio</div>
          <p className="text-xl font-bold text-foreground tabular-nums">R$ {avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </CardContent></Card>
        <Card className="surface-elevated hover-lift"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><CreditCard className="w-3.5 h-3.5" aria-hidden="true" />Gateways</div>
          <p className="text-xl font-bold text-foreground tabular-nums">{gateways.length}</p>
        </CardContent></Card>
        <Card className="surface-elevated hover-lift"><CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />Reembolsos</div>
          <p className="text-xl font-bold text-foreground tabular-nums">{refundCount}</p>
        </CardContent></Card>
      </div>

      {/* Filters — stack on mobile */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input placeholder="Buscar por email, nome ou order ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" aria-label="Buscar pedidos" />
        </div>
        <Select value={gatewayFilter} onValueChange={setGatewayFilter}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filtrar por gateway"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos gateways</SelectItem>
            {gateways.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filtrar por status"><SelectValue /></SelectTrigger>
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
      <Card className="surface-elevated">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <OrdersEmptyState hasSearch={!!search || statusFilter !== "all" || gatewayFilter !== "all"} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gateway</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">UTM Source</TableHead>
                    <TableHead className="hidden xl:table-cell">Campanha</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(order => (
                    <TableRow key={order.id} className="hover:bg-muted/20 transition-colors">
                      <TableCell className="font-mono text-xs font-medium">{order.gateway}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[100px] truncate">{order.gateway_order_id || "—"}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{order.customer_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{order.customer_email || ""}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-sm tabular-nums">
                        {order.currency || "BRL"} {Number(order.total_value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs">{order.payment_method || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[order.status] || ""}>{order.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{order.utm_source || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[100px] truncate hidden xl:table-cell">{order.utm_campaign || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">{new Date(order.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground tabular-nums">{totalCount} pedidos • Página {page + 1} de {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Página anterior">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} aria-label="Próxima página">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
