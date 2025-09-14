

"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { parseISO, format, startOfDay, endOfDay, isBefore, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";

import { toast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
  getDoc,
} from "firebase/firestore";
import type { Order } from "@/types/order";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/icons";
import { toISOString, cn } from "@/lib/utils";
import { exportToXlsx } from "@/lib/export-utils";
import { InvoiceDialog } from "../../pricing/components/InvoiceDialog";
import { BoxLabelDialog } from "../../pricing/components/BoxLabelDialog";
import { getRouteDetailsWithTolls } from "@/server/actions/routes";
import { calculateTotalValue } from "@/lib/route-utils";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";
import { Checkbox } from "@/components/ui/checkbox";
import { optimizeAndGroupOrders } from "@/server/actions/orders";
import { sendNotification } from "@/server/actions/notifications";


const PAGE_SIZE = 20;

type ExecutionStatus = "pending" | "in-progress" | "completed" | "cancelled";
type SortableKeys = keyof Order | 'executionDate';

const orderExecutionStatusTranslations: Record<ExecutionStatus, string> = {
  pending: "Pendente",
  "in-progress": "Em Progresso",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const getExecutionStatusBadgeVariant = (
  status: ExecutionStatus,
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

const getExecutionDate = (order: Order): Date | null => {
    try {
        if (order.serviceDate) return parseISO(order.serviceDate);
        if (order.createdAt) return parseISO(order.createdAt);
    } catch {
        return null;
    }
    return null;
}

const getExecutionDateDisplay = (order: Order): string => {
    const date = getExecutionDate(order);
    if(date) return format(date, "dd/MM/yyyy");

    if (order.repeatDaysOrder && order.repeatDaysOrder.length > 0) {
        const dayAbbreviations: Record<string, string> = {
            monday: "SEG", tuesday: "TER", wednesday: "QUA", thursday: "QUI",
            friday: "SEX", saturday: "SAB", sunday: "DOM",
        };
        return order.repeatDaysOrder.map(d => dayAbbreviations[d] || d.slice(0,3).toUpperCase()).join(', ');
    }
    return "Ad-hoc";
};

const getExecutionDisplayInfo = (order: Order): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
    if (order.executionStatus === 'pending') {
        const serviceDate = getExecutionDate(order);
        if (serviceDate && isBefore(serviceDate, startOfToday())) {
            return { label: 'Atrasado', variant: 'destructive' };
        }
    }
    return {
        label: orderExecutionStatusTranslations[order.executionStatus],
        variant: getExecutionStatusBadgeVariant(order.executionStatus)
    };
};

export function OrderManagementClient() {
  const router = useRouter();
  const { currentUser } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [executionFilter, setExecutionFilter] = useState<ExecutionStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>({ key: 'createdAt', direction: 'descending'});

  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);

  const [orderForInvoice, setOrderForInvoice] = useState<Order | null>(null);
  const [orderForLabels, setOrderForLabels] = useState<Order | null>(null);
  
  const [orderToRevert, setOrderToRevert] = useState<Order | null>(null);
  const [orderToRevertInvoice, setOrderToRevertInvoice] = useState<Order | null>(null);
  const [orderToCompleteManually, setOrderToCompleteManually] = useState<Order | null>(null);
  
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIsLoading(true);
    const ordersQuery = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const ordersData = snapshot.docs
        .map((doc) => sanitizeOrderFromFirestore(doc, "OrderManagement"))
        .filter((o): o is Order => o !== null);
      setOrders(ordersData);
      setIsLoading(false);
    }, (error) => {
      toast({ title: "Erro ao buscar Ordens de Serviço", variant: "destructive" });
      setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

 const sortedOrders = useMemo(() => {
    let sortableItems = [...orders];
    if (sortConfig !== null) {
        sortableItems.sort((a, b) => {
            let aValue, bValue;
            
            if (sortConfig.key === 'executionDate') {
                aValue = getExecutionDate(a)?.getTime() ?? 0;
                bValue = getExecutionDate(b)?.getTime() ?? 0;
            } else if (['totalValue'].includes(sortConfig.key)) {
                aValue = a[sortConfig.key as keyof Order] as number;
                bValue = b[sortConfig.key as keyof Order] as number;
            } else if (['createdAt', 'completedAt'].includes(sortConfig.key)) {
                 aValue = new Date(a[sortConfig.key as 'createdAt'] as string).getTime();
                 bValue = new Date(b[sortConfig.key as 'createdAt'] as string).getTime();
            } else {
                 aValue = a[sortConfig.key as keyof Order] as string;
                 bValue = b[sortConfig.key as keyof Order] as string;
            }

            if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        });
    }
    return sortableItems;
}, [orders, sortConfig]);

  const filteredOrders = useMemo(() => {
    return sortedOrders.filter((order) => {
      const searchLower = searchTerm.toLowerCase();
      
      const fromDate = dateFrom ? startOfDay(parseISO(dateFrom)) : null;
      const toDate = dateTo ? endOfDay(parseISO(dateTo)) : null;
      const execDate = getExecutionDate(order);

      if (searchLower && !order.clientCompanyName?.toLowerCase().includes(searchLower) &&
          !order.id.toLowerCase().includes(searchLower) &&
          !order.assignedDriverName?.toLowerCase().includes(searchLower)) return false;
      
      if (executionFilter !== "all" && order.executionStatus !== executionFilter) return false;
      
      if (execDate) {
          if (fromDate && isBefore(execDate, fromDate)) return false;
          if (toDate && isBefore(toDate, execDate)) return false;
      }

      return true;
    });
  }, [sortedOrders, searchTerm, executionFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, page]);
  
  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const getSortIcon = (key: SortableKeys) => {
    if (!sortConfig || sortConfig.key !== key) return <Icons.chevronsUpDown className="h-4 w-4 ml-2 opacity-30" />;
    return sortConfig.direction === 'ascending' ? <Icons.chevronUp className="h-4 w-4 ml-2"/> : <Icons.chevronDown className="h-4 w-4 ml-2"/>;
  };

  const handleConfirmCancelOrder = async () => {
    if (!orderToCancel || orderToCancel.invoiced) {
        toast({ title: "Ação Bloqueada", description: "Ordens de Serviço já faturadas não podem ser canceladas.", variant: "destructive" });
        setOrderToCancel(null);
        return;
    }
    setIsUpdating(true);
    try {
      const orderRef = doc(db, "orders", orderToCancel.id);
      await updateDoc(orderRef, { executionStatus: "cancelled" });
      
      if (orderToCancel.assignedDriverId) {
        await sendNotification(
          orderToCancel.assignedDriverId,
          "Rota Cancelada",
          `A rota para ${orderToCancel.clientCompanyName} foi cancelada.`,
          "error",
          { routeId: orderToCancel.id, eventType: "routeCancellation" }
        );
      }

      toast({ title: "Ordem de Serviço Cancelada" });
    } catch {
      toast({ title: "Erro", variant: "destructive" });
    } finally {
      setIsUpdating(false);
      setOrderToCancel(null);
    }
  };

  const handleConfirmDeleteOrder = async () => {
    if (!orderToDelete || orderToDelete.invoiced) {
        toast({ title: "Ação Bloqueada", description: "Ordens de Serviço já faturadas não podem ser excluídas.", variant: "destructive" });
        setOrderToDelete(null);
        return;
    }
    setIsUpdating(true);
    try {
      await deleteDoc(doc(db, "orders", orderToDelete.id));
      toast({ title: "Ordem de Serviço Excluída" });
    } catch {
      toast({ title: "Erro", variant: "destructive" });
    } finally {
      setIsUpdating(false);
      setOrderToDelete(null);
    }
  };
  
  const handleRevertToPending = async () => {
    if (!orderToRevert) return;
    setIsUpdating(true);
    try {
        const orderRef = doc(db, "orders", orderToRevert.id);
        await updateDoc(orderRef, {
            executionStatus: 'pending',
            startedAt: null
        });
        toast({ title: "Ordem de Serviço Revertida", description: "O status voltou para pendente." });
    } catch (e) {
        toast({ title: "Erro ao reverter Ordem de Serviço", variant: "destructive" });
    } finally {
        setIsUpdating(false);
        setOrderToRevert(null);
    }
  };
  
  const handleRevertInvoice = async () => {
    if (!orderToRevertInvoice) return;
    setIsUpdating(true);
    try {
      const orderRef = doc(db, "orders", orderToRevertInvoice.id);
      await updateDoc(orderRef, {
        invoiced: false,
        invoicedAt: null,
      });
      toast({ title: "Faturamento Revertido", description: "A OS está disponível para faturamento novamente." });
    } catch (e) {
        toast({ title: "Erro ao reverter faturamento", variant: "destructive" });
    } finally {
        setIsUpdating(false);
        setOrderToRevertInvoice(null);
    }
  };
  
  const handleManualCompletion = async () => {
    if (!orderToCompleteManually || !currentUser) return;
    setIsUpdating(true);
    toast({ title: "Processando Conclusão...", description: "Aguarde um momento." });
    try {
      const now = Timestamp.now();
      const orderRef = doc(db, "orders", orderToCompleteManually.id);
      
      const updatedOrder: Order = JSON.parse(JSON.stringify(orderToCompleteManually));
      
      let finalFieldsToUpdate: Partial<Order> = {
          executionStatus: 'completed',
          startedAt: orderToCompleteManually.startedAt || now.toDate().toISOString(),
          completedAt: now.toDate().toISOString(),
          originStop: { ...updatedOrder.originStop, status: 'completed', checkedAt: updatedOrder.originStop.checkedAt || now.toDate().toISOString() },
          destinationStop: { ...updatedOrder.destinationStop, status: 'completed', checkedAt: updatedOrder.destinationStop.checkedAt || now.toDate().toISOString() },
          intermediateStopsOrder: (updatedOrder.intermediateStopsOrder || []).map((s: any) => ({ ...s, status: 'completed', checkedAt: s.checkedAt || now.toDate().toISOString() })),
      };

      const allStops = [updatedOrder.originStop, ...(updatedOrder.intermediateStopsOrder || []), updatedOrder.destinationStop].filter(Boolean);
      const effectiveStops = allStops.filter(s => s.status === 'completed');
      
      if (effectiveStops.length > 1 && effectiveStops.length < allStops.length) {
          toast({ title: "Recalculando Rota Final...", description: "Ajustando distância e custos com base nas paradas concluídas." });
          
          const newOrigin = effectiveStops[0].address.description;
          const newDestination = effectiveStops[effectiveStops.length - 1].address.description;
          const newIntermediates = effectiveStops.slice(1, -1).map(s => s.address.description);

          const newRouteDetails = await getRouteDetailsWithTolls(newOrigin, newDestination, newIntermediates, false);
          
          if (newRouteDetails.success && newRouteDetails.data) {
              const { distance, duration, tolls } = newRouteDetails.data;
              const companySettings = await getDoc(doc(db, "companySettings", "main")).then(d => d.data());
              const driver = await getDoc(doc(db, "users", orderToCompleteManually.assignedDriverId!)).then(d => d.data());

              const recalculatedValues = calculateTotalValue({
                  pricingMethod: updatedOrder.pricingMethod,
                  distanceKm: distance,
                  pricePerKm: updatedOrder.pricePerKm,
                  boxCount: updatedOrder.numberOfBoxes,
                  pricePerBox: updatedOrder.pricePerBox,
                },
                {
                  arteris: companySettings?.arterisTollPrice || 0,
                  ccr: companySettings?.ccrTollPrice || 0,
                  fuelPrice: companySettings?.fuelPrice || 0,
                  averageFuelConsumption: driver?.vehicle?.costs.fuelConsumption || 10
                }
              );

              finalFieldsToUpdate.routeDistanceKm = distance;
              finalFieldsToUpdate.totalDurationMinutes = duration;
              finalFieldsToUpdate.routeTollCost = tolls;
              finalFieldsToUpdate.totalValue = recalculatedValues.totalValue;
              finalFieldsToUpdate.fuelCost = recalculatedValues.fuelCost;
              finalFieldsToUpdate.transportServiceCost = recalculatedValues.transportServiceCost;
              toast({ title: "Rota Recalculada!", description: `Nova distância: ${distance.toFixed(1)} km.` });
          }
      }
      
      await updateDoc(orderRef, finalFieldsToUpdate);
      toast({ title: "Ordem de Serviço Concluída Manualmente" });
    } catch (e) {
      console.error(e);
      toast({ title: "Erro ao concluir manualmente", variant: "destructive" });
    } finally {
      setIsUpdating(false);
      setOrderToCompleteManually(null);
    }
  };

  const handleDuplicateOrder = (order: Order) => {
    const queryParams = new URLSearchParams();
    queryParams.set("duplicateFromId", order.id);
    router.push(`/pricing?${queryParams.toString()}`);
  };


  const handleClearFilters = () => {
    setSearchTerm("");
    setExecutionFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const exportXLSX = () => {
    if (!filteredOrders.length) {
      toast({ title: "Nada para exportar", variant: "default" });
      return;
    }
    const header = ["ID", "Cliente", "Nome da Rota", "Motorista", "Execução", "Status", "Valor Total (R$)"];
    const rows = filteredOrders.map((o) => [
      o.id,
      o.clientCompanyName || "N/A",
      o.selectedRouteName || "Rota Customizada",
      o.assignedDriverName || "N/A",
      getExecutionDateDisplay(o),
      getExecutionDisplayInfo(o).label,
      o.totalValue,
    ]);
    exportToXlsx([header, ...rows], "ordens_de_servico.xlsx");
  };

  const handlePrint = () => window.print();
  
  const SortableHeader = ({ sortKey, label }: { sortKey: SortableKeys; label: string }) => (
    <TableHead>
        <Button variant="ghost" onClick={() => requestSort(sortKey)} className="px-2 py-1 h-auto -ml-2">
            {label} {getSortIcon(sortKey)}
        </Button>
    </TableHead>
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Select all *visible* pending orders
      const pendingIds = paginatedOrders
        .filter((o) => o.executionStatus === 'pending')
        .map((o) => o.id);
      setSelectedOrderIds(new Set(pendingIds));
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
  
  const canSelectAll = paginatedOrders.some(o => o.executionStatus === 'pending');
  const isAllVisiblePendingSelected = canSelectAll && paginatedOrders
    .filter(o => o.executionStatus === 'pending')
    .every(o => selectedOrderIds.has(o.id));

  const handleOptimizeSelected = async () => {
    if (selectedOrderIds.size < 2 || !currentUser) return;
    setIsUpdating(true);
    toast({ title: 'Otimizando pedidos...', description: 'Aguarde enquanto calculamos a melhor rota.' });
    
    const result = await optimizeAndGroupOrders(Array.from(selectedOrderIds), new Date(), currentUser.id, currentUser.name);

    if (result.success) {
        toast({ title: 'Pedidos Otimizados!', description: `Nova ordem de serviço mestra ${result.newOrderId} foi criada.` });
        setSelectedOrderIds(new Set());
    } else {
        toast({ title: 'Erro ao Otimizar', description: result.error, variant: 'destructive' });
    }
    setIsUpdating(false);
  };

  return (
    <div className="printable-area">
      <h1 className="text-2xl font-bold hidden print:block mb-4">Relatório de Ordens de Serviço</h1>
      <div className="space-y-4 print:space-y-0">
        <Card className="p-4 print:hidden">
          <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
            <Input
              placeholder="Buscar por cliente, ID ou motorista"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-grow min-w-[200px] max-w-sm"
            />
             <div className="flex flex-wrap gap-2 items-center">
              {selectedOrderIds.size > 1 && (
                <Button variant="secondary" onClick={handleOptimizeSelected} disabled={isUpdating}>
                  <Icons.route className="mr-2 h-4 w-4"/>
                  Otimizar Pedidos ({selectedOrderIds.size})
                </Button>
              )}
              <div className="flex gap-1 p-1 bg-muted rounded-md">
                  <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')}><Icons.listChecks className="h-5 w-5"/></Button>
                  <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('grid')}><Icons.layoutGrid className="h-5 w-5"/></Button>
              </div>
              <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline"><Icons.search className="mr-2 h-4 w-4" /> Filtros</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Filtrar Ordens de Serviço</DialogTitle>
                    <DialogDescription>Ajuste os filtros para encontrar as ordens.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="executionFilter">Status</Label>
                      <Select value={executionFilter} onValueChange={(value) => setExecutionFilter(value as ExecutionStatus | "all")}>
                        <SelectTrigger id="executionFilter"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {Object.entries(orderExecutionStatusTranslations).map(([key, label]) => (
                              <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="dateFrom">De</Label>
                        <Input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dateTo">Até</Label>
                        <Input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={handleClearFilters}>Limpar Filtros</Button>
                    <Button onClick={() => setIsFilterDialogOpen(false)}>Aplicar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button onClick={exportXLSX} variant="outline"><Icons.fileText className="mr-2 h-4 w-4" /> Exportar</Button>
              <Button onClick={handlePrint} variant="outline"><Icons.printer className="mr-2 h-4 w-4" /> Imprimir</Button>
            </div>
          </div>
        </Card>
        
        {isLoading ? (
            <div className="text-center py-10"><Icons.loader className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
        ) : viewMode === 'list' ? (
            <Card className="print:shadow-none print:border-none">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10">
                                <Checkbox
                                    checked={isAllVisiblePendingSelected}
                                    indeterminate={selectedOrderIds.size > 0 && !isAllVisiblePendingSelected}
                                    onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                                    disabled={!canSelectAll}
                                />
                            </TableHead>
                            <SortableHeader sortKey="id" label="ID" />
                            <SortableHeader sortKey="clientCompanyName" label="Cliente" />
                            <SortableHeader sortKey="selectedRouteName" label="Nome da Rota" />
                            <SortableHeader sortKey="assignedDriverName" label="Motorista" />
                            <SortableHeader sortKey="executionDate" label="Execução" />
                            <SortableHeader sortKey="executionStatus" label="Status" />
                            <SortableHeader sortKey="totalValue" label="Total" />
                            <TableHead className="text-right print:hidden">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                    {paginatedOrders.length > 0 ? (
                        paginatedOrders.map((order) => {
                        const statusInfo = getExecutionDisplayInfo(order);
                        const isPending = order.executionStatus === 'pending';
                        return (
                            <TableRow key={order.id}>
                                <TableCell>
                                    <Checkbox
                                        checked={selectedOrderIds.has(order.id)}
                                        onCheckedChange={(checked) => handleSelectOne(order.id, !!checked)}
                                        disabled={!isPending}
                                    />
                                </TableCell>
                                <TableCell className="font-medium">{order.id.substring(0, 8)}...</TableCell>
                                <TableCell>{order.clientCompanyName}</TableCell>
                                <TableCell>{order.selectedRouteName || "Rota Customizada"}</TableCell>
                                <TableCell>{order.assignedDriverName || "N/A"}</TableCell>
                                <TableCell>{getExecutionDateDisplay(order)}</TableCell>
                                <TableCell><Badge variant={statusInfo.variant} className={order.invoiced ? "bg-green-700 text-white" : ""}>{order.invoiced ? "Faturado" : statusInfo.label}</Badge></TableCell>
                                <TableCell className="text-right">R$ {order.totalValue.toFixed(2).replace(".", ",")}</TableCell>
                                <TableCell className="text-right print:hidden">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><span className="sr-only">Abrir</span><Icons.moreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleDuplicateOrder(order)}><Icons.copy className="mr-2 h-4 w-4" />Duplicar Ordem</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => router.push(`/routes/${order.id}/timeline`)}><Icons.listChecks className="mr-2 h-4 w-4" />Ver Linha do Tempo</DropdownMenuItem>
                                    {(order.executionStatus === "completed" || order.executionStatus === "cancelled") && (<DropdownMenuItem onClick={() => router.push(`/routes/${order.id}/report`)}><Icons.fileText className="mr-2 h-4 w-4" />Ver Relatório</DropdownMenuItem>)}
                                    {order.invoiced && (<DropdownMenuItem onClick={() => setOrderForInvoice(order)}><Icons.receipt className="mr-2 h-4 w-4" />Ver Fatura</DropdownMenuItem>)}
                                    {order.pricingMethod === "perBox" && (<DropdownMenuItem onClick={() => setOrderForLabels(order)}><Icons.printer className="mr-2 h-4 w-4" />Gerar Etiquetas</DropdownMenuItem>)}
                                    <DropdownMenuSeparator />
                                    {(order.executionStatus === "pending" || order.executionStatus === "in-progress") && (<DropdownMenuItem onClick={() => router.push(`/orders/${order.id}/edit`)}><Icons.edit className="mr-2 h-4 w-4" />Editar Ordem</DropdownMenuItem>)}
                                    <DropdownMenuSeparator />
                                    {order.executionStatus === 'in-progress' && <DropdownMenuItem onClick={() => setOrderToRevert(order)}><Icons.repeat className="mr-2 h-4 w-4"/>Reverter para Pendente</DropdownMenuItem>}
                                    {(order.executionStatus === 'pending' || order.executionStatus === 'in-progress') && <DropdownMenuItem onClick={() => setOrderToCompleteManually(order)}><Icons.checkCircle className="mr-2 h-4 w-4"/>Forçar Conclusão Manual</DropdownMenuItem>}
                                    {order.invoiced && <DropdownMenuItem onClick={() => setOrderToRevertInvoice(order)}><Icons.receipt className="mr-2 h-4 w-4 text-amber-600"/>Reverter Faturamento</DropdownMenuItem>}
                                    {(order.executionStatus === "pending" || order.executionStatus === "in-progress") && !order.invoiced && (<DropdownMenuItem onClick={() => setOrderToCancel(order)} className="text-destructive focus:text-destructive"><Icons.xCircle className="mr-2 h-4 w-4" />Cancelar Ordem</DropdownMenuItem>)}
                                    {order.executionStatus === "pending" && !order.invoiced && (<DropdownMenuItem onClick={() => setOrderToDelete(order)} className="text-destructive focus:text-destructive"><Icons.delete className="mr-2 h-4 w-4" />Excluir Ordem</DropdownMenuItem>)}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        );
                        })
                    ) : (
                        <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">Nenhuma Ordem de Serviço encontrada.</TableCell></TableRow>
                    )}
                    </TableBody>
                </Table>
            </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedOrders.map(order => {
               const statusInfo = getExecutionDisplayInfo(order);
               const isPending = order.executionStatus === 'pending';
               return (
                <Card key={order.id} className="flex flex-col relative text-xs">
                  {isPending && (
                    <div className="absolute top-1 left-1 z-10 p-1">
                        <Checkbox
                            checked={selectedOrderIds.has(order.id)}
                            onCheckedChange={(checked) => handleSelectOne(order.id, !!checked)}
                        />
                    </div>
                  )}
                  <CardHeader className="p-2">
                    <div className="flex justify-between items-start gap-2">
                       <CardTitle className="text-sm font-bold pl-7 leading-tight">{order.clientCompanyName}</CardTitle>
                       <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" className="h-6 w-6 p-0 flex-shrink-0"><Icons.moreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {/* Re-use the same menu items as the list view */}
                            <DropdownMenuItem onClick={() => handleDuplicateOrder(order)}><Icons.copy className="mr-2 h-4 w-4" />Duplicar Ordem</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/routes/${order.id}/timeline`)}><Icons.listChecks className="mr-2 h-4 w-4" />Ver Linha do Tempo</DropdownMenuItem>
                            {(order.executionStatus === "completed" || order.executionStatus === "cancelled") && (<DropdownMenuItem onClick={() => router.push(`/routes/${order.id}/report`)}><Icons.fileText className="mr-2 h-4 w-4" />Ver Relatório</DropdownMenuItem>)}
                            {order.invoiced && (<DropdownMenuItem onClick={() => setOrderForInvoice(order)}><Icons.receipt className="mr-2 h-4 w-4" />Ver Fatura</DropdownMenuItem>)}
                            {order.pricingMethod === "perBox" && (<DropdownMenuItem onClick={() => setOrderForLabels(order)}><Icons.printer className="mr-2 h-4 w-4" />Gerar Etiquetas</DropdownMenuItem>)}
                            <DropdownMenuSeparator />
                            {(order.executionStatus === "pending" || order.executionStatus === "in-progress") && (<DropdownMenuItem onClick={() => router.push(`/orders/${order.id}/edit`)}><Icons.edit className="mr-2 h-4 w-4" />Editar Ordem</DropdownMenuItem>)}
                            <DropdownMenuSeparator />
                            {order.executionStatus === 'in-progress' && <DropdownMenuItem onClick={() => setOrderToRevert(order)}><Icons.repeat className="mr-2 h-4 w-4"/>Reverter para Pendente</DropdownMenuItem>}
                            {(order.executionStatus === 'pending' || order.executionStatus === 'in-progress') && <DropdownMenuItem onClick={() => setOrderToCompleteManually(order)}><Icons.checkCircle className="mr-2 h-4 w-4"/>Forçar Conclusão Manual</DropdownMenuItem>}
                            {order.invoiced && <DropdownMenuItem onClick={() => setOrderToRevertInvoice(order)}><Icons.receipt className="mr-2 h-4 w-4 text-amber-600"/>Reverter Faturamento</DropdownMenuItem>}
                            {(order.executionStatus === "pending" || order.executionStatus === "in-progress") && !order.invoiced && (<DropdownMenuItem onClick={() => setOrderToCancel(order)} className="text-destructive focus:text-destructive"><Icons.xCircle className="mr-2 h-4 w-4" />Cancelar Ordem</DropdownMenuItem>)}
                            {order.executionStatus === "pending" && !order.invoiced && (<DropdownMenuItem onClick={() => setOrderToDelete(order)} className="text-destructive focus:text-destructive"><Icons.delete className="mr-2 h-4 w-4" />Excluir Ordem</DropdownMenuItem>)}
                          </DropdownMenuContent>
                       </DropdownMenu>
                    </div>
                    <CardDescription className="text-xs">ID: {order.id.substring(0, 8)}...</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-grow space-y-1 text-xs p-2 pt-0">
                      <p><span className="font-semibold text-muted-foreground">Rota:</span> {order.selectedRouteName || "Customizada"}</p>
                      <p><span className="font-semibold text-muted-foreground">Motorista:</span> {order.assignedDriverName || "N/A"}</p>
                      <p><span className="font-semibold text-muted-foreground">Data:</span> {getExecutionDateDisplay(order)}</p>
                  </CardContent>
                  <CardFooter className="flex-col items-start gap-1 p-2 pt-0">
                     <Badge variant={statusInfo.variant} className={cn("w-full justify-center text-xs py-0.5", order.invoiced && "bg-green-700 text-white")}>{order.invoiced ? "Faturado" : statusInfo.label}</Badge>
                     <div className="font-bold text-base text-primary text-center w-full pt-1">R$ {order.totalValue.toFixed(2).replace(".", ",")}</div>
                  </CardFooter>
                </Card>
               )
            })}
          </div>
        )}

        <div className="flex justify-between items-center mt-4 print:hidden">
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <div className="space-x-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Próximo</Button>
          </div>
        </div>
      </div>
      <AlertDialog open={!!orderToCancel} onOpenChange={(open) => !open && setOrderToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Confirmar Cancelamento</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja cancelar a Ordem de Serviço Nº {orderToCancel?.id.substring(0,8)}...? Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel onClick={() => setOrderToCancel(null)}>Voltar</AlertDialogCancel><AlertDialogAction onClick={handleConfirmCancelOrder} disabled={isUpdating} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">{isUpdating && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}Cancelar Ordem</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!orderToDelete} onOpenChange={(open) => !open && setOrderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir a Ordem de Serviço Nº {orderToDelete?.id.substring(0,8)}...?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel onClick={() => setOrderToDelete(null)}>Voltar</AlertDialogCancel><AlertDialogAction onClick={handleConfirmDeleteOrder} disabled={isUpdating} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">{isUpdating && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!orderToRevert} onOpenChange={(open) => !open && setOrderToRevert(null)}>
          <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Confirmar Reversão</AlertDialogTitle><AlertDialogDescription>Deseja reverter a Ordem de Serviço Nº {orderToRevert?.id.substring(0,8)}... para o status &quot;Pendente&quot;? O motorista será notificado.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleRevertToPending} disabled={isUpdating}>Reverter</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!orderToCompleteManually} onOpenChange={(open) => !open && setOrderToCompleteManually(null)}>
          <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Confirmar Conclusão Manual</AlertDialogTitle><AlertDialogDescription>Deseja forçar a conclusão da Ordem de Serviço Nº {orderToCompleteManually?.id.substring(0,8)}...? Todas as paradas serão marcadas como concluídas na data e hora atuais. Esta ação é para casos excepcionais.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleManualCompletion} disabled={isUpdating}>Confirmar Conclusão</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
       <AlertDialog open={!!orderToRevertInvoice} onOpenChange={(open) => !open && setOrderToRevertInvoice(null)}>
          <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Confirmar Reversão de Faturamento</AlertDialogTitle><AlertDialogDescription>Deseja reverter o faturamento da Ordem de Serviço Nº {orderToRevertInvoice?.id.substring(0,8)}...? Ela voltará a ficar disponível na tela de faturamento.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleRevertInvoice} disabled={isUpdating}>Sim, Reverter</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
      <InvoiceDialog isOpen={!!orderForInvoice} onOpenChange={(open) => !open && setOrderForInvoice(null)} order={orderForInvoice} />
      <BoxLabelDialog isOpen={!!orderForLabels} onOpenChange={(open) => !open && setOrderForLabels(null)} order={orderForLabels} />
    </div>
  );
}
