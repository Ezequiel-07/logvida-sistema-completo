
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { Order, RouteStop as OrderRouteStop } from "@/types/order";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { Icons } from "@/components/icons";
import { Progress } from "@/components/ui/progress";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, DocumentSnapshot } from "firebase/firestore";
import { Label } from "@/components/ui/label";
import { cn, formatDateDisplay, toISOString } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";
import { Separator } from "@/components/ui/separator";
import { useSharedGoogleMapsLoader } from "@/lib/googleMaps";
import {
  GoogleMap,
  DirectionsRenderer,
  MarkerF,
} from "@react-google-maps/api";
import { useTheme } from "next-themes";
import { nightMapStyle } from "@/lib/map-styles";
import { toast } from "@/hooks/use-toast";

const stopTypeTranslations: Record<OrderRouteStop["type"], string> = {
  origin: "Origem",
  intermediate: "Parada",
  destination: "Destino",
};

const getStopLabel = (
  stop: OrderRouteStop,
  index: number,
  totalStops: number,
): string => {
  if (stop.type === "origin") return "O";
  if (stop.type === "destination") return "D";
  if (index === 0) return "O";
  if (index === totalStops - 1 && totalStops > 1) return "D";
  return `P${index}`;
};

const getStatusText = (status: Order["executionStatus"]) => {
  switch (status) {
    case "in-progress":
      return "Em Trânsito";
    case "completed":
      return "Concluído";
    case "pending":
      return "Pendente";
    case "cancelled":
      return "Cancelado";
    default:
      return "Desconhecido";
  }
};

const formatDuration = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return "N/D";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return `${hours}h ${remainingMinutes}m`;
};

const defaultMapCenter = { lat: -28.4774, lng: -49.0079 };

