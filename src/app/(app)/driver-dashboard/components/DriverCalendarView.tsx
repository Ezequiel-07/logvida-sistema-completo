
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { GoogleMap, DirectionsRenderer } from "@react-google-maps/api";
import { useSharedGoogleMapsLoader } from "@/lib/googleMaps";
import type { Order } from "@/types/order";
import {
  startOfDay,
  parseISO,
  isValid,
  format,
  getDay,
  isSameDay,
  startOfMonth,
  eachDayOfInterval,
  endOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DayOfWeek } from "@/types/route";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { nightMapStyle } from "@/lib/map-styles";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { doc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";
import { startOrderExecution } from "@/server/actions/orders";
import { useAuth } from "@/hooks/useAuth";

const dayOfWeekToJsDay: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const defaultMapCenter = { lat: -28.4774, lng: -49.0079 }; // Tubarão, SC

interface DriverCalendarViewProps {
  allOrders: Order[];
  isLoading: boolean;
  onOrderSelect: (order: Order | null) => void;
  selectedOrder: Order | null;
}

export function DriverCalendarView({ allOrders, isLoading, onOrderSelect, selectedOrder }: DriverCalendarViewProps) {
  const { isLoaded: isMapLoaded, loadError } = useSharedGoogleMapsLoader();
  const { resolvedTheme } = useTheme();
  const router = useRouter();
  const { currentUser, firebaseUser } = useAuth(); // firebaseUser is now available

  const [ordersForSelectedDate, setOrdersForSelectedDate] = useState<Order[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isStartingRoute, setIsStartingRoute] = useState(false);

  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);

  const mapRef = useRef<google.maps.Map | null>(null);

  const mapOptions = useMemo(
    () => ({
      disableDefaultUI: true,
      zoomControl: true,
      styles: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ? undefined : (resolvedTheme === 'dark' ? nightMapStyle : []),
      mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined,
    }),
    [resolvedTheme],
  );

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    map.panTo(defaultMapCenter);
    map.setZoom(10);
  }, []);

  const getOrderEventsForDate = useCallback(
    (date: Date | undefined, ordersToFilter: Order[]): Order[] => {
      if (!date || !ordersToFilter) return [];
      const targetDayStart = startOfDay(date);

      return ordersToFilter
        .filter((order) => {
          if (order.executionStatus === "cancelled") return false;

          let matches = false;

          if (order.serviceDate) {
            try {
              if (isSameDay(startOfDay(parseISO(order.serviceDate)), targetDayStart)) {
                matches = true;
              }
            } catch {}
          }
          else if (order.repeatDaysOrder && order.repeatDaysOrder.length > 0) {
            const serviceDayOfWeek = getDay(targetDayStart);
            if (order.repeatDaysOrder.some((d) => dayOfWeekToJsDay[d] === serviceDayOfWeek)) {
              matches = true;
            }
          }

          if (order.executionStatus === "completed" && order.completedAt) {
            try {
              if (isSameDay(startOfDay(parseISO(order.completedAt)), targetDayStart)) {
                matches = true;
              }
            } catch {}
          } else if (order.executionStatus === "pending" && !order.serviceDate && (!order.repeatDaysOrder || order.repeatDaysOrder.length === 0)) {
            // Match ad-hoc pending orders on their creation day
             try {
              if (isSameDay(startOfDay(parseISO(order.createdAt)), targetDayStart)) {
                matches = true;
              }
            } catch {}
          }

          return matches;
        })
        .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    },
    [],
  );

  useEffect(() => {
    if (selectedDate && allOrders) {
      const dailyOrders = getOrderEventsForDate(selectedDate, allOrders);
      setOrdersForSelectedDate(dailyOrders);
      if (selectedOrder && !dailyOrders.find(o => o.id === selectedOrder.id)) {
        onOrderSelect(null);
      }
    } else {
      setOrdersForSelectedDate([]);
      onOrderSelect(null);
    }
  }, [selectedDate, allOrders, getOrderEventsForDate, onOrderSelect, selectedOrder]);

  const calendarModifiers = useMemo(() => {
    const modifiers: Record<string, Date[]> = { hasEvent: [] };
    if (!allOrders) return {};

    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const daysInMonth = eachDayOfInterval({start, end});

    daysInMonth.forEach(day => {
        if (getOrderEventsForDate(day, allOrders).length > 0) {
            modifiers.hasEvent.push(day);
        }
    });

    return modifiers;
  }, [allOrders, currentMonth, getOrderEventsForDate]);

  const calendarModifiersClassNames = {
      hasEvent: "border-primary/50 text-primary bg-primary/10 rounded-md",
  };

  useEffect(() => {
    if (!selectedOrder || !isMapLoaded || !window.google) {
      setDirections(null);
      return;
    }

    if (selectedOrder.originStop && selectedOrder.destinationStop) {
      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route(
        {
          origin: selectedOrder.originStop.address.description,
          destination: selectedOrder.destinationStop.address.description,
          waypoints: (selectedOrder.intermediateStopsOrder || []).map(
            (s) => ({
              location: s.address.description,
              stopover: true,
            }),
          ),
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === "OK" && result) {
            setDirections(result);
            if (mapRef.current && result.routes[0]?.bounds) {
              mapRef.current.fitBounds(result.routes[0].bounds);
            }
          } else {
            setDirections(null);
          }
        },
      );
    } else {
      setDirections(null);
    }
  }, [selectedOrder, isMapLoaded]);

  const handleSelectOrder = (order: Order) => {
    onOrderSelect(order);
  }

  const handleStartRouteConfirm = async () => {
    if (!selectedOrder || !currentUser || !firebaseUser) {
      console.error("[Client] Preconditions for starting route not met.", { hasSelectedOrder: !!selectedOrder, hasCurrentUser: !!currentUser });
      return;
    }
  
    setIsStartingRoute(true);
    
    try {
      console.log("[Client] Obtendo idToken...");
      const idToken = await firebaseUser.getIdToken(true);
      console.log("[Client] idToken obtido, chamando startOrderExecution.");
      
      const result = await startOrderExecution({
        orderId: selectedOrder.id,
        driverId: currentUser.id,
        driverName: currentUser.name,
        clientName: selectedOrder.clientCompanyName,
        idToken: idToken,
      });
      
      if (result?.success) {
        toast({
          title: "Rota Iniciada!",
          description: "Redirecionando para a página de execução.",
        });
        router.push(`/routes/${selectedOrder.id}/execute`);
      } else {
        console.error("[Client] Erro retornado de startOrderExecution:", result?.error);
        toast({
          title: "Erro ao Iniciar Rota",
          description: result?.error || "Não foi possível iniciar a rota.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      console.error("[Client] Erro no bloco try/catch de handleStartRouteConfirm:", e);
      toast({
        title: "Erro Inesperado",
        description: `Ocorreu um erro: ${e.message}. Por favor, tente novamente.`,
        variant: "destructive",
      });
    } finally {
      setIsStartingRoute(false);
    }
  };


  const getOrderStatusBadge = (order: Order) => {
    switch (order.executionStatus) {
      case "pending":
        return <Badge variant="secondary">Pendente</Badge>;
      case "in-progress":
        return (
          <Badge
            variant="default"
            className="bg-amber-500 hover:bg-amber-500/80"
          >
            Em Progresso
          </Badge>
        );
      case "completed":
        return <Badge variant="default">Concluído</Badge>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
        <div className="flex items-center justify-center h-40">
            <Icons.loader className="h-8 w-8 animate-spin text-primary" />
        </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-1">
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedOrder
              ? `Rota: Ordem de Serviço Nº ${selectedOrder.id.substring(0, 8)}`
              : "Selecione um pedido"}
          </CardTitle>
          <CardDescription>
            Visualize o trajeto da rota selecionada no mapa.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[400px] w-full rounded-md overflow-hidden bg-muted">
          {loadError ? (
            <div className="flex items-center justify-center h-full text-destructive">
              Erro ao carregar mapa.
            </div>
          ) : isMapLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={defaultMapCenter}
              zoom={10}
              onLoad={onMapLoad}
              options={mapOptions}
            >
              {directions && (
                <DirectionsRenderer
                  directions={directions}
                  options={{
                    suppressMarkers: true,
                    polylineOptions: {
                      strokeColor:
                        resolvedTheme === "dark" ? "#FFC107" : "#3F51B5",
                    },
                  }}
                />
              )}
            </GoogleMap>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted rounded-md">
              <Icons.loader className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>Pedidos Agendados</CardTitle>
          <CardDescription>
            Selecione uma data no calendário para ver os pedidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 grid md:grid-cols-2 gap-6 min-h-[280px]">
          <div className="flex justify-center">
            <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                month={currentMonth}
                onMonthChange={setCurrentMonth}
                className="rounded-md border p-0"
                locale={ptBR}
                modifiers={calendarModifiers}
                modifiersClassNames={calendarModifiersClassNames}
              />
          </div>
          <div>
            <h4 className="font-semibold mb-2">
                {selectedDate ? `Ordens de Serviço para ${format(selectedDate, "dd/MM/yyyy")}` : "Nenhuma data selecionada"}
            </h4>
            {ordersForSelectedDate.length > 0 ? (
              <ScrollArea className="h-72">
                <div className="space-y-2 pr-3">
                  {ordersForSelectedDate.map((order) => (
                    <Card
                      key={order.id}
                      onClick={() => handleSelectOrder(order)}
                      className={cn(
                        "p-3 hover:bg-muted transition-all cursor-pointer",
                        selectedOrder?.id === order.id &&
                          "ring-2 ring-primary border-primary",
                      )}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-sm">
                            Ordem de Serviço Nº {order.id.substring(0, 8)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {order.clientCompanyName}
                          </p>
                        </div>
                        {getOrderStatusBadge(order)}
                      </div>
                      {selectedOrder?.id === order.id && order.executionStatus === 'pending' && (
                        <div className="mt-3 pt-3 border-t border-dashed flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOrderSelect(null);
                            }}
                          >
                            Fechar
                          </Button>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartRouteConfirm();
                            }}
                            disabled={isStartingRoute}
                          >
                            {isStartingRoute ? (
                              <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Icons.playCircle className="mr-2 h-4 w-4" />
                            )}
                            {isStartingRoute ? "Iniciando..." : "Iniciar Rota"}
                          </Button>
                        </div>
                      )}
                       {selectedOrder?.id === order.id && order.executionStatus === 'in-progress' && (
                        <div className="mt-3 pt-3 border-t border-dashed flex items-center justify-end gap-2">
                          <Button size="sm" onClick={() => router.push(`/routes/${order.id}/execute`)}>
                             <Icons.truck className="mr-2 h-4 w-4" />
                             Continuar Execução
                          </Button>
                        </div>
                       )}
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">
                Nenhum pedido para a data selecionada.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

    