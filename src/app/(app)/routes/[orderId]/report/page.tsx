
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";
import type { Order, RouteStop } from "@/types/order";
import { cn, formatDateDisplay } from "@/lib/utils";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";
import Image from "next/image";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// This line tells Next.js to render this page dynamically on the client
// and not attempt to pre-build it, which is necessary for 'output: export'.
export const dynamic = 'force-dynamic';


type RouteSummaryItem = {
  label: string;
  value: string;
  className?: string;
};

const stopTypeTranslations: Record<RouteStop["type"], string> = {
  origin: "Origem",
  intermediate: "Parada",
  destination: "Destino",
};

export default function RouteReportPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = Array.isArray(params.orderId)
    ? params.orderId[0]
    : params.orderId;

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      toast({
        title: "Erro",
        description: "ID do pedido não encontrado.",
        variant: "destructive",
      });
      router.push("/orders");
      return;
    }

    const fetchOrder = async () => {
      try {
        const orderDocRef = doc(db, "orders", orderId);
        const orderDocSnap = await getDoc(orderDocRef);

        if (orderDocSnap.exists()) {
          const sanitizedOrder = sanitizeOrderFromFirestore(
            orderDocSnap,
            "RouteReport",
          );
          if (
            sanitizedOrder?.executionStatus === "completed" ||
            sanitizedOrder?.executionStatus === "cancelled"
          ) {
            setOrder(sanitizedOrder);
          } else {
            toast({
              title: "Relatório Indisponível",
              description:
                "Este relatório só está disponível para pedidos concluídos ou cancelados.",
            });
            router.push(`/routes/${orderId}/timeline`);
          }
        } else {
          toast({
            title: "Erro",
            description: "Pedido não encontrado.",
            variant: "destructive",
          });
          router.push("/orders");
        }
      } catch (error) {
        toast({
          title: "Erro de Rede",
          description: "Não foi possível buscar os dados do pedido.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, router]);

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-xl">Carregando relatório...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-10">
        <p>Não foi possível carregar o relatório do pedido.</p>
      </div>
    );
  }

  const allStops: RouteStop[] = [
    order.originStop,
    ...(order.intermediateStopsOrder || []),
    order.destinationStop,
  ].filter(Boolean) as RouteStop[];

  const getStatusInfo = (
    status: Order["executionStatus"],
  ): { text: string; variant: "default" | "destructive" } => {
    switch (status) {
      case "completed":
        return { text: "Concluído", variant: "default" };
      case "cancelled":
        return { text: "Cancelado", variant: "destructive" };
      default:
        return { text: status, variant: "default" };
    }
  };

  const statusInfo = getStatusInfo(order.executionStatus);

  const routeSummaryItems: RouteSummaryItem[] = [
    { label: "Status do Pedido", value: statusInfo.text, className: `font-bold ${statusInfo.variant === 'destructive' ? 'text-destructive' : 'text-primary'}` },
    { label: "Data de Conclusão", value: formatDateDisplay(order.completedAt, true) || "N/A" },
    { label: "Distância Total", value: `${order.routeDistanceKm?.toFixed(1) ?? 'N/A'} km` },
    { label: "Duração Total", value: `${Math.round(order.totalDurationMinutes ?? 0)} min` },
    { label: "Custo Pedágios", value: `R$ ${order.routeTollCost?.toFixed(2).replace('.', ',') ?? 'N/A'}` },
    { label: "Custo Combustível", value: `R$ ${order.fuelCost?.toFixed(2).replace('.', ',') ?? 'N/A'}` },
    { label: "Valor Frete", value: `R$ ${order.transportServiceCost?.toFixed(2).replace('.', ',') ?? 'N/A'}` },
    { label: "Valor Total", value: `R$ ${order.totalValue?.toFixed(2).replace('.', ',') ?? 'N/A'}`, className: "text-xl font-bold text-primary" },
  ];
  
  const getPhotoUrlsForStop = (stop: RouteStop): {label: string; url: string}[] => {
      const photos: {label: string; url: string}[] = [];
      if(stop.loadingPhotoProofDataUrls) photos.push(...stop.loadingPhotoProofDataUrls.map(url => ({label: 'Carregamento', url})));
      if(stop.deliveryPhotoProofDataUrls) photos.push(...stop.deliveryPhotoProofDataUrls.map(url => ({label: 'Entrega', url})));
      if(stop.collectionPhotoProofDataUrls) photos.push(...stop.collectionPhotoProofDataUrls.map(url => ({label: 'Coleta', url})));
      if(stop.unloadingPhotoProofDataUrls) photos.push(...stop.unloadingPhotoProofDataUrls.map(url => ({label: 'Descarregamento', url})));
      return photos;
  }
  
  const signatureDataUrl = order.destinationStop?.signatureDataUrl;

  return (
    <>
    <div className="w-full max-w-4xl mx-auto py-8 printable-area">
      <Card className="shadow-xl print:shadow-none print:border-none">
        <CardHeader className="text-center print:text-left print:p-2">
           <div className="flex flex-col sm:flex-row justify-between items-center print:items-start">
             <div className="flex items-center gap-3">
                <div className="relative w-16 h-16">
                    <Image src="/logvida-logo.png" alt="LogVida" fill sizes="60px" className="object-contain" data-ai-hint="company logo" />
                </div>
               <div>
                  <CardTitle className="text-3xl font-bold text-primary text-left">Relatório de Rota</CardTitle>
                  <CardDescription className="text-left">Pedido Nº: {order.id}</CardDescription>
               </div>
             </div>
             <div className="flex items-center gap-2 mt-4 sm:mt-0 print:hidden">
                <Button variant="outline" onClick={() => router.push(`/routes/${orderId}/timeline`)}>
                  <Icons.listChecks className="mr-2 h-4 w-4" />
                  Voltar para Timeline
                </Button>
                <Button variant="outline" onClick={handlePrint}><Icons.printer className="mr-2 h-4 w-4" />Imprimir / Salvar PDF</Button>
             </div>
           </div>
        </CardHeader>
        
        <CardContent className="space-y-6 print:p-2">
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <div className="space-y-1">
                    <p><strong>Cliente:</strong> {order.clientCompanyName}</p>
                    <p><strong>CNPJ:</strong> {order.clientCnpj}</p>
                    <p><strong>Rota:</strong> {order.selectedRouteName || "Rota Customizada"}</p>
                </div>
                <div className="space-y-1 text-left md:text-right">
                    <p><strong>Motorista:</strong> {order.assignedDriverName}</p>
                    <p><strong>Veículo:</strong> {order.assignedVehicleName} ({order.assignedVehiclePlate})</p>
                    <p><strong>Data de Criação:</strong> {formatDateDisplay(order.createdAt, true)}</p>
                </div>
            </section>
            
            <Separator />
            
            <section>
              <h3 className="text-lg font-semibold mb-3 text-primary">Resumo Financeiro e Operacional</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {routeSummaryItems.map(item => (
                  <div key={item.label} className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className={cn("text-lg font-semibold", item.className)}>{item.value}</p>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <section>
              <h3 className="text-lg font-semibold mb-3 text-primary">Linha do Tempo das Paradas</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Endereço</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notas/Fotos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allStops.map((stop) => (
                    <TableRow key={stop.id}>
                      <TableCell>{stopTypeTranslations[stop.type]}</TableCell>
                      <TableCell>{stop.address.description}</TableCell>
                      <TableCell>{formatDateDisplay(stop.checkedAt, true) || 'N/A'}</TableCell>
                      <TableCell>
                          <Badge variant={stop.status === 'completed' ? 'default' : 'destructive'}>
                            {stop.status === 'completed' ? 'Concluído' : 'Pulado'}
                          </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2 items-start">
                           {stop.notes && <p className="text-xs italic">&quot;{stop.notes}&quot;</p>}
                           <div className="flex flex-wrap gap-2">
                               {getPhotoUrlsForStop(stop).map((photo, index) => (
                                   <button key={index} onClick={() => setZoomedImageUrl(photo.url)} className="block group text-left">
                                       <div className="relative w-[60px] h-[45px] rounded-md border overflow-hidden">
                                         <Image src={photo.url} alt={`Foto de ${photo.label}`} fill sizes="60px" className="object-cover group-hover:opacity-80 transition-opacity" data-ai-hint="proof document" />
                                       </div>
                                   </button>
                               ))}
                           </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
             {signatureDataUrl && (
                <section>
                    <Separator />
                    <h3 className="text-lg font-semibold my-3 text-primary">Comprovante de Entrega</h3>
                    <div className="p-4 border-dashed border-2 rounded-lg inline-block bg-muted/30">
                        <p className="text-sm font-medium mb-2">Assinatura do Recebedor:</p>
                        <div className="relative w-[300px] h-[150px] bg-white rounded-md shadow-inner">
                          <Image src={signatureDataUrl} alt="Assinatura do recebedor" fill sizes="300px" className="object-contain" data-ai-hint="signature delivery" />
                        </div>
                    </div>
                </section>
             )}
        </CardContent>

      </Card>
    </div>
    
      <Dialog open={!!zoomedImageUrl} onOpenChange={(open) => !open && setZoomedImageUrl(null)}>
        <DialogContent className="max-w-4xl w-full h-auto p-2 bg-transparent border-none shadow-none">
          <Image src={zoomedImageUrl || "https://placehold.co/1x1.png"} alt="Visualização da imagem da parada" width={1280} height={960} className="w-full h-full object-contain rounded-lg" />
        </DialogContent>
      </Dialog>
    </>
  );
}
