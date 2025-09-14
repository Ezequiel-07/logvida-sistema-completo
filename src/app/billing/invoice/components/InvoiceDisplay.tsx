
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  writeBatch,
  Timestamp,
  documentId
} from "firebase/firestore";
import type { Client } from "@/types/client";
import type { Order } from "@/types/order";
import { formatDateDisplay, toISOString } from "@/lib/utils";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";
import { exportToXlsx } from "@/lib/export-utils";
import { format } from "date-fns";


interface InvoiceDisplayProps {
  clientId: string;
  orderIds: string[];
}

export function InvoiceDisplay({
  clientId,
  orderIds,
}: InvoiceDisplayProps) {
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!clientId || !orderIds || orderIds.length === 0) {
      setError("Parâmetros inválidos. Cliente ou Ordens de Serviço não foram fornecidos.");
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const clientRef = doc(db, "clients", clientId);
        const clientSnap = await getDoc(clientRef);
        if (clientSnap.exists()) {
          setClient({ id: clientSnap.id, ...clientSnap.data() } as Client);
        } else {
          throw new Error("Cliente não encontrado.");
        }

        const ordersRef = collection(db, "orders");
        const q = query(ordersRef, where(documentId(), "in", orderIds));

        const querySnapshot = await getDocs(q);
        const fetchedOrders = querySnapshot.docs
          .map((doc) => sanitizeOrderFromFirestore(doc, "InvoiceDisplay"))
          .filter((o): o is Order => o !== null)
          .sort((a,b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());

        if(fetchedOrders.length !== orderIds.length) {
            console.warn("Algumas OS selecionadas não foram encontradas ou estão em um estado inválido.");
        }
        setOrders(fetchedOrders);

      } catch (e: any) {
        let errorMessage = "Ocorreu um erro desconhecido ao buscar os dados da fatura.";
        if (typeof e.message === "string") errorMessage = e.message;
        
        setError(errorMessage);
        console.error("Erro ao carregar fatura:", e);

        toast({
          title: "Erro ao Carregar Fatura",
          description: "Não foi possível buscar os dados para esta fatura.",
          variant: "destructive",
          duration: 7000,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [clientId, orderIds]);
  
  const handleMarkAsInvoiced = async () => {
    if (orders.length === 0) return;
    setIsProcessing(true);
    toast({ title: 'Processando Fatura...', description: 'Marcando ordens de serviço como faturadas.'});
    try {
        const batch = writeBatch(db);
        orders.forEach(order => {
            const orderRef = doc(db, "orders", order.id);
            batch.update(orderRef, { invoiced: true, invoicedAt: Timestamp.now() });
        });
        await batch.commit();
        toast({ title: "Sucesso!", description: 'Ordens de serviço marcadas como faturadas.' });
        router.push('/orders');
    } catch (e) {
        toast({ title: 'Erro ao Processar', description: 'Não foi possível marcar as ordens como faturadas.', variant: 'destructive'});
    } finally {
        setIsProcessing(false);
    }
  };

  const handlePrintAndProcess = () => {
    window.print();
    handleMarkAsInvoiced();
  };


  const summary = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        acc.totalValue += order.totalValue || 0;
        if (order.pricingMethod === "perRoute") {
          acc.totalKm += order.routeDistanceKm || 0;
        }
        if (order.pricingMethod === "perBox") {
          acc.totalBoxes += order.numberOfBoxes || 0;
        }
        return acc;
      },
      { totalValue: 0, totalKm: 0, totalBoxes: 0 },
    );
  }, [orders]);

  const vidaLogInfo =
    orders[0]?.vidaLogInfo || {
      name: "LogVida Transportes Especializados",
      cnpj: "37.519.142/0001-70",
      address: "Rua Vigário José Poggel, 494",
      cep: "88704-240",
    };
    
  const handleExportXLSX = () => {
    if (!client || orders.length === 0) {
      toast({ title: "Nada para exportar", variant: "default" });
      return;
    }

    const dataToExport: any[][] = [];

    dataToExport.push([vidaLogInfo.name, "", "", "Fatura de Serviços"]);
    dataToExport.push([`CNPJ: ${vidaLogInfo.cnpj}`]);
    dataToExport.push([vidaLogInfo.address]);
    dataToExport.push([]);

    dataToExport.push(["Cliente"]);
    dataToExport.push([client.companyName]);
    dataToExport.push([`CNPJ: ${client.cnpj}`]);
    dataToExport.push([client.address]);
    dataToExport.push([]);

    dataToExport.push(["Data", "Descrição do Serviço", "Detalhes", "KM Total", "Pedágio", "Valor (R$)"]);
    orders.forEach(order => {
      dataToExport.push([
        formatDateDisplay(order.createdAt),
        `Serviço de Transporte - Pedido Nº ${order.id.substring(0,8)}...`,
        order.pricingMethod === "perRoute" ? `Rota: ${order.selectedRouteName || "N/A"}` : `Qtd. Caixas: ${order.numberOfBoxes || "N/A"}`,
        order.routeDistanceKm ? `${order.routeDistanceKm.toFixed(1)} km` : "-",
        order.routeTollCost ? `${order.routeTollCost.toFixed(2)}` : "-",
        `${order.totalValue.toFixed(2)}`
      ]);
    });
    dataToExport.push([]);

    if (summary.totalKm > 0) dataToExport.push(["", "", "", "", "Total de Quilômetros Rodados:", `${summary.totalKm.toFixed(1)} km`]);
    if (summary.totalBoxes > 0) dataToExport.push(["", "", "", "", "Total de Caixas Transportadas:", summary.totalBoxes]);
    dataToExport.push(["", "", "", "", "Valor Total da Fatura:", `R$ ${summary.totalValue.toFixed(2)}`]);

    const filename = `fatura_${client.companyName.replace(/ /g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    exportToXlsx(dataToExport, filename);
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-xl text-muted-foreground">Gerando fatura...</p>
      </div>
    );
  }

  return (
    <Card className="shadow-xl print:shadow-none print:border-none">
      <CardHeader>
        <div className="flex justify-between items-start gap-4">
          <div className="flex items-start gap-4">
            <div className="relative w-16 h-16 shrink-0">
                <Image
                src="/logvida-logo.png"
                alt="Logotipo LogVida"
                fill
                sizes="60px"
                className="object-contain"
                />
            </div>
            <div className="text-sm print:text-xs">
              <p className="font-semibold">{vidaLogInfo.name}</p>
              <p className="text-muted-foreground">{vidaLogInfo.address}</p>
              <p className="text-muted-foreground">CNPJ: {vidaLogInfo.cnpj}</p>
            </div>
          </div>
          <div className="text-right">
            <CardTitle className="text-3xl font-bold text-primary print:text-2xl">
              Fatura de Serviços
            </CardTitle>
            <CardDescription className="print:text-sm">
              Fatura Nº {`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${orderIds[0].substring(0,4)}`}
            </CardDescription>
          </div>
        </div>

        <Separator className="my-4" />

        <div>
          <h3 className="text-lg font-semibold mb-1 print:text-base">
            Cliente
          </h3>
          <p className="font-bold text-primary">{client?.companyName}</p>
          <p className="text-sm text-muted-foreground print:text-xs">
            {client?.address}
          </p>
          <p className="text-sm text-muted-foreground print:text-xs">
            CNPJ: {client?.cnpj}
          </p>
        </div>
      </CardHeader>

      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <Icons.warning className="h-4 w-4" />
            <AlertTitle>Erro na Consulta ao Banco de Dados</AlertTitle>
            <AlertDescription className="break-words">
              <p>A seguinte falha impediu o carregamento da fatura:</p>
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-xs text-destructive-foreground">{error}</pre>
            </AlertDescription>
          </Alert>
        ) : orders.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            Nenhum serviço concluído encontrado para os pedidos selecionados.
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[10%] print:py-0.5 print:px-1 print:text-[9px]">
                    Data
                  </TableHead>
                  <TableHead className="w-[35%] print:py-0.5 print:px-1 print:text-[9px]">
                    Descrição do Serviço
                  </TableHead>
                  <TableHead className="w-[15%] print:py-0.5 print:px-1 print:text-[9px]">
                    Detalhes
                  </TableHead>
                  <TableHead className="w-[15%] text-right print:py-0.5 print:px-1 print:text-[9px]">
                    KM Total
                  </TableHead>
                  <TableHead className="w-[10%] text-right print:py-0.5 print:px-1 print:text-[9px]">
                    Pedágio
                  </TableHead>
                  <TableHead className="w-[15%] text-right print:py-0.5 print:px-1 print:text-[9px]">
                    Valor
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id} className="print:text-[9px]">
                    <TableCell className="print:py-0.5 print:px-1">
                      {formatDateDisplay(order.createdAt)}
                    </TableCell>
                    <TableCell className="print:py-0.5 print:px-1">
                      <div className="font-medium">Serviço de Transporte</div>
                      <div className="text-xs text-muted-foreground print:text-[8px]">
                        Pedido Nº {order.id.substring(0,8)}...
                      </div>
                    </TableCell>
                    <TableCell className="text-xs print:py-0.5 print:px-1 print:text-[8px]">
                      {order.pricingMethod === "perRoute" &&
                        `Rota: ${order.selectedRouteName || "N/A"}`}
                      {order.pricingMethod === "perBox" &&
                        `Qtd. Caixas: ${order.numberOfBoxes || "N/A"}`}
                    </TableCell>
                    <TableCell className="text-right font-mono print:py-0.5 print:px-1">
                      {order.routeDistanceKm
                        ? `${order.routeDistanceKm.toFixed(1).replace(".", ",")} km`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono print:py-0.5 print:px-1">
                      {order.routeTollCost
                        ? `R$ ${order.routeTollCost.toFixed(2).replace(".", ",")}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono print:py-0.5 print:px-1">
                      R$ {order.totalValue.toFixed(2).replace(".", ",")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Separator className="my-6 print:my-4" />

            <div className="flex justify-end">
              <div className="w-full max-w-sm space-y-3 print:space-y-1">
                <h3 className="text-xl font-semibold print:text-base">
                  Resumo da Fatura
                </h3>
                {summary.totalKm > 0 && (
                  <div className="flex justify-between text-sm print:text-xs">
                    <span className="text-muted-foreground">
                      Total de Quilômetros Rodados:
                    </span>
                    <span className="font-medium">
                      {summary.totalKm.toFixed(1).replace(".", ",")} km
                    </span>
                  </div>
                )}
                {summary.totalBoxes > 0 && (
                  <div className="flex justify-between text-sm print:text-xs">
                    <span className="text-muted-foreground">
                      Total de Caixas Transportadas:
                    </span>
                    <span className="font-medium">{summary.totalBoxes}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-lg font-bold text-primary print:text-base">
                  <span>Valor Total da Fatura:</span>
                  <span>
                    R$ {summary.totalValue.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <CardFooter className="print:hidden border-t pt-6 flex flex-col sm:flex-row sm:justify-end items-stretch sm:items-center gap-2">
        <Button
          variant="outline"
          onClick={() => router.back()}
          className="w-full sm:w-auto"
        >
          <Icons.chevronDown className="mr-2 h-4 w-4 -rotate-90" /> Voltar
        </Button>
        <Button
          onClick={handleExportXLSX}
          disabled={orders.length === 0 || !!error}
          className="w-full sm:w-auto"
          variant="secondary"
        >
          <Icons.fileText className="mr-2 h-4 w-4" /> Exportar para Excel
        </Button>
        <Button
          onClick={handlePrintAndProcess}
          disabled={orders.length === 0 || !!error || isProcessing}
          className="w-full sm:w-auto"
        >
          {isProcessing ? <Icons.loader className="mr-2 h-4 w-4 animate-spin"/> : <Icons.printer className="mr-2 h-4 w-4" />}
          Emitir e Marcar como Faturado
        </Button>
      </CardFooter>
    </Card>
  );
}
