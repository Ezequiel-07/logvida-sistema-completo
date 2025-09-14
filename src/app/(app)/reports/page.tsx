
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Order } from "@/types/order";
import type { Vehicle } from "@/types/vehicle";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  deleteDoc,
  DocumentSnapshot,
  writeBatch,
} from "firebase/firestore";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { formatDateDisplay } from "@/lib/utils";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { parseISO, format, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const formatCompletionDate = (order: Order): string => {
    const dateStr = order.completedAt || order.createdAt; // Fallback to creation date
    if (!dateStr) return "N/D";
    try {
        const date = parseISO(dateStr);
        // Formato: "dd/MM/yyyy (EEEE)" -> "25/07/2024 (quinta-feira)"
        return format(date, "dd/MM/yyyy (EEEE)", { locale: ptBR });
    } catch {
        return "Data Inválida";
    }
};

const getExecutionStatusBadgeVariant = (
  status: Order["executionStatus"],
): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "completed":
      return "default";
    case "in-progress":
      return "secondary";
    case "cancelled":
      return "destructive";
    case "pending":
    default:
      return "outline";
  }
};


export default function OrderReportsPage() {
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);
  
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  
  // State to control the delete confirmation dialog
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

  const { toast } = useToast();

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const ordersCollectionRef = collection(db, "orders");
      const vehiclesCollectionRef = collection(db, "vehicles");

      const q = query(
        ordersCollectionRef,
        orderBy("createdAt", "desc"),
      );

      const [ordersSnapshot, vehiclesSnapshot] = await Promise.all([
        getDocs(q),
        getDocs(vehiclesCollectionRef)
      ]);
      
      const loadedVehicles = vehiclesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle));

      const loadedOrders = ordersSnapshot.docs
          .map(doc => sanitizeOrderFromFirestore(doc, 'OrderReports', loadedVehicles))
          .filter((o): o is Order => o !== null);

      setAllOrders(loadedOrders);
    } catch (error: unknown) {
      toast({
        title: "Erro ao Carregar Relatórios",
        description: "Não foi possível buscar todos os pedidos.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);


  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);
  
  const filteredOrders = useMemo(() => {
    if (!dateFrom && !dateTo) {
      return allOrders;
    }
    const start = dateFrom ? startOfDay(parseISO(dateFrom)) : null;
    const end = dateTo ? endOfDay(parseISO(dateTo)) : null;

    return allOrders.filter((order) => {
      const dateToFilterStr = order.completedAt || order.createdAt;
      if (!dateToFilterStr) return false;

      try {
        const dateToFilter = parseISO(dateToFilterStr);
        if (start && end) {
          return isWithinInterval(dateToFilter, { start, end });
        }
        if (start) return dateToFilter >= start;
        if (end) return dateToFilter <= end;
        return true;
      } catch {
        return false;
      }
    });
  }, [allOrders, dateFrom, dateTo]);
  
  const handleOpenDeleteDialog = (order: Order | null) => {
    setOrderToDelete(order);
    setIsDeleteConfirmOpen(true);
  };


  const handleDeleteOrders = async () => {
    const idsToDelete = orderToDelete ? [orderToDelete.id] : Array.from(selectedOrderIds);
    if (idsToDelete.length === 0) return;

    setIsProcessingDelete(true);
    try {
        const batch = writeBatch(db);
        idsToDelete.forEach(id => {
            const orderRef = doc(db, "orders", id);
            batch.delete(orderRef);
        });
        await batch.commit();

        toast({ title: `${idsToDelete.length} Pedido(s) Excluído(s)`, description: `Os registros foram removidos com sucesso.` });
        fetchOrders(); 
        setSelectedOrderIds(new Set()); 
    } catch (error) {
        toast({ title: "Erro ao Excluir", description: "Não foi possível remover os pedidos.", variant: "destructive" });
    } finally {
        setIsDeleteConfirmOpen(false); // Close dialog
        setOrderToDelete(null); 
        setIsProcessingDelete(false);
    }
  };


  const handlePrint = () => {
    window.print();
  };
  
  const handleClearFilters = () => {
    setDateFrom("");
    setDateTo("");
  };
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrderIds(new Set(filteredOrders.map(o => o.id)));
    } else {
      setSelectedOrderIds(new Set());
    }
  };

  const handleSelectOne = (orderId: string, checked: boolean) => {
    const newSet = new Set(selectedOrderIds);
    if (checked) {
      newSet.add(orderId);
    } else {
      newSet.delete(orderId);
    }
    setSelectedOrderIds(newSet);
  };
  
  const isAllVisibleSelected = filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length;


  const statusTranslations: Record<Order['executionStatus'], string> = {
    pending: "Pendente",
    "in-progress": "Em Progresso",
    completed: "Concluído",
    cancelled: "Cancelado"
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icons.loader className="h-12 w-12 animate-pulse text-primary" />
        <p className="ml-4 text-xl text-muted-foreground">
          Carregando relatórios de pedidos...
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="w-full max-w-7xl mx-auto py-8 printable-area">
        <Card className="shadow-xl print:shadow-none print:border-none">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-3xl font-bold text-primary">
                  Histórico de Pedidos
                </CardTitle>
                <CardDescription>
                  Consulte todos os pedidos registrados no sistema.
                </CardDescription>
              </div>
               <div className="flex items-center gap-2 print:hidden">
                   <Button onClick={handlePrint} variant="outline">
                       <Icons.printer className="mr-2 h-4 w-4" />
                       Imprimir Relatório
                   </Button>
               </div>
            </div>
             <div className="flex flex-wrap gap-4 pt-4 print:hidden items-end">
                <div className="flex-1 min-w-[150px]">
                    <Label htmlFor="date-from">De</Label>
                    <Input id="date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                 <div className="flex-1 min-w-[150px]">
                    <Label htmlFor="date-to">Até</Label>
                    <Input id="date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                <Button variant="outline" onClick={handleClearFilters}>
                    <Icons.xCircle className="mr-2 h-4 w-4" /> Limpar Filtros
                </Button>
                 {selectedOrderIds.size > 0 && (
                    <Button variant="destructive" onClick={() => handleOpenDeleteDialog(null)}>
                        <Icons.delete className="mr-2 h-4 w-4" />
                        Excluir Selecionados ({selectedOrderIds.size})
                    </Button>
                )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 print:hidden">
                      <Checkbox 
                        checked={isAllVisibleSelected}
                        indeterminate={!isAllVisibleSelected && selectedOrderIds.size > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label="Selecionar todas as ordens visíveis"
                      />
                  </TableHead>
                  <TableHead>Nº Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead className="text-right print:hidden">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length > 0 ? (
                  filteredOrders.map((order) => (
                    <TableRow key={order.id} data-state={selectedOrderIds.has(order.id) ? 'selected' : ''}>
                       <TableCell className="print:hidden">
                         <Checkbox
                            checked={selectedOrderIds.has(order.id)}
                            onCheckedChange={(checked) => handleSelectOne(order.id, !!checked)}
                            aria-labelledby={`select-order-${order.id}`}
                         />
                       </TableCell>
                      <TableCell className="font-medium" id={`select-order-${order.id}`}>
                        {order.id.substring(0, 8)}...
                      </TableCell>
                      <TableCell>{order.clientCompanyName}</TableCell>
                      <TableCell>
                        {formatCompletionDate(order)}
                      </TableCell>
                      <TableCell>
                          <Badge variant={getExecutionStatusBadgeVariant(order.executionStatus)}>
                              {statusTranslations[order.executionStatus] || "Desconhecido"}
                          </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        R${" "}
                        {order.totalValue?.toFixed(2).replace(".", ",") ?? "N/A"}
                      </TableCell>
                      <TableCell className="text-right print:hidden">
                          <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Icons.moreVertical className="h-4 w-4" />
                                    <span className="sr-only">Ações</span>
                                  </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                   <Link href={`/routes/${order.id}/timeline`}>
                                      <Icons.fileText className="mr-2 h-4 w-4" /> Ver Timeline/Relatório
                                   </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleOpenDeleteDialog(order)} className="text-destructive focus:text-destructive">
                                  <Icons.delete className="mr-2 h-4 w-4" /> Excluir Pedido
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                          </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Nenhum pedido encontrado para o período selecionado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
                {orderToDelete ? `Tem certeza que deseja excluir permanentemente o pedido Nº ${orderToDelete.id}? Esta ação não pode ser desfeita.` : `Tem certeza que deseja excluir os ${selectedOrderIds.size} pedidos selecionados? Esta ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrders} disabled={isProcessingDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
               {isProcessingDelete && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
