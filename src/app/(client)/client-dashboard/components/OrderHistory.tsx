
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import type { Order } from "@/types/order";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { formatDateDisplay } from "@/lib/utils";
import { InvoiceDialog } from "@/app/(app)/pricing/components/InvoiceDialog";
import type { Vehicle } from "@/types/vehicle";
import { toast } from "@/hooks/use-toast";
import { startOfMonth, endOfMonth, format, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OrderHistory() {
  const { currentUser } = useAuth();
  const [allCompletedOrders, setAllCompletedOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [orderForInvoice, setOrderForInvoice] = useState<Order | null>(null);

  // State for date filters
  const [dateFrom, setDateFrom] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [dateTo, setDateTo] = useState(
    format(endOfMonth(new Date()), "yyyy-MM-dd"),
  );

  const fetchCompletedOrders = useCallback(async () => {
    if (!currentUser?.clientId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    try {
      const ordersQuery = query(
        collection(db, "orders"),
        where("clientId", "==", currentUser.clientId),
        where("executionStatus", "==", "completed"),
        orderBy("completedAt", "desc"),
      );

      const vehiclesQuery = query(collection(db, "vehicles"));

      const [ordersSnapshot, vehiclesSnapshot] = await Promise.all([
        getDocs(ordersQuery),
        getDocs(vehiclesQuery),
      ]);
      const vehicles = vehiclesSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as Vehicle,
      );

      const ordersData = ordersSnapshot.docs
        .map((doc) =>
          sanitizeOrderFromFirestore(doc, "ClientOrderHistory", vehicles),
        )
        .filter((o): o is Order => o !== null);

      setAllCompletedOrders(ordersData);
    } catch (error: any) {
      let description = "Não foi possível buscar seu histórico de pedidos.";
      if (
        error.code === "failed-precondition" &&
        error.message.includes("The query requires an index")
      ) {
        description =
          "É necessário criar um índice no Firestore. Verifique o console de erros para o link de criação.";
      }
      toast({
        title: "Erro ao Carregar Histórico",
        description: description,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.clientId]);

  useEffect(() => {
    fetchCompletedOrders();
  }, [fetchCompletedOrders]);

  const filteredOrders = useMemo(() => {
    if (!dateFrom && !dateTo) {
      return allCompletedOrders;
    }
    const start = dateFrom ? startOfDay(parseISO(dateFrom)) : null;
    const end = dateTo ? endOfDay(parseISO(dateTo)) : null;

    return allCompletedOrders.filter((order) => {
      const completedDateStr = order.completedAt;
      if (!completedDateStr) return false;

      try {
        const completedDate = parseISO(completedDateStr);
        if (start && end) {
          return isWithinInterval(completedDate, { start, end });
        }
        if (start) return completedDate >= start;
        if (end) return completedDate <= end;
        return true;
      } catch {
        return false;
      }
    });
  }, [allCompletedOrders, dateFrom, dateTo]);

  const handleClearFilters = () => {
    setDateFrom("");
    setDateTo("");
  };


  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="space-y-1">
                <Label htmlFor="date-from">Data de Início</Label>
                <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                />
            </div>
            <div className="space-y-1">
                <Label htmlFor="date-to">Data de Fim</Label>
                <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                />
            </div>
            <Button variant="outline" onClick={handleClearFilters}>
                <Icons.xCircle className="mr-2 h-4 w-4" />
                Limpar Filtros
            </Button>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido Nº</TableHead>
                <TableHead>Data de Conclusão</TableHead>
                <TableHead>Valor Total</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    <Icons.loader className="mx-auto h-6 w-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      {order.id.substring(0, 8)}
                    </TableCell>
                    <TableCell>
                      {formatDateDisplay(order.completedAt, true)}
                    </TableCell>
                    <TableCell>
                      R$ {order.totalValue.toFixed(2).replace(".", ",")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOrderForInvoice(order)}
                      >
                        <Icons.receipt className="mr-2 h-4 w-4" />
                        Ver Fatura
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    Nenhum pedido concluído encontrado para o período selecionado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <InvoiceDialog
        isOpen={!!orderForInvoice}
        onOpenChange={(open) => !open && setOrderForInvoice(null)}
        order={orderForInvoice}
      />
    </>
  );
}
