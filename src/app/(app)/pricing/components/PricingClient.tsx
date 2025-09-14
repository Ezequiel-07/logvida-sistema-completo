

"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useForm, Controller, FormProvider, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Icons } from "@/components/icons";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import type { Client } from "@/types/client";
import type { Order, RouteStop as OrderRouteStop } from "@/types/order";
import type { User } from "@/types/user";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, toISOString } from "@/lib/utils";
import {
  format,
  parseISO,
  isValid,
  startOfToday,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addDays,
  setHours,
  setMinutes
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  Timestamp,
  getDocs,
  query,
  orderBy,
  where,
  writeBatch,
  getDoc,
} from "firebase/firestore";
import {
  CreateRouteForm,
  routeFormSchema as orderRouteFormSchema,
} from "@/app/(app)/routes/components/CreateRouteForm";
import type { Route } from "@/types/route";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";
import { sendNotification } from "@/server/actions/notifications";
import { getRouteDetailsWithTolls } from "@/server/actions/routes";
import { useSharedGoogleMapsLoader } from "@/lib/googleMaps";
import { GoogleMap, DirectionsRenderer, MarkerF } from "@react-google-maps/api";
import { Skeleton } from "@/components/ui/skeleton";
import type { NamedLocation } from "@/types/namedLocation";


const boxItemSchema = z.object({
  type: z.string().min(1),
  quantity: z.coerce.number().min(1),
  weight: z.coerce.number().min(0),
  price: z.coerce.number().optional(), // Price per unit, can be manually edited
});

const pricingFormSchema = z.object({
  clientId: z.string().min(1, "Selecione um cliente"),
  driverId: z.string().min(1, "Selecione um motorista"),
  pricingMethod: z.enum(["perBox", "perRoute"]),
  boxes: z.array(boxItemSchema).optional(),
  pricePerKm: z.coerce.number().optional(),
  tdeValue: z.coerce.number().optional(), // Tempo de Espera
  serviceDate: z.date().optional(),
  startTime: z.string().optional(), // HH:mm format
  repeatDays: z.array(z.string()).optional(),
  routeId: z.string().optional(),
});

const vidaLogCompanyInfo = {
  name: "LogVida Transportes Especializados",
  cnpj: "37.519.142/0001-70",
  address: "Rua Vigário José Poggel, 494",
  cep: "88704-240",
};

const dayOfWeekToJsDay: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 0,
};

const copyAndResetRouteStop = (
  stop: { name?: string | null; address: { description: string, latitude?: number | null, longitude?: number | null }; notes?: string | null; loadingInstructions?: string | null; },
  type: OrderRouteStop["type"],
  orderId: string,
  prefix: string,
  index?: number,
): OrderRouteStop => {
  const newStopId = `${prefix}_${orderId}${
    index !== undefined ? `_s${index}` : ""
  }`;
  return {
    name: stop.name ?? null,
    address: {
      id: `addr_${newStopId}`,
      description: stop.address.description,
      latitude: stop.address.latitude ?? null,
      longitude: stop.address.longitude ?? null,
    },
    id: newStopId,
    type: type,
    status: "pending",
    checkedAt: null,
    notes: stop.notes ?? null,
    loadingInstructions: stop.loadingInstructions ?? null,
    deliveryPhotoProofDataUrls: null,
    collectionPhotoProofDataUrls: null,
    unloadingPhotoProofDataUrls: null,
    signatureDataUrl: null,
    deliveryConfirmed: null,
    collectionConfirmed: null,
    loadingConfirmed: null,
    unloadingConfirmed: null,
    plannedTime: null,
  };
};

const weekDays: { id: string; label: string }[] = [
  { id: "monday", label: "Segunda" },
  { id: "tuesday", label: "Terça" },
  { id: "wednesday", label: "Quarta" },
  { id: "thursday", label: "Quinta" },
  { id: "friday", label: "Sexta" },
  { id: "saturday", label: "Sábado" },
  { id: "sunday", label: "Domingo" },
];

