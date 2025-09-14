
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Icons } from "@/components/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import type { Order, RouteStop } from "@/types/order";
import { Badge } from "@/components/ui/badge";
import { useSharedGoogleMapsLoader } from "@/lib/googleMaps";
import {
  GoogleMap,
  DirectionsRenderer,
  MarkerF,
  InfoWindowF,
  Polyline,
} from "@react-google-maps/api";
import { useTheme } from "next-themes";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { nightMapStyle } from "@/lib/map-styles";
import { toast } from "@/hooks/use-toast";

const executionStatusTranslations: Record<string, string> = {
  pending: "Pendente",
  "in-progress": "Em Progresso",
};

const getStatusBadgeVariant = (status: Order["executionStatus"]) => {
  switch (status) {
    case "in-progress":
      return "default";
    case "pending":
      return "secondary";
    default:
      return "outline";
  }
};

const defaultMapCenter = { lat: -28.4774, lng: -49.0079 };

// Cores para diferenciar as rotas no mapa
const routeColors = [
  "#1E90FF", // DodgerBlue
  "#FF4500", // OrangeRed
  "#32CD32", // LimeGreen
  "#9400D3", // DarkViolet
  "#FFD700", // Gold
];

const getStopLabel = (
  stop: RouteStop,
  index: number,
  totalStops: number,
): string => {
  if (index === 0) return "O";
  if (index === totalStops - 1) return "D";
  return `P${index}`;
};

