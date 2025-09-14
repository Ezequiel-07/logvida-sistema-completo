
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { toast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  Timestamp,
} from "firebase/firestore";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import type { Client } from "@/types/client";
import { toISOString } from "@/lib/utils";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

export function BillingClient() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  const today = new Date();
  const firstDay = startOfMonth(today);
  const lastDay = endOfMonth(today);
  
  const [dateFrom, setDateFrom] = useState(format(firstDay, "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(lastDay, "yyyy-MM-dd"));

  const fetchClients = useCallback(async () => {
    setIsLoadingClients(true);
    try {
      const clientsCollectionRef = collection(db, "clients");
      const q = query(clientsCollectionRef, orderBy("companyName", "asc"));
      const querySnapshot = await getDocs(q);
      const clientsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: toISOString(doc.data().createdAt) || new Date().toISOString(),
      })) as Client[];
      setClients(clientsData);
    } catch (error: unknown) {
      toast({
        title: "Erro ao Carregar Clientes",
        description: "Não foi possível buscar os dados dos clientes.",
        variant: "destructive",
      });
      setClients([]);
    } finally {
      setIsLoadingClients(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const fetchOrders = useCallback(async () => {
    if (!selectedClientId || !dateFrom || !dateTo) {
      setOrders([]);
      return;
    }
    setIsLoadingOrders(true);
    setSelectedOrderIds(new Set()); // Reset selection
    try {
        const ordersRef = collection(db, "orders");
        const startDate = Timestamp.fromDate(new Date(`${dateFrom}T00:00:00`));
        const endDate = Timestamp.fromDate(new Date(`${dateTo}T23:59:59`));

        // Buscamos pela data de CRIAÇÃO para pegar todas as OS do período.
        // O status de "completed" e "invoiced" será filtrado localmente.
        const q = query(
          ordersRef,
          where("clientId", "==", selectedClientId),
          where("createdAt", ">=", startDate),
          where("createdAt", "<=", endDate),
          orderBy("createdAt", "asc"),
        );
        const querySnapshot = await getDocs(q);
        
        const fetchedOrders = querySnapshot.docs
          .map((doc) => sanitizeOrderFromFirestore(doc, "BillingClient"))
          .filter((o): o is Order => o !== null)
          // Filtramos localmente para pegar apenas as concluídas e não faturadas
          .filter(o => o.executionStatus === 'completed' && o.invoiced !== true);

        setOrders(fetchedOrders);
    } catch (e: any) {
        console.error("Error fetching orders for billing: ", e);
        toast({ title: "Erro ao buscar Ordens de Serviço", description: "Ocorreu um problema ao consultar o banco de dados.", variant: "destructive"});
    } finally {
        setIsLoadingOrders(false);
    }

  }, [selectedClientId, dateFrom, dateTo]);
  
  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setSelectedOrderIds(new Set(orders.map(o => o.id)));
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

  const handleGenerateInvoice = () => {
    if (selectedOrderIds.size === 0) {
      toast({ title: "Nenhum pedido selecionado", variant: "destructive" });
      return;
    }
    
    const queryParams = new URLSearchParams();
    queryParams.set("clientId", selectedClientId);
    selectedOrderIds.forEach(id => queryParams.append("orderIds", id));

    router.push(`/billing/invoice?${queryParams.toString()}`);
  };

  const totalSelectedValue = orders
    .filter(o => selectedOrderIds.has(o.id))
    .reduce((sum, o) => sum + (o.totalValue || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg">
        <div className="md:col-span-1">
            <Label htmlFor="client-select">1. Selecione o Cliente</Label>
            <Select value={selectedClientId} onValueChange={setSelectedClientId} disabled={isLoadingClients}>
            <SelectTrigger id="client-select">
                <SelectValue placeholder={isLoadingClients ? "Carregando..." : "Selecione um cliente"} />
            </SelectTrigger>
            <SelectContent>
                {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                    {client.companyName}
                </SelectItem>
                ))}
            </SelectContent>
            </Select>
        </div>
        <div className="grid grid-cols-2 gap-4 md:col-span-2">
            <div>
            <Label htmlFor="date-from">2. Período (De)</Label>
            <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
            />
            </div>
            <div>
            <Label htmlFor="date-to">Período (Até)</Label>
            <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
            />
            </div>
        </div>
         <div className="md:col-span-3 text-center">
            <Button onClick={fetchOrders} disabled={!selectedClientId || isLoadingOrders}>
                {isLoadingOrders && <Icons.loader className="mr-2 h-4 w-4 animate-spin"/>}
                Buscar Ordens de Serviço Concluídas
            </Button>
         </div>
      </div>

        {orders.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">3. Selecione as Ordens para Faturar</h3>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox 
                        onCheckedChange={handleSelectAll}
                        checked={selectedOrderIds.size > 0 && selectedOrderIds.size === orders.length}
                        indeterminate={selectedOrderIds.size > 0 && selectedOrderIds.size < orders.length}
                      />
                    </TableHead>
                    <TableHead>Nº Pedido</TableHead>
                    <TableHead>Data Criação</TableHead>
                    <TableHead>Valor (R$)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map(order => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Checkbox 
                          onCheckedChange={(checked) => handleSelectOne(order.id, Boolean(checked))}
                          checked={selectedOrderIds.has(order.id)}
                        />
                      </TableCell>
                      <TableCell>{order.id.substring(0,8)}...</TableCell>
                      <TableCell>{format(parseISO(order.createdAt!), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="font-mono">{order.totalValue.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Separator />
            <div className="flex flex-col sm:flex-row justify-between items-center p-4 bg-muted/50 rounded-lg gap-4">
                <div className="text-center sm:text-left">
                    <p className="text-sm text-muted-foreground">Valor Total Selecionado:</p>
                    <p className="text-2xl font-bold text-primary">R$ {totalSelectedValue.toFixed(2)}</p>
                </div>
                <Button 
                    onClick={handleGenerateInvoice} 
                    disabled={selectedOrderIds.size === 0} 
                    size="lg"
                    className="w-full sm:w-auto"
                >
                    <Icons.fileText className="mr-2 h-4 w-4" />
                    <span className="sm:hidden">Gerar Fatura ({selectedOrderIds.size})</span>
                    <span className="hidden sm:inline">Gerar Fatura para OS Selecionadas ({selectedOrderIds.size})</span>
                </Button>
            </div>
          </div>
        )}
      
    </div>
  );
}