const boxTypes = {
  Pequena: { basePrice: 15.00, weightFactor: 0.50 }, // R$ 0.50 por kg adicional
  Média: { basePrice: 25.00, weightFactor: 0.75 },
  Grande: { basePrice: 40.00, weightFactor: 1.00 },
};

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

export function PricingClient() {
  const { currentUser } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingOrder, setIsProcessingOrder] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const [drivers, setDrivers] = useState<User[]>([]);
  
  const [averageFuelConsumption, setAverageFuelConsumption] = useState<number>(16);
  const [fuelPrice, setFuelPrice] = useState<number>(6.24);
  
  // Map state
  const { isLoaded: isMapScriptLoaded, loadError } = useSharedGoogleMapsLoader();
  const mapRef = useRef<google.maps.Map | null>(null);
  const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const hasAppliedUrlParams = useRef(false);

  const formMethods = useForm({
    resolver: zodResolver(pricingFormSchema.merge(orderRouteFormSchema)),
    defaultValues: {
      clientId: "",
      driverId: "",
      pricingMethod: "perRoute" as const,
      pricePerKm: 0.0,
      tdeValue: 0,
      boxes: [{ type: "Pequena", quantity: 1, weight: 1, price: boxTypes['Pequena'].basePrice }],
      serviceDate: undefined,
      startTime: "",
      repeatDays: [],
      routeId: "",
      name: "",
      origin: { name: "", address: { description: "" }, notes: "" },
      intermediateStops: [],
      destination: { name: "", address: { description: "" }, loadingInstructions: "" },
      totalDistanceKm: null,
      totalDurationMinutes: null,
      totalTollCost: null,
    },
  });

  const { control, handleSubmit, watch, getValues, setValue, reset } = formMethods;

  const { fields: boxFields, append: appendBox, remove: removeBox } = useFieldArray({
    control,
    name: "boxes",
  });

  const watchedFormValues = watch(); // Watch all form values for automatic calculation
  
  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const clientsQuery = query(collection(db, "clients"), orderBy("companyName", "asc"));
      const driversQuery = query(collection(db, "users"), where("role", "==", "driver"));
      const routesQuery = query(collection(db, "routes"), orderBy("name", "asc"));
      const settingsRef = doc(db, "companySettings", "main");
      
      const [clientsSnapshot, driversSnapshot, routesSnapshot, settingsSnap] = await Promise.all([
        getDocs(clientsQuery),
        getDocs(driversQuery),
        getDocs(routesQuery),
        getDoc(settingsRef)
      ]);

      const clientsData = clientsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Client[];
      setClients(clientsData);

      const driversData = driversSnapshot.docs.map((doc) => ({
        id: doc.id, ...doc.data()
      } as User)).sort((a, b) => a.name.localeCompare(b.name));
      setDrivers(driversData);

      const routesData = routesSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}) as Route);
      setRoutes(routesData);

      if (settingsSnap.exists()) {
        const settings = settingsSnap.data();
        setFuelPrice(settings.fuelPrice ?? 6.24);
      }

    } catch (error) {
      toast({ title: "Erro ao Carregar Dados", description: "Falha ao buscar dados do Firestore. Verifique o console.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const loadOrderForDuplication = useCallback(async (orderId: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      if (orderSnap.exists()) {
        const orderData = sanitizeOrderFromFirestore(orderSnap, "PricingClient");
        if (orderData) {
          reset({
            clientId: orderData.clientId,
            driverId: orderData.assignedDriverId || "",
            pricingMethod: orderData.pricingMethod,
            boxes: orderData.boxDetails || [],
            pricePerKm: orderData.pricePerKm || 0.6,
            tdeValue: (orderData as any).tdeValue || 0, // Assuming tdeValue might exist on duplicated order
            name: orderData.selectedRouteName || "",
            origin: {
                name: orderData.originStop?.name || "",
                address: orderData.originStop?.address || { description: "" },
                notes: orderData.originStop?.notes || "",
            },
            intermediateStops: (orderData.intermediateStopsOrder || []).map(s => ({
                name: s.name || "",
                address: s.address || { description: "" },
                loadingInstructions: s.loadingInstructions || "",
                status: 'pending',
            })),
            destination: {
                name: orderData.destinationStop?.name || "",
                address: orderData.destinationStop?.address || { description: "" },
                loadingInstructions: orderData.destinationStop?.loadingInstructions || "",
            },
            totalDistanceKm: orderData.routeDistanceKm,
            totalDurationMinutes: orderData.totalDurationMinutes,
            totalTollCost: orderData.routeTollCost,
            serviceDate: undefined,
            startTime: "",
            repeatDays: [],
          });
          toast({ title: "Pedido Duplicado", description: "Ajuste a data e outros detalhes conforme necessário." });
        } else {
           toast({ title: "Erro ao Duplicar", description: "Dados do pedido original estão inconsistentes.", variant: "destructive" });
        }
      } else {
        toast({ title: "Erro ao Duplicar", description: "Pedido original não encontrado.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro ao Carregar Pedido", description: "Falha ao buscar dados do pedido para duplicação.", variant: "destructive" });
    } finally {
      router.replace(pathname, { scroll: false });
    }
  }, [reset, router, pathname]);

  useEffect(() => {
    if (isLoading || hasAppliedUrlParams.current) return;
  
    const fromQuote = searchParams.get('fromQuote');
    const duplicateFromId = searchParams.get('duplicateFromId');
  
    if (fromQuote === 'true') {
      const clientIdParam = searchParams.get('clientId');
      if (clientIdParam) {
        setValue('clientId', clientIdParam);
      }
  
      const numberOfBoxes = searchParams.get('numberOfBoxes');
      if (numberOfBoxes) {
        setValue('boxes', [{ type: 'Pequena', quantity: Number(numberOfBoxes), weight: 1, price: boxTypes['Pequena'].basePrice }]);
        setValue('pricingMethod', 'perBox');
      }

      // Handle Origin
      const originAddress = searchParams.get('origin_address');
      if(originAddress) setValue('origin.address.description', originAddress);
      const originName = searchParams.get('origin_name');
      if(originName) setValue('origin.name', originName);
      const originInstructions = searchParams.get('origin_instructions');
      if(originInstructions) setValue('origin.notes', originInstructions);
      
      // Handle Destination
      const destinationAddress = searchParams.get('destination_address');
      if(destinationAddress) setValue('destination.address.description', destinationAddress);
      const destinationName = searchParams.get('destination_name');
      if(destinationName) setValue('destination.name', destinationName);
      const destinationInstructions = searchParams.get('destination_instructions');
      if(destinationInstructions) setValue('destination.loadingInstructions', destinationInstructions);

      // Handle Intermediate Stops
      const intermediateStopsData = [];
      for (let i = 0; searchParams.has(`intermediate_${i}_address`); i++) {
          intermediateStopsData.push({
              address: { description: searchParams.get(`intermediate_${i}_address`)! },
              name: searchParams.get(`intermediate_${i}_name`) || "",
              loadingInstructions: searchParams.get(`intermediate_${i}_instructions`) || "",
              status: 'pending' as const,
          });
      }
      if (intermediateStopsData.length > 0) {
        setValue('intermediateStops', intermediateStopsData);
      }
      
      hasAppliedUrlParams.current = true;
      router.replace(pathname, { scroll: false });
      return;
    }
  
    if (duplicateFromId) {
      hasAppliedUrlParams.current = true;
      loadOrderForDuplication(duplicateFromId);
      return;
    }
  
    const routeId = searchParams.get('routeId');
    if (routeId) {
      hasAppliedUrlParams.current = true;
      router.replace(pathname, { scroll: false });
    }
  }, [isLoading, searchParams, setValue, router, pathname, loadOrderForDuplication]);


  const selectedClient = useMemo(() => clients.find((c) => c.id === watchedFormValues.clientId), [clients, watchedFormValues.clientId]);
  const selectedDriver = useMemo(() => drivers.find((d) => d.id === watchedFormValues.driverId), [drivers, watchedFormValues.driverId]);

  const totalValue = useMemo(() => {
    if (watchedFormValues.pricingMethod === "perBox") {
      return (watchedFormValues.boxes || []).reduce((total, box) => {
        const pricePerBox = box.price ?? 0;
        return total + (pricePerBox * box.quantity);
      }, 0);
    } else {
      const routeDistanceKm = Number(watchedFormValues.totalDistanceKm) || 0;
      const pricePerKm = Number(watchedFormValues.pricePerKm) || 0;
      const totalTollCost = Number(watchedFormValues.totalTollCost) || 0;
      const tdeCost = Number(watchedFormValues.tdeValue) || 0;
      const transportServiceCost = routeDistanceKm * pricePerKm;
      const calculatedFuelCost = routeDistanceKm > 0 && averageFuelConsumption > 0 ? (routeDistanceKm / averageFuelConsumption) * fuelPrice : 0;
      return transportServiceCost + calculatedFuelCost + totalTollCost + tdeCost;
    }
  }, [watchedFormValues, averageFuelConsumption, fuelPrice]);

  const resetFormState = () => reset();
  
  const handleCalculateRoute = useCallback(async (optimize = false) => {
    setIsCalculating(true);
    setDirectionsResponse(null);
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
      
      if (isMapScriptLoaded && window.google) {
        const directionsService = new window.google.maps.DirectionsService();
        directionsService.route({
          origin: origin.address.description,
          destination: destination.address.description,
          waypoints: (getValues('intermediateStops') || []).map(s => ({ location: s.address.description, stopover: true })),
          travelMode: window.google.maps.TravelMode.DRIVING,
        }, (result, status) => {
            if (status === 'OK' && result) {
                setDirectionsResponse(result);
                if (mapRef.current && result.routes[0]?.bounds) {
                    mapRef.current.fitBounds(result.routes[0].bounds);
                }
            }
        });
      }

      toast({ title: "Rota Calculada!", description: `Distância: ${distance} km.` });
    } else {
      toast({ title: "Erro ao Calcular Rota", description: res.error, variant: "destructive" });
    }
    
    setIsCalculating(false);
  }, [getValues, setValue, isMapScriptLoaded]);

  const handleCreateOrder = async (data: any) => {
    if (!selectedClient || !selectedDriver) {
      toast({ title: "Dados Incompletos", description: "Selecione um cliente e um motorista.", variant: "destructive" });
      return;
    }
    
    if (data.pricingMethod === 'perRoute' && (data.totalDistanceKm === null || data.totalDurationMinutes === null)) {
        toast({ title: "Cálculo de Rota Pendente", description: "Calculando detalhes da rota antes de criar o pedido.", variant: "default" });
        await handleCalculateRoute(false);
        const updatedData = getValues();
        if (updatedData.totalDistanceKm === null) {
             toast({ title: "Falha no Cálculo", description: "Não foi possível calcular a rota. Verifique os endereços.", variant: "destructive"});
             return;
        }
        data = updatedData;
    }

    setIsProcessingOrder(true);
    
    const getBaseOrderData = (orderData: any) => {
      const base = {
        clientId: selectedClient.id, clientCompanyName: selectedClient.companyName, clientCnpj: selectedClient.cnpj,
        clientAddress: selectedClient.address, clientEmail: selectedClient.email, clientPhone: selectedClient.phone,
        vidaLogInfo: vidaLogCompanyInfo, paymentStatus: "pending" as const, executionStatus: "pending" as const,
        assignedDriverId: selectedDriver.id, assignedDriverName: selectedDriver.name,
        assignedVehicleId: selectedDriver.vehicleId || null,
        assignedVehicleName: selectedDriver.vehicle?.name || null,
        assignedVehiclePlate: selectedDriver.vehicle?.plate || null,
        selectedRouteId: orderData.routeId || null,
        selectedRouteName: orderData.name,
        routeDistanceKm: orderData.totalDistanceKm,
        totalDurationMinutes: orderData.totalDurationMinutes,
      };

      if (orderData.pricingMethod === "perBox") {
        return {
          ...base, pricingMethod: "perBox" as const,
          numberOfBoxes: (orderData.boxes || []).reduce((sum: number, box: {quantity: number}) => sum + box.quantity, 0),
          boxDetails: orderData.boxes,
          totalValue: totalValue,
          pricePerKm: null,
          fuelCost: null,
          routeTollCost: null,
          tdeValue: null,
          transportServiceCost: null,
        };
      } else {
        const totalTollCost = orderData.totalTollCost ?? 0;
        const tdeCost = Number(orderData.tdeValue) || 0;
        const transportServiceCost = (orderData.totalDistanceKm ?? 0) * (orderData.pricePerKm ?? 0);
        const calculatedFuelCost = (orderData.totalDistanceKm ?? 0) > 0 && averageFuelConsumption > 0 ? ((orderData.totalDistanceKm ?? 0) / averageFuelConsumption) * fuelPrice : 0;
        
        return {
          ...base, pricingMethod: "perRoute" as const,
          pricePerKm: orderData.pricePerKm,
          fuelCost: parseFloat(calculatedFuelCost.toFixed(2)), routeTollCost: totalTollCost,
          tdeValue: tdeCost,
          transportServiceCost: parseFloat(transportServiceCost.toFixed(2)), 
          totalValue: totalValue,
          numberOfBoxes: null,
          boxDetails: null,
        };
      }
    };
    
    const baseOrderData = getBaseOrderData(data);
    
    const getCombinedDateTime = (date?: Date, time?: string): Date | null => {
        if (!date) return null;
        if (!time) return date; // Return just the date if no time is set

        const [hours, minutes] = time.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) return date;

        return setMinutes(setHours(date, hours), minutes);
    };
    
    try {
        const batch = writeBatch(db);
        let ordersCreatedCount = 0;
        const now = new Date();
        const createdOrdersForNotification: {id: string, date: Date | null}[] = [];

        if (watchedFormValues.repeatDays && watchedFormValues.repeatDays.length > 0) {
            const today = startOfToday();
            const end = endOfMonth(today);
            const interval = eachDayOfInterval({ start: today, end });
            const scheduledJsDays = watchedFormValues.repeatDays.map(day => dayOfWeekToJsDay[day as string]);

            for (const day of interval) {
                if (scheduledJsDays.includes(getDay(day))) {
                    const orderId = `ORD-${String(now.getTime() + ordersCreatedCount).slice(-6)}${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;
                    const combinedDate = getCombinedDateTime(day, data.startTime);
                    const orderForFirestore: any = {
                        ...baseOrderData, 
                        id: orderId, 
                        createdAt: Timestamp.now(),
                        serviceDate: combinedDate ? Timestamp.fromDate(combinedDate) : null,
                        repeatDaysOrder: data.repeatDays, 
                        originStop: copyAndResetRouteStop(data.origin, "origin", orderId, "ord_o"),
                        intermediateStopsOrder: data.intermediateStops.map((s: any, i: number) => copyAndResetRouteStop(s, "intermediate", orderId, "ord_i", i)),
                        destinationStop: copyAndResetRouteStop(data.destination, "destination", orderId, "ord_d"),
                    };
                    const orderRef = doc(db, "orders", orderId);
                    batch.set(orderRef, orderForFirestore);
                    ordersCreatedCount++;
                    if(combinedDate) createdOrdersForNotification.push({id: orderId, date: combinedDate});
                }
            }
        } else {
            const orderId = `ORD-${String(now.getTime()).slice(-6)}${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;
            const combinedDate = getCombinedDateTime(data.serviceDate, data.startTime);
            const orderForFirestore: any = {
                ...baseOrderData,
                id: orderId,
                createdAt: Timestamp.now(),
                serviceDate: combinedDate ? Timestamp.fromDate(combinedDate) : null,
                repeatDaysOrder: [],
                originStop: copyAndResetRouteStop(data.origin, "origin", orderId, "ord_o"),
                intermediateStopsOrder: data.intermediateStops.map((s: any, i: number) => copyAndResetRouteStop(s, "intermediate", orderId, "ord_i", i)),
                destinationStop: copyAndResetRouteStop(data.destination, "destination", orderId, "ord_d"),
            };
            const orderRef = doc(db, "orders", orderId);
            batch.set(orderRef, orderForFirestore);
            ordersCreatedCount = 1;
            if(combinedDate) createdOrdersForNotification.push({id: orderId, date: combinedDate});
        }

        if (ordersCreatedCount === 0) {
            toast({ title: "Nenhum Pedido Criado", description: "Nenhuma data correspondente à recorrência foi encontrada no mês atual.", variant: "warning" });
        } else {
            await batch.commit();

            // Send Notification
            const firstOrder = createdOrdersForNotification[0];
            const dateInfo = firstOrder?.date ? ` para ${format(firstOrder.date, 'dd/MM/yyyy')}` : '';
            const notificationTitle = ordersCreatedCount > 1 ? `${ordersCreatedCount} Novas Rotas Atribuídas` : "Nova Rota Atribuída";
            const notificationBody = `Cliente: ${selectedClient.companyName}${dateInfo}. Rota: ${data.name || 'Customizada'}`;

            await sendNotification(
                selectedDriver.id,
                notificationTitle,
                notificationBody,
                "info",
                { eventType: "newRouteAssigned", routeId: firstOrder?.id || '' }
            );

            toast({ title: `${ordersCreatedCount} Ordem(ns) de Serviço Criada(s)`, description: `Pedido(s) para ${selectedClient.companyName} foi/foram agendado(s).` });
            resetFormState();
            router.push("/orders");
        }
    } catch (error) {
        toast({ title: "Erro ao Salvar Pedido", variant: "destructive" });
    } finally {
        setIsProcessingOrder(false);
    }
  };
  
  const handleBoxTypeChange = (index: number, type: string) => {
    const boxInfo = boxTypes[type as keyof typeof boxTypes];
    if (boxInfo) {
      const currentWeight = getValues(`boxes.${index}.weight`) || 1;
      const newPrice = boxInfo.basePrice + Math.max(0, currentWeight - 1) * boxInfo.weightFactor;
      setValue(`boxes.${index}.price`, parseFloat(newPrice.toFixed(2)));
    }
  };
  
  const handleWeightChange = (index: number, weight: number) => {
    const boxType = getValues(`boxes.${index}.type`);
    const boxInfo = boxTypes[boxType as keyof typeof boxTypes];
    if (boxInfo) {
      const newPrice = boxInfo.basePrice + Math.max(0, weight - 1) * boxInfo.weightFactor;
      setValue(`boxes.${index}.price`, parseFloat(newPrice.toFixed(2)));
    }
  };


  if (isLoading) {
    return <div className="flex items-center justify-center h-40"><Icons.loader className="h-8 w-8 animate-spin text-primary" /><p className="ml-3 text-muted-foreground">Carregando dados...</p></div>;
  }
  
  const mapDisplay = (
    <div className="w-full h-[400px] lg:h-full rounded-lg overflow-hidden border shadow-inner bg-muted">
      {loadError ? ( <div className="flex items-center justify-center h-full text-destructive">Erro ao carregar o mapa.</div> ) : 
       isMapScriptLoaded ? (
        <GoogleMap mapContainerStyle={mapContainerStyle} center={defaultMapCenter} zoom={10} options={mapOptions} onLoad={onMapLoad}>
          {directionsResponse && <DirectionsRenderer directions={directionsResponse} options={{ suppressMarkers: true, polylineOptions: { strokeColor: "#4285F4", strokeWeight: 6, strokeOpacity: 0.8 }}} />}
        </GoogleMap>
      ) : (
        <div className="flex items-center justify-center h-full"><Skeleton className="w-full h-full" /><div className="absolute flex flex-col items-center text-muted-foreground"><Icons.loader className="w-8 w-8 animate-spin mb-2" /><p>Carregando mapa...</p></div></div>
      )}
    </div>
  );

  return (
    <FormProvider {...formMethods}>
      <form onSubmit={handleSubmit(handleCreateOrder)} className="space-y-8">
        <div className="grid lg:grid-cols-[2fr_1fr] gap-x-8 gap-y-6">
          <div className="space-y-8">
            <Card>
                <CardHeader><CardTitle>1. Cliente e Motorista</CardTitle></CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="clientId">Cliente</Label>
                      <Controller name="clientId" control={control} render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value} disabled={clients.length === 0}>
                              <SelectTrigger id="clientId"><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                              <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName} ({c.cnpj})</SelectItem>)}</SelectContent>
                          </Select>
                      )} />
                      {formMethods.formState.errors.clientId && <p className="text-xs text-destructive mt-1">{formMethods.formState.errors.clientId.message}</p>}
                    </div>
                    <div>
                      <Label htmlFor="driverId">Motorista</Label>
                      <Controller name="driverId" control={control} render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value} disabled={drivers.length === 0}>
                              <SelectTrigger id="driverId"><SelectValue placeholder="Selecione um motorista" /></SelectTrigger>
                              <SelectContent>{drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                          </Select>
                      )} />
                      {formMethods.formState.errors.driverId && <p className="text-xs text-destructive mt-1">{formMethods.formState.errors.driverId.message}</p>}
                    </div>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader><CardTitle>2. Agendamento</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        <div className="space-y-4">
                            <div>
                              <Label htmlFor="serviceDate">Data Específica do Serviço</Label>
                              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                                <PopoverTrigger asChild>
                                  <Button id="serviceDate" variant={"outline"} className={cn("w-full justify-start text-left font-normal", !watchedFormValues.serviceDate && "text-muted-foreground")} disabled={isProcessingOrder || (watchedFormValues.repeatDays && watchedFormValues.repeatDays.length > 0)}>
                                    <Icons.calendar className="mr-2 h-4 w-4" />
                                    {watchedFormValues.serviceDate ? format(watchedFormValues.serviceDate, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                  <Controller name="serviceDate" control={control} render={({ field }) => (
                                    <Calendar mode="single" selected={field.value} onSelect={(date) => { field.onChange(date); setIsDatePickerOpen(false); }} locale={ptBR} />
                                  )} />
                                </PopoverContent>
                              </Popover>
                            </div>
                            <div>
                                <Label htmlFor="startTime">Horário de Início (Opcional)</Label>
                                <Input id="startTime" type="time" {...formMethods.register("startTime")} disabled={isProcessingOrder || (watchedFormValues.repeatDays && watchedFormValues.repeatDays.length > 0)} />
                            </div>
                        </div>
                        <div>
                          <Label className="mb-2 block">Repetir Semanalmente</Label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                            {weekDays.map(day => (
                                <Controller key={day.id} name="repeatDays" control={control}
                                    render={({ field }) => (
                                      <div className="flex items-center space-x-2">
                                        <Checkbox id={`repeat-${day.id}`}
                                          checked={field.value?.includes(day.id)}
                                          onCheckedChange={checked => {
                                            const newValue = checked ? [...(field.value || []), day.id] : field.value?.filter(v => v !== day.id);
                                            field.onChange(newValue);
                                            if(newValue && newValue.length > 0) {
                                                setValue('serviceDate', undefined);
                                                setValue('startTime', "");
                                            }
                                          }}
                                        />
                                        <Label htmlFor={`repeat-${day.id}`} className="font-normal text-sm">{day.label}</Label>
                                      </div>
                                    )}
                                />
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">Se selecionado, os pedidos serão agendados para os dias correspondentes no mês atual.</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>3. Definição da Rota do Pedido</CardTitle></CardHeader>
                <CardContent>
                    <CreateRouteForm
                        onCalculateRoute={handleCalculateRoute}
                        isSaving={isCalculating || isProcessingOrder}
                    />
                </CardContent>
            </Card>
            
            <Card>
              <CardHeader><CardTitle>4. Precificação</CardTitle></CardHeader>
              <CardContent>
                  <div className="flex items-center space-x-4">
                      <Label>Método de Precificação:</Label>
                      <Controller name="pricingMethod" control={control} render={({ field }) => (
                          <RadioGroup onValueChange={field.onChange} value={field.value} className="flex">
                            <div className="flex items-center space-x-2"><RadioGroupItem value="perRoute" id="perRoute" /><Label htmlFor="perRoute">Por Rota</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="perBox" id="perBox" /><Label htmlFor="perBox">Por Caixa</Label></div>
                          </RadioGroup>
                      )} />
                  </div>
                  <Separator className="my-4" />
                  {watchedFormValues.pricingMethod === 'perRoute' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <Label htmlFor="pricePerKm">Preço por KM (R$)</Label>
                            <Controller name="pricePerKm" control={control} render={({ field }) => <Input {...field} type="number" step="0.01" />} />
                          </div>
                           <div>
                              <Label htmlFor="tdeValue">TDE (R$)</Label>
                              <Controller name="tdeValue" control={control} render={({ field }) => <Input {...field} type="number" step="0.01" placeholder="Custo de espera" />} />
                           </div>
                          <div>
                              <Label htmlFor="averageFuelConsumption">Consumo Médio (km/L)</Label>
                              <Input id="averageFuelConsumption" type="number" step="0.1" value={averageFuelConsumption} onChange={(e) => setAverageFuelConsumption(parseFloat(e.target.value) || 0)} />
                            </div>
                            <div>
                              <Label htmlFor="fuelPrice">Preço Combustível (R$/L)</Label>
                              <Input id="fuelPrice" type="number" step="0.01" value={fuelPrice} disabled />
                            </div>
                        </div>
                    </div>
                  )}
                    {watchedFormValues.pricingMethod === 'perBox' && (
                      <div className="space-y-4">
                        {boxFields.map((field, index) => (
                          <div key={field.id} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_auto] items-end gap-2 p-2 border rounded-md">
                              <div>
                                <Label>Tipo de Caixa</Label>
                                <Controller name={`boxes.${index}.type`} control={control} render={({field: typeField}) => (
                                    <Select onValueChange={(value) => { typeField.onChange(value); handleBoxTypeChange(index, value); }} value={typeField.value}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>
                                            {Object.keys(boxTypes).map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )} />
                              </div>
                              <div>
                                  <Label>Quantidade</Label>
                                  <Controller name={`boxes.${index}.quantity`} control={control} render={({field}) => <Input {...field} type="number" min="1"/>} />
                              </div>
                              <div>
                                  <Label>Peso Médio (kg)</Label>
                                  <Controller name={`boxes.${index}.weight`} control={control} render={({field}) => <Input {...field} type="number" min="0" onChange={e => { field.onChange(e); handleWeightChange(index, parseFloat(e.target.value) || 0); }} />} />
                              </div>
                              <div>
                                  <Label>Preço/Un. (R$)</Label>
                                  <Controller name={`boxes.${index}.price`} control={control} render={({field}) => <Input {...field} type="number" step="0.01" />} />
                              </div>
                               <div>
                                   <Button type="button" variant="ghost" size="icon" onClick={() => removeBox(index)} className="text-destructive"><Icons.delete className="h-4 w-4"/></Button>
                               </div>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => appendBox({ type: 'Pequena', quantity: 1, weight: 1, price: boxTypes['Pequena'].basePrice })}>
                            <Icons.plusCircle className="mr-2 h-4 w-4"/> Adicionar Tipo de Caixa
                        </Button>
                      </div>
                    )}
              </CardContent>
              <CardFooter className="flex flex-col items-start gap-2 pt-4">
                  <h3 className="text-md font-semibold">Valor Total do Transporte:</h3>
                  <p className="text-3xl font-bold text-primary">R$ {totalValue.toFixed(2).replace(".", ",")}</p>
              </CardFooter>
            </Card>
          </div>
          <div className="lg:sticky lg:top-20 h-[500px] lg:h-auto">
              {mapDisplay}
          </div>
        </div>
        <div className="flex justify-end pt-6 gap-2">
          <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => router.back()}
              disabled={isProcessingOrder}
            >
            Cancelar e Voltar
          </Button>
          <Button
              type="submit"
              size="lg"
              disabled={ isProcessingOrder || !watchedFormValues.clientId || !watchedFormValues.driverId || (!watchedFormValues.serviceDate && (!watchedFormValues.repeatDays || watchedFormValues.repeatDays.length === 0)) }
            >
            {isProcessingOrder && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
            Criar Ordem de Serviço
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