const getMarkerOptions = (stop: RouteStop, index: number, totalStops: number): Omit<google.maps.MarkerOptions, 'position'> => {
    const isCompleted = stop.status === 'completed' || stop.status === 'skipped';
    const labelText = getStopLabel(stop, index, totalStops);

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

export default function InProgressRoutesPage() {
  const router = useRouter();
  const { isLoaded, loadError } = useSharedGoogleMapsLoader();
  const { resolvedTheme } = useTheme();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mapRef = useRef<google.maps.Map | null>(null);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInteractingRef = useRef(false);
  
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [driverLocations, setDriverLocations] = useState<
    Map<
      string,
      {
        lat: number;
        lng: number;
        name: string;
        vehicle: string;
        profilePictureUrl: string | null;
        heading: number | null;
      }
    >
  >(new Map());
  const [directions, setDirections] = useState<
    Map<string, google.maps.DirectionsResult | null>
  >(new Map());
  const [activeMarker, setActiveMarker] = useState<string | null>(null);

  const mapOptions = useMemo(
    () => ({
      disableDefaultUI: true,
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      styles: resolvedTheme === 'dark' ? nightMapStyle : [],
    }),
    [resolvedTheme],
  );

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Efeito para buscar os pedidos
  useEffect(() => {
    setIsLoading(true);
    setError(null);

    const ordersCollectionRef = collection(db, "orders");
    const q = query(
      ordersCollectionRef,
      where("executionStatus", "in", ["in-progress"]),
      orderBy("createdAt", "asc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const ordersData = querySnapshot.docs
          .map((doc) => sanitizeOrderFromFirestore(doc, "InProgressRoutes"))
          .filter((o): o is Order => o !== null);
        setOrders(ordersData);
        setIsLoading(false);
      },
      (err) => {
        console.error("Erro no snapshot das rotas em progresso:", err);
        setError("Erro ao carregar as rotas em tempo real.");
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const fetchDriverLocationsManually = useCallback(async () => {
    const driverIds = [...new Set(orders.map((o) => o.assignedDriverId).filter(Boolean))] as string[];
    if (driverIds.length === 0) {
      setDriverLocations(new Map());
      return;
    }

    const newLocations = new Map(driverLocations);
    let changed = false;

    await Promise.all(driverIds.map(async (driverId) => {
      const driverDocRef = doc(db, "driverLocations", driverId);
      const docSnap = await getDoc(driverDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        newLocations.set(driverId, {
          lat: data.latitude,
          lng: data.longitude,
          name: data.name || "Desconhecido",
          vehicle: data.vehicleName || "N/A",
          profilePictureUrl: data.profilePictureUrl || null,
          heading: data.heading ?? null,
        });
        changed = true;
      }
    }));
    
    if (changed) {
      setDriverLocations(newLocations);
    }
  }, [orders, driverLocations]);
  
  const handleMapInteraction = useCallback(() => {
      isInteractingRef.current = true;
      fetchDriverLocationsManually();
      if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = setTimeout(() => {
          isInteractingRef.current = false;
      }, 15000); // 15-second timeout
  }, [fetchDriverLocationsManually]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    toast({ title: "Atualizando localizações..." });
    await fetchDriverLocationsManually();
    
    if (mapRef.current && window.google) {
        const bounds = new window.google.maps.LatLngBounds();
        directions.forEach((result) => {
          if (result && result.routes[0]?.bounds) {
            bounds.union(result.routes[0].bounds);
          }
        });
        driverLocations.forEach((location) => {
          bounds.extend(new window.google.maps.LatLng(location.lat, location.lng));
        });
        if (!bounds.isEmpty()) {
            mapRef.current.fitBounds(bounds, 50);
        }
    }
    
    setTimeout(() => setIsRefreshing(false), 1000);
  }, [fetchDriverLocationsManually, directions, driverLocations]);

  // Efeito para buscar a localização dos motoristas em tempo real
  useEffect(() => {
    if (isInteractingRef.current) return;
  
    const driverIdsWithActiveOrders = [
      ...new Set(orders.map((o) => o.assignedDriverId).filter(Boolean)),
    ] as string[];

    if (driverIdsWithActiveOrders.length === 0) {
      setDriverLocations(new Map());
      return;
    }

    const unsubscribers: (() => void)[] = [];
    driverIdsWithActiveOrders.forEach((driverId) => {
      const driverDocRef = doc(db, "driverLocations", driverId);
      const unsubscribe = onSnapshot(driverDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const isStillActive = orders.some(o => o.assignedDriverId === driverId);

          setDriverLocations((prev) => {
            const newMap = new Map(prev);
            if (isStillActive) {
                newMap.set(driverId, {
                  lat: data.latitude,
                  lng: data.longitude,
                  name: data.name || "Desconhecido",
                  vehicle: data.vehicleName || "N/A",
                  profilePictureUrl: data.profilePictureUrl || null,
                  heading: data.heading ?? null,
                });
            } else {
                newMap.delete(driverId);
            }
            return newMap;
          });
        }
      });
      unsubscribers.push(unsubscribe);
    });
    
    setDriverLocations(prev => {
        const newMap = new Map(prev);
        let changed = false;
        for (const driverId of newMap.keys()) {
            if (!driverIdsWithActiveOrders.includes(driverId)) {
                newMap.delete(driverId);
                changed = true;
            }
        }
        return changed ? newMap : prev;
    })

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [orders]);

  // Efeito para calcular as direções no mapa
  useEffect(() => {
    if (!isLoaded || !window.google) return;
    const directionsService = new window.google.maps.DirectionsService();

    orders.forEach((order) => {
      if (directions.has(order.id)) return;

      setDirections((prev) => new Map(prev).set(order.id, null)); // Marca como "buscando"

      const { originStop, destinationStop, intermediateStopsOrder } = order;
      if (!originStop || !destinationStop) {
        setDirections((prev) => new Map(prev).set(order.id, null));
        return;
      }

      const request: google.maps.DirectionsRequest = {
        origin: originStop.address.description,
        destination: destinationStop.address.description,
        waypoints: (intermediateStopsOrder || []).map((stop) => ({
          location: stop.address.description,
          stopover: true,
        })),
        travelMode: google.maps.TravelMode.DRIVING,
      };

      directionsService.route(request, (result, status) => {
        if (status === "OK" && result) {
          setDirections((prev) => new Map(prev).set(order.id, result));
        } else {
          console.error(
            `Falha ao buscar direções para o pedido ${order.id}: ${status}`,
          );
          toast({
              title: "Erro de Roteamento",
              description: `Não foi possível traçar a rota para o pedido ${order.id.substring(0,8)}. Verifique os endereços.`,
              variant: "warning"
          });
          setDirections((prev) => new Map(prev).set(order.id, null));
        }
      });
    });

    const currentOrderIds = new Set(orders.map((o) => o.id));
    setDirections((prev) => {
      const newDirections = new Map(prev);
      let changed = false;
      for (const orderId of newDirections.keys()) {
        if (!currentOrderIds.has(orderId)) {
          newDirections.delete(orderId);
          changed = true;
        }
      }
      return changed ? newDirections : prev;
    });
  }, [isLoaded, orders, directions]);

  // Efeito para ajustar os limites do mapa
  useEffect(() => {
    if (
      !mapRef.current ||
      (directions.size === 0 && driverLocations.size === 0) ||
      !window.google || // Garante que a API do Google está carregada
      isInteractingRef.current
    )
      return;

    const bounds = new window.google.maps.LatLngBounds();
    directions.forEach((result) => {
      if (result && result.routes && result.routes.length > 0) {
        bounds.union(result.routes[0].bounds);
      }
    });

    driverLocations.forEach((location) => {
      bounds.extend(new window.google.maps.LatLng(location.lat, location.lng));
    });

    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, 50);
    }
  }, [directions, driverLocations]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center min-h-screen">
        <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        <p className="text-xl text-muted-foreground">
          Carregando rotas para execução...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 text-destructive-foreground bg-destructive rounded-md mx-auto max-w-md p-4">
        <Icons.warning className="h-10 w-10 mx-auto mb-2" />
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Rotas em Andamento</h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Mapa de Acompanhamento em Tempo Real</CardTitle>
          <CardDescription>
            Visualize as rotas e a localização dos motoristas.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[450px] relative">
          {loadError ? (
            <div className="flex items-center justify-center h-full text-destructive">
              Erro ao carregar o mapa.
            </div>
          ) : isLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={defaultMapCenter}
              zoom={10}
              onLoad={onMapLoad}
              options={mapOptions}
              onZoomChanged={handleMapInteraction}
              onDragStart={handleMapInteraction}
            >
              {Array.from(directions.entries()).map(
                ([orderId, directionResult]) => {
                  if (!directionResult) return null;

                  const order = orders.find(o => o.id === orderId);
                  const driverLoc = order?.assignedDriverId ? driverLocations.get(order.assignedDriverId) : null;
                  const allStops = order ? [order.originStop, ...(order.intermediateStopsOrder || []), order.destinationStop].filter(Boolean) as RouteStop[] : [];

                  let completedPath: google.maps.LatLng[] = [];
                  if (driverLoc && window.google?.maps?.geometry) {
                      const overviewPath = directionResult.routes[0].overview_path;
                      const driverLatLng = new window.google.maps.LatLng(driverLoc.lat, driverLoc.lng);
                      let closestPointIndex = 0;
                      let minDistance = Number.MAX_VALUE;
                      for (let i = 0; i < overviewPath.length; i++) {
                          const distance = window.google.maps.geometry.spherical.computeDistanceBetween(driverLatLng, overviewPath[i]);
                          if (distance < minDistance) {
                              minDistance = distance;
                              closestPointIndex = i;
                          }
                      }
                      completedPath = overviewPath.slice(0, closestPointIndex + 1);
                  }

                  return (
                    <React.Fragment key={orderId}>
                      <Polyline
                        path={directionResult.routes[0].overview_path}
                        options={{
                          strokeColor: routeColors[orders.findIndex(o => o.id === orderId) % routeColors.length],
                          strokeWeight: 6,
                          strokeOpacity: 0.5,
                        }}
                      />
                      {completedPath.length > 0 && (
                        <Polyline
                          path={completedPath}
                          options={{
                            strokeColor: "#2E8B57", // SeaGreen
                            strokeWeight: 7,
                            strokeOpacity: 0.9,
                          }}
                        />
                      )}
                       {allStops.map((stop, index) => (
                          stop.address.latitude && stop.address.longitude && (
                              <MarkerF 
                                key={stop.id} 
                                position={{lat: stop.address.latitude, lng: stop.address.longitude}}
                                options={getMarkerOptions(stop, index, allStops.length)} 
                              />
                          )
                       ))}
                    </React.Fragment>
                  );
                }
              )}
              {Array.from(driverLocations.entries()).map(
                ([driverId, locationData]) => (
                  <MarkerF
                    key={driverId}
                    position={{ lat: locationData.lat, lng: locationData.lng }}
                    onClick={() => setActiveMarker(driverId)}
                    icon={{
                      path: "M20,8h-3V4H3C1.9,4,1,4.9,1,6v11h2c0,1.7,1.3,3,3,3s3-1.3,3-3h6c0,1.7,1.3,3,3,3s3-1.3,3-3h2V13L20,8z M6,18.5C5.2,18.5,4.5,17.8,4.5,17s0.7-1.5,1.5-1.5s1.5,0.7,1.5,1.5S6.8,18.5,6,18.5z M18,18.5c-0.8,0-1.5-0.7-1.5-1.5s0.7-1.5,1.5-1.5s1.5,0.7,1.5,1.5S18.8,18.5,18,18.5z M17,11h2.5l1.8,2.5H17V11z",
                      fillColor:
                        resolvedTheme === "dark"
                          ? "hsl(var(--primary))"
                          : "hsl(var(--primary))",
                      fillOpacity: 1,
                      strokeWeight: 1,
                      strokeColor:
                        resolvedTheme === "dark" ? "#1a1a1a" : "#ffffff",
                      rotation: (locationData.heading ?? 0) - 90,
                      scale: 1.2,
                      anchor: new window.google.maps.Point(12, 12),
                    }}
                    title={locationData.name}
                    zIndex={100}
                  >
                    {activeMarker === driverId && (
                      <InfoWindowF onCloseClick={() => setActiveMarker(null)}>
                        <div className="p-1 flex items-center gap-3 text-black">
                          <Avatar className="h-10 w-10">
                            <AvatarImage
                              src={locationData.profilePictureUrl ?? undefined}
                              alt={locationData.name}
                            />
                            <AvatarFallback>
                              {locationData.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h4 className="font-bold">{locationData.name}</h4>
                            <p className="text-sm">
                              Veículo: {locationData.vehicle}
                            </p>
                          </div>
                        </div>
                      </InfoWindowF>
                    )}
                  </MarkerF>
                ),
              )}
            </GoogleMap>
          ) : (
            <div className="flex items-center justify-center h-full">
              <Icons.loader className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          <Button 
            variant="secondary" 
            size="icon" 
            className="absolute top-4 right-4 shadow-lg"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            aria-label="Atualizar localizações"
          >
            <Icons.repeat className={isRefreshing ? "animate-spin" : ""} />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          {orders.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Icons.checkCircle className="h-10 w-10 mx-auto mb-2 text-green-500" />
              <p>Nenhuma rota em progresso no momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders.map((order) => {
                const totalStops =
                  (order.originStop ? 1 : 0) +
                  (order.intermediateStopsOrder?.length || 0) +
                  (order.destinationStop ? 1 : 0);
                return (
                  <Card
                    key={order.id}
                    className="hover:shadow-md transition-shadow flex flex-col"
                  >
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle>Pedido Nº: {order.id.substring(0, 8)}...</CardTitle>
                          <CardDescription>
                            Cliente: {order.clientCompanyName || "N/A"}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={getStatusBadgeVariant(order.executionStatus)}
                        >
                          {executionStatusTranslations[order.executionStatus] ||
                            order.executionStatus}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-grow">
                      <p className="text-sm text-muted-foreground">
                        Rota: {order.selectedRouteName || "Não especificado"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Total de Paradas: {totalStops}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Motorista: {order.assignedDriverName || "Não atribuído"}
                      </p>
                    </CardContent>
                    <CardFooter>
                      <Button
                        onClick={() =>
                          router.push(`/routes/${order.id}/timeline`)
                        }
                        className="w-full"
                      >
                        <Icons.listChecks className="mr-2 h-4 w-4" />
                        Ver Linha do Tempo
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

