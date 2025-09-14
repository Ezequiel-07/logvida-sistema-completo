
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import type { Order, RouteStop } from "@/types/order";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";
import { CreateRouteForm, type RouteFormData, routeFormSchema } from "@/app/(app)/routes/components/CreateRouteForm";
import { useForm, FormProvider, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { sendNotification } from "@/server/actions/notifications";
import { Button } from "@/components/ui/button";
import { useSharedGoogleMapsLoader } from "@/lib/googleMaps";
import { GoogleMap, MarkerF, DirectionsRenderer } from "@react-google-maps/api";
import { Skeleton } from "@/components/ui/skeleton";
import { getRouteDetailsWithTolls } from "@/server/actions/routes";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { calculateTotalValue } from "@/lib/route-utils";
import { type User } from "@/types/user";

interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  id: string;
}

const defaultMapCenter = { lat: -28.4717, lng: -48.9115 };
const mapContainerStyle = { width: "100%", height: "100%" };
const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  clickableIcons: false,
};

export function LiveOrderEditClient({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  // Mapa
  const { isLoaded: isMapScriptLoaded, loadError } = useSharedGoogleMapsLoader();
  const mapRef = useRef<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);

  const formMethods = useForm<RouteFormData>({
    resolver: zodResolver(routeFormSchema),
    defaultValues: {
      name: "",
      origin: { name: "", address: { description: "" }, notes: "" },
      intermediateStops: [],
      destination: { name: "", address: { description: "" }, loadingInstructions: "" },
      totalDistanceKm: 0,
      totalDurationMinutes: 0,
      totalTollCost: 0,
    }
  });

  const { reset, getValues, setValue, watch, control, handleSubmit } = formMethods;
  
  const watchedOrigin = watch('origin.address.description');
  const watchedDestination = watch('destination.address.description');
  const watchedIntermediateStops = watch('intermediateStops');

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "intermediateStops",
  });

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const geocodeAddress = useCallback(
    async (address: { description: string; latitude?: number | null, longitude?: number | null }, label: string, id: string): Promise<MapMarker | null> => {
      if (!isMapScriptLoaded || !window.google || !address.description) return null;

      if (address.latitude && address.longitude) {
          return { lat: address.latitude, lng: address.longitude, label, id };
      }
      
      const geocoder = new window.google.maps.Geocoder();
      return new Promise((resolve) => {
        geocoder.geocode({ address: address.description }, (results, status) => {
          if (status === 'OK' && results?.[0]?.geometry?.location) {
            resolve({
              lat: results[0].geometry.location.lat(),
              lng: results[0].geometry.location.lng(),
              label,
              id,
            });
          } else {
            resolve(null);
          }
        });
      });
    },
    [isMapScriptLoaded]
  );
  
  const updateMapMarkersAndRoute = useCallback(async () => {
    if (!isMapScriptLoaded) return;
    const values = getValues();
    const allStops: { stop: { description: string; latitude?: number | null; longitude?: number | null }; label: string; id: string }[] = [];
    
    if (values.origin.address.description) allStops.push({ stop: values.origin.address, label: 'O', id: 'origin' });
    values.intermediateStops?.forEach((s, i) => {
      if (s.address.description) allStops.push({ stop: s.address, label: `P${i+1}`, id: `int-${i}` });
    });
    if (values.destination.address.description) allStops.push({ stop: values.destination.address, label: 'D', id: 'destination' });
    
    const geocodedMarkers = (await Promise.all(allStops.map(a => geocodeAddress(a.stop, a.label, a.id)))).filter(Boolean) as MapMarker[];
    setMarkers(geocodedMarkers);

    if (directionsResponse) {
      if (mapRef.current && directionsResponse.routes[0]?.bounds) {
        mapRef.current.fitBounds(directionsResponse.routes[0].bounds);
      }
    } else if (geocodedMarkers.length > 0 && mapRef.current) {
      const bounds = new window.google.maps.LatLngBounds();
      geocodedMarkers.forEach(m => bounds.extend({ lat: m.lat, lng: m.lng }));
      mapRef.current.fitBounds(bounds);
      if (geocodedMarkers.length === 1) mapRef.current.setZoom(14);
    }
  }, [isMapScriptLoaded, getValues, geocodeAddress, directionsResponse]);

  const handleRouteCalculation = useCallback(async (optimize = false) => {
    setIsCalculating(true);
    setDirectionsResponse(null); // Clear previous route
    toast({ title: "Calculando Rota...", description: "Aguarde, buscando os melhores caminhos e pedágios." });
    
    const { origin, destination, intermediateStops } = getValues();

    if (!origin?.address?.description || !destination?.address?.description) {
        toast({ title: "Endereços Faltando", description: "Origem e destino são obrigatórios para calcular.", variant: 'destructive'});
        setIsCalculating(false);
        return;
    }

    const res = await getRouteDetailsWithTolls(
      origin.address.description,
      destination.address.description,
      intermediateStops?.map(s => s.address.description) || [],
      optimize,
    );
    
    if (res.success && res.data) {
      const { distance, duration, tolls, optimizedWaypointOrder } = res.data;
      setValue("totalDistanceKm", distance);
      setValue("totalDurationMinutes", duration);
      setValue("totalTollCost", tolls);

      if (optimize && optimizedWaypointOrder && intermediateStops) {
        const reorderedStops = optimizedWaypointOrder.map((newIndex: number) => intermediateStops[newIndex]);
        setValue("intermediateStops", reorderedStops);
        toast({ title: "Paradas Otimizadas!", description: "A ordem das paradas foi ajustada para a rota mais eficiente." });
      }
      
      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route({
        origin: origin.address.description,
        destination: destination.address.description,
        waypoints: (getValues('intermediateStops') || []).map(s => ({ location: s.address.description, stopover: true })),
        travelMode: window.google.maps.TravelMode.DRIVING,
      }, (result, status) => {
          if (status === 'OK' && result) {
              setDirectionsResponse(result);
          }
      });
      toast({ title: "Rota Calculada!", description: `Distância: ${distance} km.` });
    } else {
      toast({ title: "Erro ao Calcular Rota", description: res.error, variant: "destructive" });
    }
    
    setIsCalculating(false);
  }, [getValues, setValue]);

  useEffect(() => {
    if (isMapScriptLoaded) {
      updateMapMarkersAndRoute();
    }
  }, [isMapScriptLoaded, updateMapMarkersAndRoute, watchedOrigin, watchedDestination, watchedIntermediateStops]);


  const fetchAndSetData = useCallback(async () => {
    if (!orderId) {
        toast({ title: "ID da Ordem de Serviço Inválido", variant: "destructive" });
        router.push("/orders");
        return;
    }
    setIsLoading(true);
    try {
        const orderRef = doc(db, "orders", orderId);
        const orderSnap = await getDoc(orderRef);
        
        if (orderSnap.exists()) {
            const sanitizedOrder = sanitizeOrderFromFirestore(orderSnap, "LiveOrderEdit");
            if (sanitizedOrder && (sanitizedOrder.executionStatus === 'pending' || sanitizedOrder.executionStatus === 'in-progress')) {
                setOrder(sanitizedOrder);
                
                reset({
                    name: sanitizedOrder.selectedRouteName || `Ordem de Serviço ${sanitizedOrder.id}`,
                    origin: { name: sanitizedOrder.originStop?.name || "", address: sanitizedOrder.originStop?.address || { id: "", description: "" }, notes: sanitizedOrder.originStop?.notes || "" },
                    intermediateStops: sanitizedOrder.intermediateStopsOrder?.map(s => ({ name: s.name || "", address: s.address || { id: "", description: "" }, loadingInstructions: s.loadingInstructions || "", status: s.status })) || [],
                    destination: { name: sanitizedOrder.destinationStop?.name || "", address: sanitizedOrder.destinationStop?.address || { id: "", description: "" }, loadingInstructions: sanitizedOrder.destinationStop?.loadingInstructions || "" },
                    totalDistanceKm: sanitizedOrder.routeDistanceKm ?? 0,
                    totalDurationMinutes: sanitizedOrder.totalDurationMinutes ?? 0,
                    totalTollCost: sanitizedOrder.routeTollCost ?? 0
                });
                await handleRouteCalculation(); // Automatically calculate route on load
            } else {
                toast({ title: "Ação Não Permitida", description: "Ordens de Serviço concluídas ou canceladas não podem ser editadas.", variant: "destructive" });
                router.push("/orders");
            }
        } else {
            toast({ title: "Ordem de Serviço não encontrada", variant: "destructive" });
            router.push("/orders");
        }
    } catch (e) {
         console.error("Erro ao carregar dados da Ordem de Serviço para edição:", e);
         toast({ title: "Erro ao carregar dados", description: "Não foi possível buscar as informações da Ordem de Serviço.", variant: "destructive" });
         router.push("/orders");
    }
    setIsLoading(false);
  }, [orderId, router, reset, handleRouteCalculation]);

  useEffect(() => {
    fetchAndSetData();
  }, [fetchAndSetData]);

  const handleSave = async (data: RouteFormData) => {
    if (!order || !currentUser) return;
    setIsSaving(true);
    
    const orderRef = doc(db, "orders", order.id);

    // Recalculate totalValue before saving
    const companySettingsSnap = await getDoc(doc(db, "companySettings", "main"));
    const driverSnap = await getDoc(doc(db, "users", order.assignedDriverId!));
    const companySettings = companySettingsSnap.data();
    const driver = driverSnap.data() as User;

    const recalculatedValues = calculateTotalValue(
      {
        pricingMethod: order.pricingMethod,
        distanceKm: data.totalDistanceKm,
        pricePerKm: order.pricePerKm,
        boxCount: order.numberOfBoxes,
        pricePerBox: order.pricePerBox,
      },
      {
        arteris: companySettings?.arterisTollPrice || 0,
        ccr: companySettings?.ccrTollPrice || 0,
        fuelPrice: companySettings?.fuelPrice || 0,
        averageFuelConsumption: driver?.vehicle?.costs?.fuelConsumption || 10,
      }
    );
    
    const updatedOrderData: Partial<Order> = {
        selectedRouteName: data.name,
        originStop: { ...order.originStop, name: data.origin.name, address: { ...order.originStop.address, ...data.origin.address }, notes: data.origin.notes },
        intermediateStopsOrder: (data.intermediateStops || []).map((stop, index) => ({ 
            ...(order.intermediateStopsOrder?.[index] || {}), 
            name: stop.name, 
            address: { ...(order.intermediateStopsOrder?.[index]?.address || { id: "" }), ...stop.address },
            loadingInstructions: stop.loadingInstructions, 
            type: 'intermediate', 
            status: order.intermediateStopsOrder?.[index]?.status || 'pending' 
        } as RouteStop)),
        destinationStop: { ...order.destinationStop, name: data.destination.name, address: { ...order.destinationStop.address, ...data.destination.address }, loadingInstructions: data.destination.loadingInstructions },
        routeDistanceKm: data.totalDistanceKm,
        totalDurationMinutes: data.totalDurationMinutes,
        routeTollCost: data.totalTollCost,
        totalValue: recalculatedValues.totalValue,
        fuelCost: recalculatedValues.fuelCost,
        transportServiceCost: recalculatedValues.transportServiceCost,
        updatedBy: { id: currentUser.id, name: currentUser.name },
    };


    try {
      await updateDoc(orderRef, { ...updatedOrderData, updatedAt: Timestamp.now() });

      if (order.assignedDriverId) {
        await sendNotification(
            order.assignedDriverId, 
            `Atenção! Ordem de Serviço atualizada.`,
            `A rota para ${order.clientCompanyName} foi alterada. Verifique os detalhes.`,
            'warning', 
            { routeId: order.id, eventType: 'routeUpdate' }
        );
      }

      toast({ title: "Ordem de Serviço Atualizada", description: "As alterações foram salvas com sucesso." });
      router.push("/orders");
    } catch (error) {
        console.error("Erro ao atualizar a Ordem de Serviço:", error);
        toast({ title: "Erro ao Atualizar", description: "Não foi possível salvar as alterações.", variant: "destructive" });
    } finally {
        setIsSaving(false);
    }
  };
  
  const mapDisplay = (
    <div className="w-full h-[400px] md:h-full rounded-lg overflow-hidden border shadow-inner bg-muted">
      {loadError ? ( <div className="flex items-center justify-center h-full text-destructive">Erro ao carregar o mapa.</div> ) : 
       isMapScriptLoaded ? (
        <GoogleMap mapContainerStyle={mapContainerStyle} center={defaultMapCenter} zoom={10} options={mapOptions} onLoad={onMapLoad}>
          {markers.map(marker => <MarkerF key={marker.id} position={{ lat: marker.lat, lng: marker.lng }} label={marker.label} />)}
          {directionsResponse && <DirectionsRenderer directions={directionsResponse} options={{ suppressMarkers: true, polylineOptions: { strokeColor: "#4285F4", strokeWeight: 6, strokeOpacity: 0.8 }}} />}
        </GoogleMap>
      ) : (
        <div className="flex items-center justify-center h-full"><Skeleton className="w-full h-full" /><div className="absolute flex flex-col items-center text-muted-foreground"><Icons.loader className="w-8 w-8 animate-spin mb-2" /><p>Carregando mapa...</p></div></div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icons.loader className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return <p className="text-center text-muted-foreground py-10">Ordem de Serviço não encontrada ou não pode ser editada.</p>;
  }
  
  return (
    <FormProvider {...formMethods}>
        <div className="grid lg:grid-cols-[2fr_1fr] gap-x-8 gap-y-6">
            <div className="space-y-6 order-1">
                <CreateRouteForm
                    onMoveStop={move}
                    onCalculateRoute={handleRouteCalculation}
                />
            </div>
            <div className="order-2 lg:sticky lg:top-20 h-[500px] lg:h-auto">
                {mapDisplay}
            </div>
        </div>
        <div className="flex justify-end pt-8 mt-6 border-t gap-2">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSaving || isCalculating} size="lg">
                    Cancelar e Voltar
                </Button>
                <Button type="button" onClick={handleSubmit(handleSave)} disabled={isSaving || isCalculating} size="lg">
                    {(isSaving || isCalculating) && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar Alterações
                </Button>
            </div>
    </FormProvider>
  );
}
