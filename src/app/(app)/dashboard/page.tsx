
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icons, type IconName } from "@/components/icons";
import type { Order, RouteStop as OrderRouteStop } from "@/types/order";
import {
  isSameDay,
  parseISO,
  formatDistanceToNowStrict,
  format,
  startOfDay,
  getDay,
  addMonths,
  eachDayOfInterval,
  isValid,
  startOfMonth,
  endOfMonth,
  addDays,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { DayOfWeek } from "@/types/route";
import { useSharedGoogleMapsLoader } from "@/lib/googleMaps";
import {
  GoogleMap,
  DirectionsRenderer,
  MarkerF,
  InfoWindowF,
  Polyline,
} from "@react-google-maps/api";
import { useTheme } from "next-themes";
import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  onSnapshot,
  where,
  getDoc,
} from "firebase/firestore";
import { toast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";
import { nightMapStyle } from "@/lib/map-styles";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TasksDashboardCard } from "./components/TasksDashboardCard";

const orderExecutionStatusTranslations: Record<
  Order["executionStatus"],
  string
> = {
  pending: "Pendente",
  "in-progress": "Em Progresso",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const executionStatusStylesDashboard: Record<string, { calendar: string, badge: string }> = {
  'in-progress': { calendar: "border-amber-500 text-amber-600 bg-amber-500/10", badge: "bg-amber-500/80 border-amber-700" },
  pending: { calendar: "border-blue-500 text-blue-600 bg-blue-500/10", badge: "bg-blue-500/80 border-blue-700" },
  completed: { calendar: "border-green-500 text-green-600 bg-green-500/10", badge: "bg-green-500/80 border-green-700" },
};

const dayOfWeekToJsDay: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

interface DashboardStats {
  pedidosEmProgresso: { count: number; value: number; };
  pedidosConcluidosHoje: { count: number; value: number; };
  pedidosPendentes: { count: number; value: number; };
  faturamentoConcluido: {
    semana: number;
    mes: number;
    quilometragemMes: number;
  };
}

interface ActivityItem {
  id: string;
  description: string;
  time: string;
  icon: IconName;
  orderId?: string;
}

const isApiKeyMissingSettingDashboard =
  !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.includes("YOUR_GOOGLE_MAPS_API_KEY");

const dashboardMapContainerStyle = {
  width: "100%",
  height: "100%",
};

const defaultMapCenterTubarão = {
  lat: -28.4774,
  lng: -49.0079,
};

const isTodayHelper = (isoDateString?: string | null): boolean => {
  if (!isoDateString) return false;
  try {
    const date = parseISO(isoDateString);
    if (!isValid(date)) return false;
    return isSameDay(date, new Date());
  } catch (e) {
    console.error("Error parsing date for isTodayHelper:", e);
    return false;
  }
};

const formatRelativeTime = (isoDateString?: string | null): string => {
  if (!isoDateString) return "data inválida";
  try {
    const date = parseISO(isoDateString);
    if (!isValid(date)) return "data inválida";
    return formatDistanceToNowStrict(date, { addSuffix: true, locale: ptBR });
  } catch (e) {
    console.error("Error parsing date for formatRelativeTime:", e);
    return "data inválida";
  }
};

const getExecutionStatusIcon = (status: Order["executionStatus"]): IconName => {
  switch (status) {
    case "pending":
      return "clock";
    case "in-progress":
      return "truck";
    case "completed":
      return "checkCircle";
    case "cancelled":
      return "xCircle";
    default:
      return "info";
  }
};

const getStopLabel = (
  stop: OrderRouteStop,
  index: number,
  totalStops: number,
): string => {
  if (index === 0) return "O";
  if (index === totalStops - 1) return "D";
  return `P${index}`;
};

export default function DashboardPage() {
  const { isLoaded: isDashboardMapScriptLoaded, loadError: dashboardMapScriptLoadError, } = useSharedGoogleMapsLoader();
  const { currentUser } = useAuth();
  const { resolvedTheme } = useTheme();
  
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    pedidosEmProgresso: { count: 0, value: 0 },
    pedidosConcluidosHoje: { count: 0, value: 0 },
    pedidosPendentes: { count: 0, value: 0 },
    faturamentoConcluido: { semana: 0, mes: 0, quilometragemMes: 0 },
  });

  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);

  const [driverLocations, setDriverLocations] = useState<
    Map<string, { lat: number; lng: number; name: string; vehicle: string, profilePictureUrl: string | null; heading: number | null }>
  >(new Map());
  const [activeDriverMarker, setActiveDriverMarker] = useState<string | null>(null);

  const [calendarModifiers, setCalendarModifiers] = useState<Record<string, Date[]>>({});
  const [calendarModifiersClassNames, setCalendarModifiersClassNames] = useState<Record<string, string>>({});
  const [selectedDashboardCalendarDate, setSelectedDashboardCalendarDate] = useState<Date | undefined>(new Date());
  const [currentMonthForDashboardCalendar, setCurrentMonthForDashboardCalendar,] = useState(new Date());
  
  // New states for interactive map
  const [selectedOrderForMap, setSelectedOrderForMap] = useState<Order | null>(null);
  const [directionsForSelectedOrder, setDirectionsForSelectedOrder] = useState<google.maps.DirectionsResult | null>(null);

  const dashboardMapRef = useRef<google.maps.Map | null>(null);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInteractingRef = useRef(false);

  const [pendingQuotesCount, setPendingQuotesCount] = useState(0);

  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    const q = query(collection(db, "quotes"), where("status", "==", "pending"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        setPendingQuotesCount(querySnapshot.size);
    });
    return () => unsubscribe();
  }, [currentUser?.role]);


  const mapOptions = useMemo(
    () => ({
      disableDefaultUI: true,
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: "cooperative",
      styles: resolvedTheme === 'dark' ? nightMapStyle : [],
    }),
    [resolvedTheme],
  );

  const onDashboardMapLoad = useCallback((map: google.maps.Map) => {
    dashboardMapRef.current = map;
    map.panTo(defaultMapCenterTubarão);
    map.setZoom(13);
  }, []);

  const onDashboardMapUnmount = useCallback(() => {
    dashboardMapRef.current = null;
    if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
  }, []);
  
  const fetchDriverLocationsManually = useCallback(async (ordersToTrack: Order[]) => {
    const driverIds = [...new Set(ordersToTrack.map((o) => o.assignedDriverId).filter(Boolean))] as string[];
    if (driverIds.length === 0) return;

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
          heading: data.heading ?? null
        });
        changed = true;
      }
    }));
    
    if (changed) {
      setDriverLocations(newLocations);
    }
  }, [driverLocations]);

  const handleMapInteraction = useCallback(() => {
      isInteractingRef.current = true;
      const inProgressOrders = allOrders.filter(o => o.executionStatus === 'in-progress');
      fetchDriverLocationsManually(inProgressOrders);
      if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = setTimeout(() => {
          isInteractingRef.current = false;
      }, 15000);
  }, [fetchDriverLocationsManually, allOrders]);

  useEffect(() => {
    if (currentUser?.role !== "admin") {
      setIsLoadingData(false);
      return;
    }

    setIsLoadingData(true);
    const ordersCollectionRef = collection(db, "orders");
    const q = query(ordersCollectionRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const loadedOrders = querySnapshot.docs
          .map((doc) => sanitizeOrderFromFirestore(doc, "DashboardPage"))
          .filter((o): o is Order => o !== null);

        setAllOrders(loadedOrders);
        setIsLoadingData(false);
      }, (error) => {
        console.error("Erro ao carregar Ordens de Serviço:", error);
        toast({ title: "Erro de Conexão", description: "Não foi possível buscar os dados das Ordens de Serviço.", variant: "destructive" });
        setAllOrders([]);
        setIsLoadingData(false);
      },
    );
    return () => unsubscribe();
  }, [currentUser]);

  const inProgressOrders = useMemo(() => allOrders.filter((o) => o.executionStatus === "in-progress"), [allOrders]);
  
  const ordersForToday = useMemo(() => {
    return allOrders.filter(order => {
        const date = getDay(new Date());
        return isTodayHelper(order.serviceDate) ||
               isTodayHelper(order.startedAt) ||
               isTodayHelper(order.completedAt) ||
               (order.repeatDaysOrder || []).some(d => dayOfWeekToJsDay[d] === date);
    }).sort((a,b) => {
        const statusOrder = { 'in-progress': 1, 'pending': 2, 'completed': 3, 'cancelled': 4 };
        return statusOrder[a.executionStatus] - statusOrder[b.executionStatus];
    });
  }, [allOrders]);
  
  const handleOrderCardClick = (order: Order) => {
    setSelectedOrderForMap(order);
  };
  
  const resetMapView = () => {
    setSelectedOrderForMap(null);
    setDirectionsForSelectedOrder(null);
  };


  useEffect(() => {
    if (isLoadingData || currentUser?.role !== "admin") return;

    try {
      const today = new Date();
      const startOfCurrentMonth = startOfMonth(today);
      const endOfCurrentMonth = endOfMonth(today);
      const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 0 });
      const endOfCurrentWeek = endOfWeek(today, { weekStartsOn: 0 });

      const inProgressStats = allOrders.reduce((acc, o) => {
        if (o.executionStatus === 'in-progress') { acc.count++; acc.value += o.totalValue || 0; } return acc;
      }, { count: 0, value: 0 });

      const completedTodayStats = allOrders.reduce((acc, o) => {
        if (o.executionStatus === 'completed' && isTodayHelper(o.completedAt || o.destinationStop?.checkedAt)) { acc.count++; acc.value += o.totalValue || 0; } return acc;
      }, { count: 0, value: 0 });
      
      const pendingStats = allOrders.reduce((acc, o) => {
          if (o.executionStatus === 'pending') { acc.count++; acc.value += o.totalValue || 0; } return acc;
      }, { count: 0, value: 0 });

      const completedOrders = allOrders.filter(o => o.executionStatus === 'completed');
      const faturamentoSemana = completedOrders.reduce((sum, o) => {
        const completionDate = o.completedAt ? parseISO(o.completedAt) : null;
        if (completionDate && completionDate >= startOfCurrentWeek && completionDate <= endOfCurrentWeek) return sum + o.totalValue;
        return sum;
      }, 0);
      const faturamentoMes = completedOrders.reduce((sum, o) => {
        const completionDate = o.completedAt ? parseISO(o.completedAt) : null;
        if (completionDate && completionDate >= startOfCurrentMonth && completionDate <= endOfCurrentMonth) return sum + o.totalValue;
        return sum;
      }, 0);
      const quilometragemMes = completedOrders.reduce((sum, o) => {
        const completionDate = o.completedAt ? parseISO(o.completedAt) : null;
        if (completionDate && completionDate >= startOfCurrentMonth && completionDate <= endOfCurrentMonth) return sum + (o.routeDistanceKm || 0);
        return sum;
      }, 0);

      setStats({
          pedidosEmProgresso: inProgressStats,
          pedidosConcluidosHoje: completedTodayStats,
          pedidosPendentes: pendingStats,
          faturamentoConcluido: { semana: faturamentoSemana, mes: faturamentoMes, quilometragemMes: quilometragemMes },
      });

      const sortedByUpdate = [...allOrders].sort((a, b) => {
        try {
          const dateA = parseISO(a.updatedAt || a.createdAt);
          const dateB = parseISO(b.updatedAt || b.createdAt);
          if (!isValid(dateA) || !isValid(dateB)) return 0;
          return dateB.getTime() - dateA.getTime();
        } catch { return 0; }
      });

      setRecentActivities(sortedByUpdate.slice(0, 4).map((order) => ({
        id: `activity-${order.id}`,
        description: `Ordem Nº ${order.id.substring(0, 6)} (${order.clientCompanyName}) - ${orderExecutionStatusTranslations[order.executionStatus]}.`,
        time: formatRelativeTime(order.updatedAt || order.createdAt),
        icon: getExecutionStatusIcon(order.executionStatus),
        orderId: order.id,
      })));
    } catch (error) {
      console.error("Erro ao processar dados do painel:", error);
    }
  }, [allOrders, isLoadingData, currentUser]);

  useEffect(() => {
    if (inProgressOrders.length === 0) {
      setDriverLocations(new Map());
      return;
    }
    
    if (isInteractingRef.current) return;

    const driverIds = [...new Set(inProgressOrders.map((o) => o.assignedDriverId).filter(Boolean))] as string[];

    const unsubscribers = driverIds.map(driverId => {
      const driverDocRef = doc(db, "driverLocations", driverId);
      return onSnapshot(driverDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const driverOrder = inProgressOrders.find((o) => o.assignedDriverId === driverId);
          setDriverLocations((prev) => {
            const newMap = new Map(prev);
            newMap.set(driverId, {
              lat: data.latitude,
              lng: data.longitude,
              name: driverOrder?.assignedDriverName || "Desconhecido",
              vehicle: driverOrder?.assignedVehicleName || driverOrder?.assignedVehiclePlate || "N/A",
              profilePictureUrl: data.profilePictureUrl || null,
              heading: data.heading ?? null
            });
            return newMap;
          });
        }
      }, (error) => {
        console.error(`Erro ao ouvir localização do motorista ${driverId}:`, error);
      });
    });

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [inProgressOrders]);

  const getEventsForDay = useCallback((day: Date, orders: Order[]): Order['executionStatus'][] => {
    if (!orders) return [];
    const targetDayStart = startOfDay(day);
    return orders.filter(order => {
        if (order.executionStatus === 'cancelled') return false;
        if (order.serviceDate) {
            try { if (isSameDay(startOfDay(parseISO(order.serviceDate)), targetDayStart)) return true; } catch {}
        } else if (order.repeatDaysOrder && order.repeatDaysOrder.length > 0) {
            if (order.repeatDaysOrder.some(d => dayOfWeekToJsDay[d] === getDay(targetDayStart))) return true;
        }
        return false;
    }).map(o => o.executionStatus);
  }, []);

  useEffect(() => {
      const newModifiers: Record<string, Date[]> = {
        'status-in-progress': [], 'status-pending': [], 'status-completed': [],
      };
      const start = startOfMonth(currentMonthForDashboardCalendar);
      const end = addMonths(start, 1);
      const intervalToScan = eachDayOfInterval({ start, end });

      intervalToScan.forEach(day => {
          const statuses = getEventsForDay(day, allOrders);
          if (statuses.length > 0) {
              if (statuses.includes('in-progress')) newModifiers['status-in-progress'].push(day);
              else if (statuses.includes('pending')) newModifiers['status-pending'].push(day);
              else if (statuses.every(s => s === 'completed')) newModifiers['status-completed'].push(day);
          }
      });
      setCalendarModifiers(newModifiers);
      setCalendarModifiersClassNames({
        'status-in-progress': `${executionStatusStylesDashboard['in-progress'].calendar} rounded-md`,
        'status-pending': `${executionStatusStylesDashboard.pending.calendar} rounded-md`,
        'status-completed': `${executionStatusStylesDashboard.completed.calendar} rounded-md`,
      });
  }, [allOrders, currentMonthForDashboardCalendar, getEventsForDay]);


  useEffect(() => {
    if (!isDashboardMapScriptLoaded || !window.google || !selectedOrderForMap) {
      setDirectionsForSelectedOrder(null);
      return;
    }
  
    const directionsService = new window.google.maps.DirectionsService();
    const { originStop, destinationStop, intermediateStopsOrder } = selectedOrderForMap;
  
    if (!originStop?.address?.description || !destinationStop?.address?.description) return;
  
    directionsService.route({
      origin: originStop.address.description,
      destination: destinationStop.address.description,
      waypoints: (intermediateStopsOrder || []).map(s => ({ location: s.address.description, stopover: true })),
      travelMode: google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === "OK" && result) {
        setDirectionsForSelectedOrder(result);
        if (dashboardMapRef.current && result.routes[0]?.bounds) {
          dashboardMapRef.current.fitBounds(result.routes[0].bounds);
        }
      } else {
        toast({ title: "Erro de Roteamento", description: `Não foi possível traçar a rota para a OS selecionada.`, variant: "warning" });
      }
    });
  }, [isDashboardMapScriptLoaded, selectedOrderForMap]);


  const statItems = [
    {
      title: "Em Progresso", count: stats.pedidosEmProgresso.count, value: stats.pedidosEmProgresso.value,
      iconName: "truck" as IconName, color: "text-primary", href: "/admin/in-progress-routes",
    },
    {
      title: "Concluídos Hoje", count: stats.pedidosConcluidosHoje.count, value: stats.pedidosConcluidosHoje.value,
      iconName: "checkCircle" as IconName, color: "text-green-500", href: "/reports",
    },
    {
      title: "Pendentes", count: stats.pedidosPendentes.count, value: stats.pedidosPendentes.value,
      iconName: "clock" as IconName, color: "text-amber-600", href: "/orders?status=pending",
    },
    {
      title: "Faturamento (Concluídos)", value: stats.faturamentoConcluido.mes, valueWeek: stats.faturamentoConcluido.semana,
      subValue: `${stats.faturamentoConcluido.quilometragemMes.toLocaleString("pt-BR")} km (mês)`,
      iconName: "dollarSign" as IconName, color: "text-primary", href: "/billing",
    },
  ];

  const router = useRouter();
  const handleDashboardCalendarSelect = (date: Date | undefined) => {
    if (!date) { setSelectedDashboardCalendarDate(undefined); return; }
    setSelectedDashboardCalendarDate(date);
    router.push(`/calendar?date=${format(date, "yyyy-MM-dd")}`);
  };

  const getMarkerOptions = (stop: OrderRouteStop, index: number, totalStops: number): Omit<google.maps.MarkerOptions, 'position'> => {
      const isCompleted = stop.status === 'completed' || stop.status === 'skipped';
      const labelText = getStopLabel(stop, index, totalStops);

      return {
        label: { text: labelText, color: '#ffffff', fontSize: '10px', fontWeight: 'bold' },
        icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: isCompleted ? '#9CA3AF' : '#1E90FF', fillOpacity: 1.0, strokeColor: '#ffffff', strokeWeight: 1.5, scale: 7 },
        zIndex: 1
      };
  };

  if (isLoadingData) return <div className="flex flex-col gap-6 items-center justify-center h-full"><Icons.loader className="h-16 w-16 animate-spin text-primary" /><p className="text-xl text-muted-foreground">Carregando dados...</p></div>;
  if (currentUser?.role !== 'admin') return <div className="flex flex-col gap-6 items-center justify-center h-full p-4 text-center"><Icons.xCircle className="h-16 w-16 text-destructive" /><h1 className="text-2xl font-bold">Acesso Negado</h1><p className="text-muted-foreground">Esta página é restrita a administradores.</p></div>;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Painel do Administrador</h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <Button asChild size="sm" variant="outline" className="w-full sm:w-auto shrink-0">
            <Link href="/admin/quotes" className="relative">
                <Icons.calculator className="mr-2 h-4 w-4" /> Orçamentos
                {pendingQuotesCount > 0 && <Badge variant="destructive" className="ml-2">{pendingQuotesCount}</Badge>}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto shrink-0"><Link href="/orders"><Icons.clipboardList className="mr-2 h-4 w-4" /> Gerenciar Ordens</Link></Button>
          <Button asChild size="sm" className="w-full sm:w-auto shrink-0"><Link href="/pricing"><Icons.dollarSign className="mr-2 h-4 w-4" /> Nova Ordem de Serviço</Link></Button>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statItems.map((stat) => (
            <Link href={stat.href || "#"} key={stat.title} className="block hover:no-underline">
                 <Card className="shadow-lg hover:shadow-2xl transition-all duration-300 h-full flex flex-col min-h-[140px]">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                    <Icons.truck className={`h-5 w-5 ${stat.color}`} />
                  </CardHeader>
                  <CardContent className="flex-grow flex flex-col justify-center">
                    {stat.title === "Faturamento (Concluídos)" ? (
                        <div className="space-y-1">
                          <div className="text-2xl font-bold">R$ {stat.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                          <p className="text-xs text-muted-foreground"><span className="font-semibold">Semana:</span> R$ {stat.valueWeek?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          <p className="text-xs text-muted-foreground"><span className="font-semibold">KM (Mês):</span> {stat.subValue}</p>
                        </div>
                    ) : (
                        <><div className="text-2xl font-bold">{stat.count}</div><p className="text-xs text-muted-foreground">Valor Total: R$ {stat.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></>
                    )}
                  </CardContent>
                </Card>
            </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-lg min-w-0">
          <CardHeader>
            <CardTitle className="cursor-pointer hover:text-primary/80" onClick={resetMapView}>
                {selectedOrderForMap ? `Visualizando Rota: Nº ${selectedOrderForMap.id.substring(0, 8)}` : "Rotas em Andamento"}
            </CardTitle>
            <CardDescription>{selectedOrderForMap ? `Cliente: ${selectedOrderForMap.clientCompanyName}` : "Acompanhamento das rotas em andamento em tempo real."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="w-full h-[450px] lg:h-[600px] rounded-md overflow-hidden bg-muted mt-4">
              {isApiKeyMissingSettingDashboard ? ( <div className="flex flex-col items-center justify-center h-full text-center p-4"><Icons.mapPin className="w-10 h-10 text-destructive mb-2" /><p className="font-semibold text-destructive">Chave API Google Maps Ausente</p><p className="text-xs text-muted-foreground">Configure a chave API no .env.</p></div>
              ) : dashboardMapScriptLoadError ? ( <div className="flex flex-col items-center justify-center h-full text-center p-4"><Icons.warning className="w-10 h-10 text-destructive mb-2" /><p className="font-semibold text-destructive">Falha ao Carregar Mapa</p><p className="text-xs text-muted-foreground">Verifique sua chave API.</p></div>
              ) : isDashboardMapScriptLoaded ? (
                <GoogleMap mapContainerStyle={dashboardMapContainerStyle} center={defaultMapCenterTubarão} zoom={13} options={mapOptions} onLoad={onDashboardMapLoad} onUnmount={onDashboardMapUnmount} onZoomChanged={handleMapInteraction} onDragStart={handleMapInteraction}>
                   {selectedOrderForMap ? (
                      directionsForSelectedOrder && <DirectionsRenderer directions={directionsForSelectedOrder} options={{ suppressMarkers: true, polylineOptions: { strokeColor: "#87CEFA", strokeWeight: 8, strokeOpacity: 0.7 }}} />
                   ) : (
                      inProgressOrders.map((order) => {
                          const allStops = [order.originStop, ...(order.intermediateStopsOrder || []), order.destinationStop].filter(Boolean) as OrderRouteStop[];
                          return <React.Fragment key={order.id}>{allStops.map((stop, index) => {
                              if (!stop.address.latitude || !stop.address.longitude) return null;
                              return <MarkerF key={stop.id} position={{lat: stop.address.latitude, lng: stop.address.longitude}} options={getMarkerOptions(stop, index, allStops.length)} />
                          })}</React.Fragment>;
                      })
                   )}
                  {Array.from(driverLocations.entries()).map(([driverId, locationData]) => {
                    const isVisible = !selectedOrderForMap || selectedOrderForMap.assignedDriverId === driverId;
                    if (!isVisible) return null;
                    return <MarkerF key={driverId} position={{lat: locationData.lat, lng: locationData.lng}} onClick={() => setActiveDriverMarker(driverId)} icon={{ path: "M20,8h-3V4H3C1.9,4,1,4.9,1,6v11h2c0,1.7,1.3,3,3,3s3-1.3,3-3h6c0,1.7,1.3,3,3,3s3-1.3,3-3h2V13L20,8z M6,18.5C5.2,18.5,4.5,17.8,4.5,17s0.7-1.5,1.5-1.5s1.5,0.7,1.5,1.5S6.8,18.5,6,18.5z M18,18.5c-0.8,0-1.5-0.7-1.5-1.5s0.7-1.5,1.5-1.5s1.5,0.7,1.5,1.5S18.8,18.5,18,18.5z M17,11h2.5l1.8,2.5H17V11z", fillColor: resolvedTheme === 'dark' ? "hsl(var(--primary))" : "hsl(var(--primary))", fillOpacity: 1, strokeWeight: 1, strokeColor: resolvedTheme === 'dark' ? "#1a1a1a" : "#ffffff", rotation: (locationData.heading ?? 0) - 90, scale: 1.2, anchor: new window.google.maps.Point(12, 12),}} title={locationData.name} zIndex={100}>
                        {activeDriverMarker === driverId && (
                          <InfoWindowF onCloseClick={() => setActiveDriverMarker(null)}>
                            <div className="p-1 flex items-center gap-3 text-black">
                                <Avatar className="h-10 w-10"><AvatarImage src={locationData.profilePictureUrl ?? undefined} alt={locationData.name} /><AvatarFallback>{locationData.name.charAt(0)}</AvatarFallback></Avatar>
                                <div><h4 className="font-bold">{locationData.name}</h4><p className="text-sm">Veículo: {locationData.vehicle}</p></div>
                            </div>
                          </InfoWindowF>
                        )}
                      </MarkerF>
                  })}
                </GoogleMap>
              ) : ( <div className="flex flex-col items-center justify-center h-full"><Icons.loader className="w-8 h-8 animate-spin mb-2 text-primary" /><p className="text-sm text-muted-foreground">Carregando mapa...</p></div> )}
            </div>

            <Separator />

            <div>
              <h4 className="text-md font-semibold mb-3">Ordens de Serviço do Dia:</h4>
              {ordersForToday.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ordersForToday.map(order => {
                    const statusConfig = executionStatusStylesDashboard[order.executionStatus] || executionStatusStylesDashboard.pending;
                    return (
                        <Card key={order.id} onClick={() => handleOrderCardClick(order)} className={cn("cursor-pointer hover:shadow-lg transition-shadow", selectedOrderForMap?.id === order.id && "ring-2 ring-primary")}>
                            <CardContent className="p-3">
                                <div className="flex justify-between items-start">
                                    <p className="font-semibold text-sm pr-2">{order.clientCompanyName}</p>
                                    <Badge variant={"outline"} className={cn("text-xs capitalize shrink-0", statusConfig.badge)}>{orderExecutionStatusTranslations[order.executionStatus]}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">Rota: {order.selectedRouteName || 'Customizada'}</p>
                            </CardContent>
                        </Card>
                    )
                  })}
                </div>
              ) : ( <p className="text-muted-foreground text-center text-sm py-4">Nenhuma ordem de serviço agendada para hoje.</p> )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-lg">
            <CardHeader><CardTitle>Calendário de Ordens</CardTitle><CardDescription>Dias com ordens marcadas.</CardDescription></CardHeader>
            <CardContent className="flex justify-center">
              <Calendar mode="single" selected={selectedDashboardCalendarDate} onSelect={handleDashboardCalendarSelect} month={currentMonthForDashboardCalendar} onMonthChange={setCurrentMonthForDashboardCalendar} className="border p-0 text-sm" locale={ptBR} modifiers={calendarModifiers} modifiersClassNames={calendarModifiersClassNames} />
            </CardContent>
          </Card>
          
          <TasksDashboardCard />

          <Card className="shadow-lg">
            <CardHeader><CardTitle>Atividade Recente</CardTitle></CardHeader>
            <CardContent className="space-y-4 max-h-72 overflow-y-auto">
              {recentActivities.length > 0 ? ( recentActivities.map((activity) => {
                  const IconComponent = Icons[activity.icon];
                  return (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className="bg-accent/20 p-2 rounded-full"><IconComponent className="h-5 w-5 text-accent" /></div>
                      <div><p className="text-sm font-medium">{activity.description}</p><p className="text-xs text-muted-foreground">{activity.time}</p></div>
                    </div>
                  );
                })
              ) : ( <p className="text-muted-foreground text-center py-4">Nenhuma atividade recente.</p> )}
            </CardContent>
            <CardFooter><Button variant="link" className="w-full text-primary" asChild><Link href="/reports">Ver todos os relatórios</Link></Button></CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
