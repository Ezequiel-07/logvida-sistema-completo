
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { Order, RouteStop as OrderRouteStop, CheckpointConfirmationDetails } from "@/types/order";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { CheckpointDialog } from "./CheckpointDialog";
import { SkipStopDialog } from "./SkipStopDialog";
import { cn, getDistanceFromLatLonInM, formatDateDisplay } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { useRouter, useParams } from "next/navigation";
import { onSnapshot, doc, updateDoc, Timestamp, collection, getDocs, writeBatch, getDoc, setDoc, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";
import { GoogleMap, DirectionsRenderer, MarkerF } from "@react-google-maps/api";
import { useSharedGoogleMapsLoader } from "@/lib/googleMaps";
import { useTheme } from "next-themes";
import { nightMapStyle } from "@/lib/map-styles";
import { sendNotification } from "@/server/actions/notifications";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { addPendingCheckpoint, getPendingCheckpoints, removePendingCheckpoint, type PendingCheckpoint } from "@/lib/offline-sync";
import { Capacitor } from "@capacitor/core";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";


// Importa o novo plugin de geolocalização
import BackgroundGeolocation, {
  State,
  Config,
  Location,
  MotionChangeEvent
} from "@transistorsoft/capacitor-background-geolocation";


const defaultMapCenter = { lat: -28.4774, lng: -49.0079 }; // Tubarão, SC

const stopTypeTranslations: Record<OrderRouteStop["type"], string> = {
  origin: "Origem",
  intermediate: "Parada",
  destination: "Destino",
};

export function RouteExecutionClient() {
  const router = useRouter();
  const params = useParams();
  const selectedOrderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const { currentUser } = useAuth();
  const { isLoaded: isMapScriptLoaded, loadError } = useSharedGoogleMapsLoader();
  const { resolvedTheme, setTheme } = useTheme();

  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [distanceToStop, setDistanceToStop] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);

  const [isCheckpointDialogOpen, setIsCheckpointDialogOpen] = useState(false);
  const [stopForCheckpoint, setStopForCheckpoint] = useState<OrderRouteStop | null>(null);
  const [isSkipStopDialogOpen, setIsSkipStopDialogOpen] = useState(false);
  const [stopToSkip, setStopToSkip] = useState<OrderRouteStop | null>(null);
  
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const mapRef = useRef<google.maps.Map | null>(null);
  const cardsContainerRef = useRef<HTMLDivElement | null>(null);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInteractingRef = useRef(false);
  
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);

  // Derivando o pedido e as paradas selecionadas do estado
  const selectedOrder = useMemo(() => activeOrders.find(o => o.id === selectedOrderId), [activeOrders, selectedOrderId]);
  const allStops = useMemo(() => {
    if (!selectedOrder) return [];
    return [
      selectedOrder.originStop,
      ...(selectedOrder.intermediateStopsOrder || []),
      selectedOrder.destinationStop,
    ].filter(Boolean) as OrderRouteStop[];
  }, [selectedOrder]);
  const currentStopIndex = useMemo(() => allStops.findIndex(s => s.status === 'pending'), [allStops]);
  
  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    map.setTilt(45);
  }, []);
  
  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");

  const recenterMap = useCallback(() => {
    if (currentLocation && mapRef.current) {
        mapRef.current.panTo({ lat: currentLocation.coords.latitude, lng: currentLocation.coords.longitude });
        isInteractingRef.current = false;
        if (interactionTimeoutRef.current) {
            clearTimeout(interactionTimeoutRef.current);
        }
    }
  }, [currentLocation]);
  
  const handleMapInteraction = useCallback(() => {
      isInteractingRef.current = true;
      if (interactionTimeoutRef.current) {
          clearTimeout(interactionTimeoutRef.current);
      }
      // Re-enable auto-center after 8 seconds of inactivity
      interactionTimeoutRef.current = setTimeout(() => {
          isInteractingRef.current = false;
          recenterMap();
      }, 8000); 
  }, [recenterMap]);


  useEffect(() => {
    const initBackgroundGeolocation = async () => {
      if (!Capacitor.isNativePlatform()) return;
      try {
        const onLocation = (location: Location) => {
          console.log('[location] -', location);
          setCurrentLocation(location);
        };
        const onMotionChange = (event: MotionChangeEvent) => {
          console.log('[motionchange] -', event.isMoving, event.location);
        };
        
        if (!currentUser) return;
        
        const config: Config = {
          desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
          distanceFilter: 10,
          stopOnTerminate: false,
          startOnBoot: true, // Auto start on boot
          foregroundService: true, // Enable Foreground Service for Android
          autoSync: true, // Auto-sync to your server
          params: { userId: currentUser.id },
          url: `${window.location.origin}/api/update-driver-location`, // Your server endpoint
          headers: {
            // Add any required headers, like auth tokens, if your API needs them
          }
        };

        const state: State = await BackgroundGeolocation.ready(config);

        if (!state.enabled) {
          console.log("Starting BackgroundGeolocation");
          await BackgroundGeolocation.start();
        }

        BackgroundGeolocation.onLocation(onLocation);
        BackgroundGeolocation.onMotionChange(onMotionChange);
      } catch (e) {
        console.error("Erro ao inicializar Background Geolocation", e);
        toast({ title: "Erro de Geolocalização", description: "Não foi possível iniciar o rastreamento em segundo plano.", variant: "destructive" });
      }
    }
    
    if (activeOrders.length > 0 && currentUser) {
      initBackgroundGeolocation();
    } else if (Capacitor.isNativePlatform()) {
        BackgroundGeolocation.stop();
    }
    
    return () => { if (Capacitor.isNativePlatform()) BackgroundGeolocation.removeListeners(); };
  }, [activeOrders.length, currentUser]);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setIsLoading(false);
      return;
    }
  
    const q = query(
      collection(db, "orders"),
      where("assignedDriverId", "==", currentUser.id),
      where("executionStatus", "==", "in-progress")
    );
  
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const orders = snapshot.docs
          .map((doc) => sanitizeOrderFromFirestore(doc, "RouteExecutionMulti"))
          .filter(Boolean) as Order[];
        setActiveOrders(orders);
  
        // Se a rota atual não está mais na lista de ativas (foi concluída), redireciona.
        if (!isLoading && !orders.some(o => o.id === selectedOrderId)) {
          if (orders.length > 0) {
            router.replace(`/routes/${orders[0].id}/execute`);
          } else {
            router.replace('/driver-dashboard');
          }
        }
  
        setIsLoading(false);
      },
      (err) => {
        setError("Falha ao carregar rotas ativas.");
        setIsLoading(false);
      }
    );
  
    return unsubscribe;
  }, [currentUser, isLoading, router, selectedOrderId]);
  
  useEffect(() => {
    if (!isMapScriptLoaded || !selectedOrder) {
        setDirections(null);
        return;
    };

    const allStopsForRoute = [
      selectedOrder.originStop,
      ...(selectedOrder.intermediateStopsOrder || []),
      selectedOrder.destinationStop,
    ].filter(Boolean) as OrderRouteStop[];

    if (allStopsForRoute.length < 2) return;

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route({
        origin: allStopsForRoute[0].address.description,
        destination: allStopsForRoute[allStopsForRoute.length - 1].address.description,
        waypoints: allStopsForRoute.slice(1, -1).map(s => ({ location: s.address.description, stopover: true })),
        travelMode: google.maps.TravelMode.DRIVING
    }, (result, status) => {
        if (status === 'OK' && result) {
            setDirections(result);
        }
    });
  }, [isMapScriptLoaded, selectedOrder]);
  
   useEffect(() => {
    if (!mapRef.current || !currentLocation || isInteractingRef.current) return;
    const map = mapRef.current;
    map.panTo({ lat: currentLocation.coords.latitude, lng: currentLocation.coords.longitude });
    if(typeof currentLocation.coords.heading === 'number' && currentLocation.coords.heading >= 0) {
      map.setHeading(currentLocation.coords.heading);
    }
   }, [currentLocation]);

   useEffect(() => {
    const interval = setInterval(async () => {
        if (isOnline && currentLocation && currentUser && activeOrders.length > 0) {
            const locationData = {
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
                heading: currentLocation.coords.heading ?? null,
                name: currentUser.name,
                vehicleName: currentUser.vehicle?.name || 'N/A',
                profilePictureUrl: currentUser.profilePictureUrl || null,
                timestamp: Timestamp.now(),
            };
            try {
              await setDoc(doc(db, "driverLocations", currentUser.id), locationData);
            } catch (e) {
                console.warn("Could not update driver location:", e);
            }
        }
    }, 5000);

    return () => clearInterval(interval);
  }, [isOnline, currentLocation, currentUser, activeOrders]);

  const scrollToIndex = useCallback((index: number) => {
    if (index !== -1 && cardsContainerRef.current) {
        const cardWidth = 320;
        const scrollPosition = index * (cardWidth + 16) - (cardsContainerRef.current.offsetWidth / 2) + (cardWidth / 2);
        cardsContainerRef.current.scrollTo({ left: scrollPosition, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if(currentStopIndex !== -1) {
       scrollToIndex(currentStopIndex);
    }
  }, [currentStopIndex, scrollToIndex]);
  
  useEffect(() => {
     if (currentStopIndex !== -1 && currentLocation && allStops[currentStopIndex]) {
      const nextStop = allStops[currentStopIndex];
      const stopCoords = nextStop.address;
      if (stopCoords.latitude && stopCoords.longitude) {
        const dist = getDistanceFromLatLonInM(currentLocation.coords.latitude, currentLocation.coords.longitude, stopCoords.latitude, stopCoords.longitude);
        setDistanceToStop(dist);
      } else {
        setDistanceToStop(0);
      }
    } else {
      setDistanceToStop(null);
    }
  }, [currentStopIndex, allStops, currentLocation]);
  
  const handleOpenCheckpoint = (stop: OrderRouteStop) => {
      setStopForCheckpoint(stop);
      setIsCheckpointDialogOpen(true);
  };
  
  const handleOpenSkipStop = (stop: OrderRouteStop) => {
    setStopToSkip(stop);
    setIsSkipStopDialogOpen(true);
  };

   const updateOrderState = useCallback(async (checkpoint: PendingCheckpoint, currentOrderData: Order) => {
    if (!currentUser) return;

    const allStopsForUpdate = [
        currentOrderData.originStop,
        ...(currentOrderData.intermediateStopsOrder || []),
        currentOrderData.destinationStop,
    ].filter(Boolean) as OrderRouteStop[];

    const stopIndex = allStopsForUpdate.findIndex(s => s.id === checkpoint.stopId);
    if (stopIndex === -1) throw new Error("Parada não encontrada no pedido");

    const stopToUpdate = allStopsForUpdate[stopIndex];
    stopToUpdate.status = checkpoint.status;
    stopToUpdate.checkedAt = checkpoint.timestamp;
    stopToUpdate.notes = checkpoint.reason ? `Parada pulada: ${checkpoint.reason}` : checkpoint.details.notes || null;
    
    if (checkpoint.status === 'completed' && checkpoint.details) {
        const details = checkpoint.details;
        switch(stopToUpdate.type) {
            case 'origin':
                stopToUpdate.loadingConfirmed = details.loadingConfirmed;
                stopToUpdate.loadingPhotoProofDataUrls = details.loadingPhotoProofDataUrls;
                break;
            case 'intermediate':
                stopToUpdate.deliveryConfirmed = details.deliveryConfirmed;
                stopToUpdate.deliveryPhotoProofDataUrls = details.deliveryPhotoProofDataUrls;
                stopToUpdate.collectionConfirmed = details.collectionConfirmed;
                stopToUpdate.collectionPhotoProofDataUrls = details.collectionPhotoProofDataUrls;
                break;
            case 'destination':
                stopToUpdate.unloadingConfirmed = details.unloadingConfirmed;
                stopToUpdate.unloadingPhotoProofDataUrls = details.unloadingPhotoProofDataUrls;
                stopToUpdate.signatureDataUrl = details.signatureDataUrl || null;
                break;
        }
    }
    
    const isRouteFinished = allStopsForUpdate.every(s => s.status === 'completed' || s.status === 'skipped');
    
    const updatePayload: any = {
        updatedAt: Timestamp.fromDate(new Date(checkpoint.timestamp)),
        updatedBy: { id: currentUser.id, name: currentUser.name },
        originStop: allStopsForUpdate.find(s => s.type === 'origin'),
        destinationStop: allStopsForUpdate.find(s => s.type === 'destination'),
        intermediateStopsOrder: allStopsForUpdate.filter(s => s.type === 'intermediate'),
    };
    
    if (isRouteFinished) {
      updatePayload.executionStatus = 'completed';
      updatePayload.completedAt = Timestamp.fromDate(new Date(checkpoint.timestamp));
    }

    const orderRef = doc(db, 'orders', checkpoint.orderId);
    await updateDoc(orderRef, updatePayload);

    if (isRouteFinished) {
        await sendNotification(
            currentOrderData.clientId,
            "Sua entrega foi concluída!",
            `O pedido Nº ${currentOrderData.id.substring(0,8)} foi finalizado com sucesso.`,
            "success",
            { routeId: currentOrderData.id, eventType: "routeCompletion" }
        );
    }
}, [currentUser]);

  const handleCheckpointSuccess = (completedStopId: string) => {
    const completedIndex = allStops.findIndex(s => s.id === completedStopId);
    const nextIndex = completedIndex + 1;
    
    if (nextIndex < allStops.length) {
      setTimeout(() => scrollToIndex(nextIndex), 300);
    }
  };

  const handleConfirmCheckpoint = async (details: CheckpointConfirmationDetails) => {
    if (!selectedOrder || !stopForCheckpoint) return;
    setIsProcessing(true);
    setIsCheckpointDialogOpen(false); 

    const checkpoint: PendingCheckpoint = {
        id: `${selectedOrder.id}-${stopForCheckpoint.id}-${Date.now()}`,
        orderId: selectedOrder.id,
        stopId: stopForCheckpoint.id,
        status: 'completed',
        timestamp: new Date().toISOString(),
        details: details,
    };
    
    if (isOnline) {
      try {
        toast({ title: "Confirmando Check-in Online...", description: "Salvando no servidor." });
        await updateOrderState(checkpoint, selectedOrder);
        toast({ title: "Check-in Confirmado!", description: "Salvo com sucesso." });
        handleCheckpointSuccess(stopForCheckpoint.id);
      } catch (e: any) {
        toast({ title: "Falha ao Salvar Online", description: `Erro: ${e.message}. Salvando localmente como fallback.`, variant: "destructive" });
        await addPendingCheckpoint(checkpoint);
        setPendingSyncCount(prev => prev + 1);
        handleCheckpointSuccess(stopForCheckpoint.id);
      }
    } else {
        await addPendingCheckpoint(checkpoint);
        setPendingSyncCount(prev => prev + 1);
        toast({ title: "Sem Internet!", description: "Check-in salvo localmente para sincronizar depois." });
        handleCheckpointSuccess(stopForCheckpoint.id);
    }
    setIsProcessing(false);
  };

  const handleConfirmSkipStop = async (reason: string) => {
    if (!selectedOrder || !stopToSkip) return;
    setIsProcessing(true);
    setIsSkipStopDialogOpen(false);

    const checkpoint: PendingCheckpoint = {
        id: `${selectedOrder.id}-${stopToSkip.id}-${Date.now()}`,
        orderId: selectedOrder.id,
        stopId: stopToSkip.id,
        status: 'skipped',
        reason: reason,
        timestamp: new Date().toISOString(),
        details: {},
    };

    if (isOnline) {
        try {
            toast({ title: "Registrando Ocorrência Online...", description: "Salvando no servidor." });
            await updateOrderState(checkpoint, selectedOrder);
            toast({ title: "Parada Pulada!", description: "Ocorrência salva com sucesso." });
            handleCheckpointSuccess(stopToSkip.id);
        } catch (e: any) {
            toast({ title: "Falha ao Salvar Online", description: `Erro: ${e.message}. Salvando localmente.`, variant: "destructive" });
            await addPendingCheckpoint(checkpoint);
            setPendingSyncCount(prev => prev + 1);
            handleCheckpointSuccess(stopToSkip.id);
        }
    } else {
        await addPendingCheckpoint(checkpoint);
        setPendingSyncCount(prev => prev + 1);
        toast({ title: "Sem Internet!", description: "Ocorrência salva localmente para sincronizar depois." });
        handleCheckpointSuccess(stopToSkip.id);
    }
    setIsProcessing(false);
  };
  
  const syncPendingCheckpoints = useCallback(async () => {
    if (!currentUser || !isOnline) {
        if (!isOnline) toast({ title: 'Sincronização Pausada', description: 'Você está offline.', variant: 'default'});
        return;
    }
    const pending = await getPendingCheckpoints();
    setPendingSyncCount(pending.length);

    if (pending.length === 0 || isSyncing) {
        return;
    }
    
    setIsSyncing(true);
    toast({ title: "Sincronizando Check-ins...", description: `${pending.length} registros pendentes.` });

    for (const checkpoint of pending) {
        try {
            const orderDocRef = doc(db, 'orders', checkpoint.orderId);
            const orderSnap = await getDoc(orderDocRef);
            if (!orderSnap.exists()) {
                await removePendingCheckpoint(checkpoint.id);
                toast({ title: `Check-in Ignorado`, description: `O pedido para o check-in pendente foi excluído.`, variant: 'warning' });
                continue; 
            }

            const currentOrderData = sanitizeOrderFromFirestore(orderSnap, "Sync");
            if (!currentOrderData) {
                await removePendingCheckpoint(checkpoint.id);
                continue;
            }
            
            await updateOrderState(checkpoint, currentOrderData);
            await removePendingCheckpoint(checkpoint.id);
            toast({ title: `Check-in #${checkpoint.orderId.substring(0,4)} Sincronizado!` });
        } catch (error) {
            console.error("Sync error for checkpoint:", checkpoint.id, error);
            toast({ title: `Falha na Sincronização`, description: `Não foi possível sincronizar o check-in #${checkpoint.orderId.substring(0,4)}. Tentando novamente em breve.`, variant: 'destructive'});
        }
    }
    
    setIsSyncing(false);
    const remaining = await getPendingCheckpoints();
    setPendingSyncCount(remaining.length);
    if(remaining.length === 0 && pending.length > 0) {
        toast({ title: "Sincronização Concluída!", description: "Todos os registros pendentes foram salvos."})
    }

  }, [currentUser, isSyncing, isOnline, updateOrderState]);

  useEffect(() => {
    if (isOnline) {
        syncPendingCheckpoints(); 
    }
  }, [isOnline, syncPendingCheckpoints]);
  
  const completedStops = useMemo(() => allStops.filter(s => s.status === 'completed' || s.status === 'skipped').length, [allStops]);
  const progress = allStops.length > 0 ? (completedStops / allStops.length) * 100 : 0;

  const formatDuration = (minutes: number | null | undefined): string => {
    if (minutes === null || minutes === undefined || isNaN(minutes)) return "N/D";
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ''}`.trim();
  };
  
  const getStopLabel = (
    stop: OrderRouteStop,
    index: number,
    totalStops: number,
  ): string => {
    if (stop.type === "origin") return "O";
    if (stop.type === "destination") return "D";
    return `P${index}`;
  };

  const getMarkerOptions = (stop: OrderRouteStop, index: number): google.maps.MarkerOptions => {
      const isCurrent = index === currentStopIndex;
      const fillColor = stop.status === 'completed' ? '#16a34a' :
                       stop.status === 'skipped' ? '#ef4444' :
                       isCurrent ? '#3b82f6' :
                       '#6b7280';

      const labelText = getStopLabel(stop, index, allStops.length);

      return {
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: fillColor,
          fillOpacity: 1.0,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 10,
        },
        label: {
          text: labelText,
          color: '#ffffff',
          fontSize: '11px',
          fontWeight: 'bold',
        },
        zIndex: isCurrent ? 100 : 1,
      };
  };
  
  const getSpeedCardClass = () => {
    if (!currentLocation?.coords?.speed) return "bg-card/80";
    const speedKmh = currentLocation.coords.speed * 3.6;
    if (speedKmh >= 110) return "bg-destructive text-destructive-foreground";
    if (speedKmh >= 100) return "bg-orange-400 text-black";
    return "bg-card/80";
  };
  
  const mapOptions = useMemo<google.maps.MapOptions>(() => ({
    disableDefaultUI: true,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    clickableIcons: false,
    mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined
  }), []);


  if (isLoading) return <div className="flex items-center justify-center h-screen"><Icons.loader className="h-12 w-12 animate-spin text-primary" /></div>;
  if (error) return <div className="flex items-center justify-center h-screen"><p className="text-destructive">{error}</p></div>;
  
  if (activeOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-4 p-4 text-center">
        <Icons.checkCircle className="h-12 w-12 text-green-500" />
        <h1 className="text-2xl font-bold">Nenhuma rota em andamento.</h1>
        <Button onClick={() => router.push('/driver-dashboard')}>Voltar ao Painel</Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="h-screen w-screen bg-muted relative overflow-hidden">
        {isMapScriptLoaded ? (
          <GoogleMap
            mapContainerClassName="h-full w-full"
            options={mapOptions}
            onLoad={onMapLoad}
            onDragStart={handleMapInteraction}
            onZoomChanged={handleMapInteraction}
          >
            {isOnline && directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers: true, polylineOptions: { strokeColor: "#87CEFA", strokeWeight: 6, strokeOpacity: 0.5 }}} />}
            {allStops.map((stop, index) => {
                if (!stop.address.latitude || !stop.address.longitude) return null;
                return (
                    <MarkerF
                        key={stop.id}
                        position={{ lat: stop.address.latitude, lng: stop.address.longitude }}
                        options={getMarkerOptions(stop, index)}
                    />
                )
            })}
          </GoogleMap>
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-muted">
              {loadError ? <p className="text-destructive">Erro ao carregar mapa.</p> : <Icons.loader className="h-10 w-10 animate-spin text-primary"/>}
          </div>
        )}

        {/* Driver's fixed icon in the center */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
            <Icons.navigation className="h-8 w-8 text-primary drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]" style={{ transform: 'rotate(-45deg)' }}/>
        </div>

        <div className="absolute top-0 left-0 right-0 p-4">
            <div className="flex flex-col gap-2 items-start">
               <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => router.push('/driver-dashboard')} className="shadow-lg"><Icons.chevronDown className="h-5 w-5 rotate-90 mr-1"/> Voltar</Button>
                  <Button variant="secondary" size="icon" onClick={toggleTheme} className="shadow-lg" aria-label="Alterar Tema">
                      {resolvedTheme === 'dark' ? <Icons.sun className="h-5 w-5"/> : <Icons.moon className="h-5 w-5"/>}
                  </Button>
                  {!isOnline && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/90 text-destructive-foreground text-xs font-semibold shadow-lg">
                      <Icons.cloud className="h-4 w-4"/>
                      <span>Offline</span>
                    </div>
                  )}
                   {pendingSyncCount > 0 && (
                    <Button variant="secondary" size="sm" onClick={() => syncPendingCheckpoints()} disabled={isSyncing} className="shadow-lg animate-pulse">
                        {isSyncing ? <Icons.loader className="animate-spin mr-2"/> : <Icons.cloud className="mr-2 text-amber-500" />}
                        Sincronizar ({pendingSyncCount})
                    </Button>
                  )}
              </div>
              
              <div className="p-1 bg-background/70 backdrop-blur-md rounded-lg shadow-lg flex flex-col gap-1">
                  {activeOrders.map(order => (
                      <Button key={order.id} variant={order.id === selectedOrderId ? 'default' : 'ghost'} size="sm" onClick={() => router.push(`/routes/${order.id}/execute`)} className="text-xs h-8 w-full justify-start">
                          OS: {order.id.substring(0,6)}... ({order.clientCompanyName.substring(0, 10)}...)
                      </Button>
                  ))}
              </div>
            </div>
          
            <div className="absolute top-4 right-4">
                <Card className="shadow-lg bg-card/80 backdrop-blur-sm w-56">
                    <CardHeader className="p-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm">Progresso</CardTitle>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={recenterMap}>
                            <Icons.navigation className="h-4 w-4"/>
                        </Button>
                    </CardHeader>
                    {selectedOrder && (
                        <CardContent className="p-2 pt-0 space-y-1">
                            <Progress value={progress} className="h-2"/>
                            <p className="text-xs text-muted-foreground">{completedStops} de {allStops.length} paradas</p>
                            <p className="text-xs font-semibold">Total: {selectedOrder.routeDistanceKm?.toFixed(1)} km - {formatDuration(selectedOrder.totalDurationMinutes)}</p>
                        </CardContent>
                    )}
                </Card>
            </div>
        </div>

        <div className="absolute bottom-[20rem] left-4 z-20">
           <Card className={cn("shadow-lg backdrop-blur-sm transition-colors w-28", getSpeedCardClass())}>
                <CardContent className="p-2 text-center">
                    <p className="text-3xl font-bold">{currentLocation ? Math.round((currentLocation.coords.speed || 0) * 3.6) : '---'}<span className="text-sm ml-1">km/h</span></p>
                </CardContent>
            </Card>
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 pb-4">
            <div ref={cardsContainerRef} className="flex gap-4 px-4 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-hide">
                {allStops.map((stop, index) => {
                    const isCurrent = index === currentStopIndex;
                    const isCompleted = stop.status === 'completed' || stop.status === 'skipped';
                    
                    return (
                        <Card key={stop.id} className={cn("w-80 max-w-[85vw] snap-center flex-shrink-0 shadow-xl bg-card/90 backdrop-blur-sm flex flex-col", isCurrent && "ring-2 ring-primary")}>
                             <CardHeader className="p-3">
                                <div className="flex justify-between items-start">
                                    <CardTitle className="text-base">{stop.name || stopTypeTranslations[stop.type]}</CardTitle>
                                    <div className="flex items-center gap-1">
                                      <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button>{pendingSyncCount > 0 && allStops[index].status === 'pending' && <Icons.cloud className="h-4 w-4 text-orange-500 animate-pulse"/>}</button>
                                          </TooltipTrigger>
                                          <TooltipContent><p>Sincronização pendente</p></TooltipContent>
                                      </Tooltip>
                                      <Icons.mapPin className="h-5 w-5 text-muted-foreground"/>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground pt-1">{stop.address.description}</p>
                             </CardHeader>
                             <CardContent className="p-3 pt-0 flex-grow">
                                  {isCurrent && distanceToStop !== null && (
                                    <div className="text-xs text-center text-primary font-semibold bg-primary/10 p-1.5 rounded-md mb-2">
                                        Distância até a parada: {distanceToStop > 1000 ? `${(distanceToStop/1000).toFixed(1)} km` : `${Math.round(distanceToStop)} m`}
                                    </div>
                                  )}
                                  {stop.loadingInstructions && <p className="text-xs bg-amber-100 dark:bg-amber-900/50 p-2 rounded-md"><span className="font-bold">Instruções/Obs:</span> {stop.loadingInstructions}</p>}
                             </CardContent>
                             <CardFooter className="p-3 mt-auto flex flex-col items-stretch gap-2">
                                  {isCompleted ? (
                                      <div className={cn(
                                          "text-center font-semibold p-2 rounded-md text-sm",
                                          stop.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' : 'bg-destructive/10 text-destructive'
                                      )}>
                                          {stop.status === 'completed' ? 'Parada Concluída' : 'Parada Pulada'} em {formatDateDisplay(stop.checkedAt, true)}
                                      </div>
                                  ) : isCurrent ? (
                                      <>
                                          <div className="flex gap-2 justify-between items-center">
                                              <Button onClick={() => handleOpenCheckpoint(stop)} disabled={isProcessing || (distanceToStop !== null && distanceToStop > 200)} className="flex-grow">
                                                  <Icons.checkCircle className="mr-2"/>Check-in
                                              </Button>
                                              <DropdownMenu>
                                                  <DropdownMenuTrigger asChild><Button variant="outline" size="icon"><Icons.moreVertical/></Button></DropdownMenuTrigger>
                                                  <DropdownMenuContent>
                                                      <DropdownMenuItem onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address.description)}`, '_blank')}>
                                                      <Icons.navigation className="mr-2 h-4 w-4" />Navegar
                                                      </DropdownMenuItem>
                                                      <DropdownMenuItem onClick={() => handleOpenSkipStop(stop)} className="text-destructive focus:text-destructive">
                                                      <Icons.xCircle className="mr-2 h-4 w-4"/>Pular Parada
                                                      </DropdownMenuItem>
                                                  </DropdownMenuContent>
                                              </DropdownMenu>
                                          </div>
                                      </>
                                  ) : (
                                      <div className="text-center text-muted-foreground p-2 text-sm">
                                          Aguardando parada anterior.
                                      </div>
                                  )}
                             </CardFooter>
                        </Card>
                    )
                })}
                <div className="w-1 flex-shrink-0 snap-center" />
            </div>
        </div>
        
        <CheckpointDialog isOpen={isCheckpointDialogOpen} onOpenChange={setIsCheckpointDialogOpen} stop={stopForCheckpoint} onConfirm={handleConfirmCheckpoint} isProcessing={isProcessing} isOnline={isOnline} />
        <SkipStopDialog isOpen={isSkipStopDialogOpen} onOpenChange={setIsSkipStopDialogOpen} onConfirm={handleConfirmSkipStop} />
        <ChatWidget />
      </div>
    </TooltipProvider>
  );
}
