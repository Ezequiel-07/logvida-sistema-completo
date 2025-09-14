
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Icons } from "@/components/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Order, RouteStop } from "@/types/order";
import { Badge } from "@/components/ui/badge";
import { useSharedGoogleMapsLoader } from "@/lib/googleMaps";
import {
  GoogleMap,
  DirectionsRenderer,
  MarkerF,
  InfoWindowF,
} from "@react-google-maps/api";
import { useTheme } from "next-themes";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { nightMapStyle } from "@/lib/map-styles";
import { useAuth } from "@/hooks/useAuth";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const executionStatusTranslations: Record<string, string> = {
  pending: "Pendente",
  "in-progress": "Em Progresso",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const defaultMapCenter = { lat: -28.4774, lng: -49.0079 };
const routeColors = ["#1E90FF", "#FF4500", "#32CD32", "#9400D3", "#FFD700"];

export function LiveTracking() {
  const { currentUser } = useAuth();
  const { isLoaded, loadError } = useSharedGoogleMapsLoader();
  const { resolvedTheme } = useTheme();

  const [inProgressOrders, setInProgressOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const mapRef = useRef<google.maps.Map | null>(null);

  const [driverLocations, setDriverLocations] = useState<
    Map<
      string,
      {
        lat: number;
        lng: number;
        name: string;
        vehicle: string;
        profilePictureUrl: string | null;
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
      styles: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ? undefined : (resolvedTheme === 'dark' ? nightMapStyle : []),
      mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined,
    }),
    [resolvedTheme],
  );

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Fetch in-progress orders for the current client
  useEffect(() => {
    if (!currentUser?.clientId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    const ordersCollectionRef = collection(db, "orders");
    const q = query(
      ordersCollectionRef,
      where("clientId", "==", currentUser.clientId),
      where("executionStatus", "==", "in-progress"),
      orderBy("createdAt", "asc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const ordersData = querySnapshot.docs
          .map((doc) => sanitizeOrderFromFirestore(doc, "ClientDashboard"))
          .filter((o): o is Order => o !== null);
        setInProgressOrders(ordersData);
        setIsLoading(false);
      },
      (_err) => {
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser?.clientId]);

  // Fetch driver locations for active orders
  useEffect(() => {
    const driverIdsWithActiveOrders = [
      ...new Set(
        inProgressOrders.map((o) => o.assignedDriverId).filter(Boolean),
      ),
    ] as string[];

    if (driverIdsWithActiveOrders.length === 0) {
      setDriverLocations(new Map());
      return;
    }

    const unsubscribers: (() => void)[] = [];
    driverIdsWithActiveOrders.forEach((driverId) => {
      const driverDocRef = doc(db, "driverLocations", driverId);
      const unsubscribe = onSnapshot(driverDocRef, (docSnap) => {
        setDriverLocations((prev) => {
          const newMap = new Map(prev);
          if (docSnap.exists()) {
            const data = docSnap.data();
            newMap.set(driverId, {
              lat: data.latitude,
              lng: data.longitude,
              name: data.name || "Desconhecido",
              vehicle: data.vehicleName || "N/A",
              profilePictureUrl: data.profilePictureUrl || null,
            });
          }
          return newMap;
        });
      });
      unsubscribers.push(unsubscribe);
    });

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [inProgressOrders]);

  // Calculate directions
  useEffect(() => {
    if (!isLoaded || !window.google) return;
    const directionsService = new window.google.maps.DirectionsService();

    inProgressOrders.forEach((order) => {
      if (!directions.has(order.id)) {
        const { originStop, destinationStop, intermediateStopsOrder } = order;
        if (originStop && destinationStop) {
          const request: google.maps.DirectionsRequest = {
            origin: originStop.address.description,
            destination: destinationStop.address.description,
            waypoints: (intermediateStopsOrder || []).map((s) => ({
              location: s.address.description,
              stopover: true,
            })),
            travelMode: google.maps.TravelMode.DRIVING,
          };
          directionsService.route(request, (result, status) => {
            if (status === "OK" && result) {
              setDirections((prev) => new Map(prev).set(order.id, result));
            } else {
              console.error(`Client dashboard directions failed for order ${order.id}: ${status}`);
              toast({
                title: "Rota Indisponível",
                description: `Não foi possível exibir a rota para o pedido ${order.id.substring(0,8)} no mapa.`,
                variant: 'warning'
              });
              setDirections((prev) => new Map(prev).set(order.id, null));
            }
          });
        }
      }
    });
  }, [isLoaded, inProgressOrders, directions]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center min-h-[400px]">
        <Icons.loader className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="h-[400px] w-full bg-muted rounded-lg overflow-hidden">
        {loadError ? (
          <div className="flex items-center justify-center h-full text-destructive">Erro ao carregar o mapa.</div>
        ) : isLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={defaultMapCenter}
            zoom={10}
            onLoad={onMapLoad}
            options={mapOptions}
          >
            {Array.from(directions.entries()).map(
              ([orderId, result], index) =>
                result && (
                  <DirectionsRenderer
                    key={orderId}
                    directions={result}
                    options={{
                      suppressMarkers: true,
                      polylineOptions: {
                        strokeColor: routeColors[index % routeColors.length],
                        strokeWeight: 5,
                      },
                    }}
                  />
                ),
            )}
            {Array.from(driverLocations.entries()).map(
              ([driverId, location]) => (
                <MarkerF
                  key={driverId}
                  position={location}
                  onClick={() => setActiveMarker(driverId)}
                  title={location.name}
                  icon={{
                    path: "M20,8h-3V4H3C1.9,4,1,4.9,1,6v11h2c0,1.7,1.3,3,3,3s3-1.3,3-3h6c0,1.7,1.3,3,3,3s3-1.3,3-3h2V13L20,8z M6,18.5C5.2,18.5,4.5,17.8,4.5,17s0.7-1.5,1.5-1.5s1.5,0.7,1.5,1.5S6.8,18.5,6,18.5z M18,18.5c-0.8,0-1.5-0.7-1.5-1.5s0.7-1.5,1.5-1.5s1.5,0.7,1.5,1.5S18.8,18.5,18,18.5z M17,11h2.5l1.8,2.5H17V11z",
                    fillColor: "hsl(var(--primary))",
                    fillOpacity: 1,
                    strokeWeight: 1,
                    strokeColor: "hsl(var(--card))",
                    rotation: 0, scale: 1.2,
                    anchor: new window.google.maps.Point(12, 12),
                  }}
                >
                  {activeMarker === driverId && (
                    <InfoWindowF onCloseClick={() => setActiveMarker(null)}>
                      <div className="p-1 flex items-center gap-3 text-black">
                        <Avatar className="h-10 w-10">
                          <AvatarImage
                            src={location.profilePictureUrl ?? undefined}
                            alt={location.name}
                          />
                          <AvatarFallback>
                            {location.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h4 className="font-bold">{location.name}</h4>
                          <p className="text-sm">
                            Veículo: {location.vehicle}
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
          <div className="w-full h-full flex items-center justify-center bg-muted rounded-md">
            <Icons.loader className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>

       {inProgressOrders.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            Nenhum pedido em trânsito no momento.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inProgressOrders.map((order) => {
              const allStops = [
                order.originStop,
                ...(order.intermediateStopsOrder || []),
                order.destinationStop,
              ].filter(Boolean) as RouteStop[];
              const completedStops = allStops.filter(
                (s) => s.status === "completed" || s.status === "skipped"
              ).length;
              const progress =
                allStops.length > 0
                  ? (completedStops / allStops.length) * 100
                  : 0;

              return (
                <Card
                  key={order.id}
                  className="hover:shadow-md transition-all bg-background/50"
                >
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">
                          Pedido Nº {order.id.substring(0, 8)}
                        </CardTitle>
                        <CardDescription>
                          Rota: {order.selectedRouteName || "Não especificada"}
                        </CardDescription>
                      </div>
                      <Badge>
                        {executionStatusTranslations[order.executionStatus]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Motorista:{" "}
                      {order.assignedDriverName || "Não atribuído"}
                    </p>
                    <div>
                      <Progress value={progress} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1 text-center">
                        {completedStops} de {allStops.length} paradas
                        concluídas
                      </p>
                    </div>
                    <div className="flex items-center justify-end mt-2 pt-2 border-t">
                        <Link
                          href={`/track/${order.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-sm font-semibold inline-flex items-center gap-1"
                        >
                          Ver detalhes <Icons.chevronDown className="h-4 w-4 -rotate-90"/>
                        </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
    </div>
  );
}