export function PublicTimeline({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  const { isLoaded, loadError } = useSharedGoogleMapsLoader();
  const { resolvedTheme } = useTheme();
  const mapRef = useRef<google.maps.Map | null>(null);

  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [driverLocation, setDriverLocation] = useState<{lat: number; lng: number;} | null>(null);
  

  const mapOptions = useMemo(
    () => ({
      disableDefaultUI: true,
      zoomControl: true,
      styles: resolvedTheme === 'dark' ? nightMapStyle : [],
    }),
    [resolvedTheme],
  );

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    if (directions) {
        map.fitBounds(directions.routes[0].bounds);
    } else {
        map.panTo(defaultMapCenter);
    }
  }, [directions]);
  
  useEffect(() => {
    if (!isLoaded || directions) return;
    if (order?.originStop?.address?.description && order.destinationStop?.address?.description) {
      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route({
        origin: order.originStop.address.description,
        destination: order.destinationStop.address.description,
        waypoints: (order.intermediateStopsOrder || []).map(s => ({ location: s.address.description, stopover: true })),
        travelMode: google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status === 'OK' && result) {
          setDirections(result);
        } else {
           console.warn(`Public map route calculation failed: ${status}`);
        }
      });
    }
  }, [isLoaded, order, directions]);

  useEffect(() => {
    if (!orderId) {
      setError("ID do pedido não fornecido.");
      setIsLoading(false);
      return;
    }
  
    let unsubscribeDriver: (() => void) | null = null;
  
    const orderRef = doc(db, "orders", orderId);
    const unsubscribeOrder = onSnapshot(
      orderRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          const loadedOrder = sanitizeOrderFromFirestore(docSnap as DocumentSnapshot, "PublicTimeline");
          setOrder(loadedOrder);
          setError(null);
  
          if (loadedOrder?.executionStatus === 'in-progress' && loadedOrder.assignedDriverId) {
            // Setup new driver listener only if it doesn't exist or driver changed
            if (!unsubscribeDriver) {
              const driverLocationRef = doc(db, 'driverLocations', loadedOrder.assignedDriverId);
              unsubscribeDriver = onSnapshot(driverLocationRef, (driverSnap) => {
                if (driverSnap.exists()) {
                  const data = driverSnap.data();
                  setDriverLocation({ lat: data.latitude, lng: data.longitude });
                }
              });
            }
          } else {
            // Clean up listener if status is no longer in-progress
            if (unsubscribeDriver) {
              unsubscribeDriver();
              unsubscribeDriver = null;
            }
            setDriverLocation(null);
          }
        } else {
          setError("Pedido não encontrado.");
          setOrder(null);
        }
        setIsLoading(false);
      },
      (_err) => {
        setError("Não foi possível carregar os dados do pedido em tempo real.");
        setIsLoading(false);
      }
    );
  
    return () => {
      unsubscribeOrder();
      if (unsubscribeDriver) {
        unsubscribeDriver();
      }
    };
  }, [orderId]);
  
  const allStops = useMemo(() => {
    if (!order) return [];
    return [
      order.originStop,
      ...(order.intermediateStopsOrder || []),
      order.destinationStop,
    ].filter(Boolean) as OrderRouteStop[];
  }, [order]);
  
  const getPhotoUrlsForStop = (stop: OrderRouteStop): {label: string; url: string}[] => {
      const photos: {label: string; url: string}[] = [];
      if(stop.loadingPhotoProofDataUrls) photos.push(...stop.loadingPhotoProofDataUrls.map(url => ({label: 'Carregamento', url})));
      if(stop.deliveryPhotoProofDataUrls) photos.push(...stop.deliveryPhotoProofDataUrls.map(url => ({label: 'Entrega', url})));
      if(stop.collectionPhotoProofDataUrls) photos.push(...stop.collectionPhotoProofDataUrls.map(url => ({label: 'Coleta', url})));
      if(stop.unloadingPhotoProofDataUrls) photos.push(...stop.unloadingPhotoProofDataUrls.map(url => ({label: 'Descarregamento', url})));
      return photos;
  }

  const completedStopsCount = useMemo(
    () =>
      allStops.filter(
        (stop) => stop.status === "completed" || stop.status === "skipped",
      ).length,
    [allStops],
  );

  const totalStopsCount = allStops.length;
  const progress =
    totalStopsCount > 0 ? (completedStopsCount / totalStopsCount) * 100 : 0;
    
  const getMarkerOptions = (stop: OrderRouteStop, index: number): google.maps.MarkerOptions | null => {
      if (!stop.address.latitude || !stop.address.longitude) return null;
      const isCompleted = stop.status === 'completed' || stop.status === 'skipped';
      const labelText = getStopLabel(stop, index, allStops.length);

      return {
        label: {
            text: labelText,
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 'bold',
        },
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: isCompleted ? '#9CA3AF' : '#1E90FF', // Gray for completed, Blue for pending
            fillOpacity: 1.0,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
            scale: 7,
        },
        zIndex: 1
      };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Icons.loader className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <Card className="shadow-lg max-w-lg mx-auto mt-10">
        <CardContent className="text-center py-10 text-destructive">
            <Icons.warning className="h-12 w-12 mx-auto mb-3" />
            <p className="font-semibold">{error || "Pedido não encontrado."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="h-80 md:h-96 w-full rounded-lg overflow-hidden shadow-md border">
          {loadError ? <div className="bg-muted flex items-center justify-center h-full">Erro ao carregar mapa.</div> :
           isLoaded ? <GoogleMap mapContainerStyle={{width: '100%', height: '100%'}} options={mapOptions} onLoad={onMapLoad}>
               {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers: true, polylineOptions: { strokeColor: "#1E90FF", strokeWeight: 5 } }} />}
               {allStops.map((stop, index) => {
                   const markerOptions = getMarkerOptions(stop, index);
                   if (!markerOptions || !stop.address.latitude || !stop.address.longitude) return null;
                   return <MarkerF key={stop.id} position={{lat: stop.address.latitude, lng: stop.address.longitude}} options={markerOptions} />;
               })}
               {driverLocation && <MarkerF position={driverLocation} title="Localização Atual" icon={{ path: "M20,8h-3V4H3C1.9,4,1,4.9,1,6v11h2c0,1.7,1.3,3,3,3s3-1.3,3-3h6c0,1.7,1.3,3,3,3s3-1.3,3-3h2V13L20,8z M6,18.5C5.2,18.5,4.5,17.8,4.5,17s0.7-1.5,1.5-1.5s1.5,0.7,1.5,1.5S6.8,18.5,6,18.5z M18,18.5c-0.8,0-1.5-0.7-1.5-1.5s0.7-1.5,1.5-1.5s1.5,0.7,1.5,1.5S18.8,18.5,18,18.5z M17,11h2.5l1.8,2.5H17V11z", fillColor: "hsl(var(--primary))", fillOpacity: 1, strokeWeight: 1, strokeColor: "hsl(var(--card))", scale: 1.2, anchor: new window.google.maps.Point(12, 12) }}/>}
           </GoogleMap> : <div className="bg-muted flex items-center justify-center h-full"><Icons.loader className="h-8 w-8 animate-spin text-primary"/></div>
          }
        </div>
        
        <Card className="shadow-lg max-w-3xl mx-auto -mt-20 z-10 relative">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
              <div>
                <p className="text-sm font-semibold text-primary">RASTREAMENTO DE PEDIDO</p>
                <h1 className="text-2xl font-bold">Pedido Nº {order.id.substring(0,8)}</h1>
              </div>
              <Badge variant={
                order.executionStatus === "completed" ? "default" :
                order.executionStatus === "in-progress" ? "secondary" :
                "outline"
              } className="text-sm px-3 py-1">
                { getStatusText(order.executionStatus) }
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h3 className="font-semibold mb-1">Destinatário</h3>
                <p>{order.clientCompanyName}</p>
                <p className="text-muted-foreground">{order.clientAddress}</p>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Detalhes da Entrega</h3>
                <p><span className="text-muted-foreground">Motorista:</span> {order.assignedDriverName || "Aguardando atribuição"}</p>
                <p><span className="text-muted-foreground">Data Prevista:</span> {formatDateDisplay(order.serviceDate, false) || "Não especificada"}</p>
              </div>
            </div>
            
            <Separator />
            
            <div className="grid grid-cols-2 text-center text-sm">
              <div>
                <p className="font-semibold">Distância Total</p>
                <p className="text-muted-foreground">{order.routeDistanceKm?.toFixed(1) ?? 'N/A'} km</p>
              </div>
              <div>
                <p className="font-semibold">Duração Estimada</p>
                <p className="text-muted-foreground">{formatDuration(order.totalDurationMinutes)}</p>
              </div>
            </div>

            {totalStopsCount > 0 && (
                <div className="space-y-2 pt-2">
                <Label className="text-xs">
                    Progresso da Entrega ({completedStopsCount} de {totalStopsCount} paradas)
                </Label>
                <Progress value={progress} className="w-full h-2" />
                </div>
            )}
          </CardContent>
        </Card>

        <div className="max-w-3xl mx-auto mt-6">
            <ol className="relative border-s border-gray-200 dark:border-gray-700 ml-4">
            {allStops.map((stop, index) => {
                const isCompleted = stop.status === "completed";
                const isSkipped = stop.status === 'skipped';
                const isPostponed = stop.unloadingConfirmed === 'postponed';
                const isCurrent = !isCompleted && !isSkipped && !isPostponed && index === completedStopsCount;

                return (
                <li key={stop.id} className="mb-10 ms-6">
                    <span className={cn("absolute flex items-center justify-center w-6 h-6 rounded-full -start-3 ring-8 ring-white dark:ring-gray-900", isCompleted && !isPostponed ? "bg-green-500" : isSkipped ? "bg-destructive" : isCurrent ? "bg-primary animate-pulse" : isPostponed ? "bg-amber-500" : "bg-gray-200 dark:bg-gray-700")}>
                    {isCompleted && !isPostponed ? <Icons.check className="h-3 w-3 text-white" /> : isSkipped ? <Icons.xCircle className="h-3 w-3 text-white" /> : isPostponed ? <Icons.clock className="h-3 w-3 text-white" /> : <Icons.mapPin className={cn("h-3 w-3", isCurrent ? "text-primary-foreground" : "text-gray-500 dark:text-gray-300")} />}
                    </span>
                    <h3 className="flex items-center mb-1 text-lg font-semibold text-gray-900 dark:text-white">
                    {stop.name || stopTypeTranslations[stop.type]} -{" "}{getStopLabel(stop, index, totalStopsCount)}
                    {isCompleted && !isPostponed && (<Badge variant="default" className="bg-green-500 hover:bg-green-500/90 text-white text-xs font-medium me-2 px-2.5 py-0.5 rounded dark:bg-green-900 dark:text-green-300 ms-3">Concluído</Badge>)}
                   {isSkipped && (<Badge variant="destructive" className="text-xs font-medium me-2 px-2.5 py-0.5 rounded ms-3">Pulado</Badge>)}
                    {isCurrent && (<Badge variant="outline" className="text-xs font-medium me-2 px-2.5 py-0.5 rounded text-primary border-primary ms-3">Em Trânsito Para</Badge>)}
                    {isPostponed && (<Badge variant="destructive" className="bg-amber-500 hover:bg-amber-500/90 text-white text-xs font-medium me-2 px-2.5 py-0.5 rounded ms-3">Em Espera</Badge>)}
                    </h3>
                    <time className="block mb-2 text-sm font-normal leading-none text-gray-400 dark:text-gray-500">Endereço: {stop.address.description}</time>
                    {stop.checkedAt && (<time className="block mb-2 text-sm font-normal leading-none text-gray-400 dark:text-gray-500">Check-in: {formatDateDisplay(stop.checkedAt, true)}</time>)}
                    {stop.notes && (<p className={cn("italic mt-2 text-sm", isSkipped && "text-destructive")}><span className="font-semibold">{isSkipped ? "Motivo:" : "Notas:"}</span>{" "}{stop.notes}</p>)}
                    <div className="flex flex-wrap gap-2 items-center mt-3">
                       {getPhotoUrlsForStop(stop).map((photo, index) => (
                         <button key={index} onClick={() => setZoomedImageUrl(photo.url)} className="block group text-left">
                           <p className="text-xs font-medium text-muted-foreground mb-1">Comprovação ({photo.label}):</p>
                           <Image src={photo.url} alt={`Foto de ${photo.label}`} width={100} height={75} className="rounded-md border object-cover group-hover:opacity-80 transition-opacity" data-ai-hint="proof document" />
                         </button>
                       ))}
                    </div>
                </li>
                );
            })}
            </ol>

            {order.executionStatus === "completed" && (
            <div className="text-center text-muted-foreground mt-8 text-green-600">
                <Icons.checkCircle className="h-10 w-10 mx-auto mb-2" />
                <p className="text-lg font-semibold">Entrega Concluída!</p>
                {order.completedAt && (<p className="text-sm">Finalizado em: {formatDateDisplay(order.completedAt, true)}</p>)}
            </div>
            )}
        </div>
      </div>

      <Dialog open={!!zoomedImageUrl} onOpenChange={(open) => !open && setZoomedImageUrl(null)}>
        <DialogContent className="max-w-4xl w-full h-auto p-2 bg-transparent border-none shadow-none">
          <DialogHeader>
             <DialogTitle className="sr-only">Visualização de Imagem</DialogTitle>
             <DialogDescription className="sr-only">Imagem da parada ampliada.</DialogDescription>
          </DialogHeader>
          <Image src={zoomedImageUrl || "https://placehold.co/1x1.png"} alt="Visualização da imagem da parada" width={1280} height={960} className="w-full h-full object-contain rounded-lg" />
        </DialogContent>
      </Dialog>
    </>
  );
}
