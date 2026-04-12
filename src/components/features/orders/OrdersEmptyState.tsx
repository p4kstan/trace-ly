import { ShoppingCart } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";

interface Props {
  hasSearch?: boolean;
}

export function OrdersEmptyState({ hasSearch }: Props) {
  return (
    <EmptyState
      icon={ShoppingCart}
      title={hasSearch ? "Nenhum pedido encontrado" : "Nenhum pedido registrado"}
      description={
        hasSearch
          ? "Tente buscar com outro termo ou remova os filtros."
          : "Conecte um gateway de pagamento e seus pedidos aparecerão aqui automaticamente."
      }
    />
  );
}
