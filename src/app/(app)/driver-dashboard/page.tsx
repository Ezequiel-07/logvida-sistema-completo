
"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icons } from "@/components/icons";
import type { Order } from "@/types/order";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  startOfDay,
  endOfDay,
  isWithinInterval,
  startOfMonth,
  endOfMonth,
  parseISO,
  isValid,
} from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { DriverCalendarView } from "./components/DriverCalendarView";
import { useState, useEffect, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";

interface Stat {
  title: string;
  value: string;
  icon: keyof typeof Icons;
}

export default function DriverDashboardPage() {
    const { currentUser } = useAuth();
    const [allOrders, setAllOrders] = useState<Order[]>([]);
    const [stats, setStats] = useState<Stat[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    const calculateStats = useCallback((orders: Order[], fuelPrice: number, fuelConsumption: number) => {
        const today = new Date();
        const todayInterval = { start: startOfDay(today), end: endOfDay(today) };
        const monthInterval = { start: startOfMonth(today), end: endOfMonth(today) };

        const completedOrders = orders.filter(
          (o) => o.executionStatus === "completed",
        );

        const calculatePeriodStats = (interval: { start: Date; end: Date }) => {
          const filtered = completedOrders.filter((o) => {
            const completionDateString = o.destinationStop?.checkedAt || o.completedAt;
            if (!completionDateString) return false;
            try {
              const completionDate = parseISO(completionDateString);
              return (
                isValid(completionDate) &&
                isWithinInterval(completionDate, interval)
              );
            } catch {
              return false;
            }
          });
          const distance = filtered.reduce((acc, o) => acc + (o.routeDistanceKm || 0), 0);
          const duration = filtered.reduce((acc, o) => acc + (o.totalDurationMinutes || 0), 0);
          return { distance, duration };
        };

        const todayStats = calculatePeriodStats(todayInterval);
        const monthStats = calculatePeriodStats(monthInterval);
        
        const totalHoursMonth = Math.floor(monthStats.duration / 60);
        const totalMinutesMonth = monthStats.duration % 60;
        const formattedMonthDuration = `${totalHoursMonth}h${totalMinutesMonth > 0 ? ` ${totalMinutesMonth}m` : ''}`.trim();
        
        const fuelLitersMonth = monthStats.distance > 0 && fuelConsumption > 0 ? monthStats.distance / fuelConsumption : 0;
        const fuelCostMonth = fuelLitersMonth * fuelPrice;

        return [
            { title: "Distância (Hoje / Mês)", value: `${todayStats.distance.toFixed(1)} km / ${monthStats.distance.toFixed(1)} km`, icon: "navigation" as const },
            { title: "Tempo em Rota (Hoje / Mês)", value: `${Math.floor(todayStats.duration / 60)}h ${todayStats.duration % 60}m / ${formattedMonthDuration}`, icon: "clock" as const },
            { title: "Combustível (Mês)", value: `${fuelLitersMonth.toFixed(1)} L`, icon: "gas-pump" as const },
            { title: "Custo Combustível (Mês)", value: `R$ ${fuelCostMonth.toFixed(2)}`, icon: "dollarSign" as const },
        ];
    }, []);
    
    const calculateOrderStats = useCallback((order: Order, fuelPrice: number, fuelConsumption: number): Stat[] => {
        const distance = order.routeDistanceKm || 0;
        const duration = order.totalDurationMinutes || 0;
        const fuelLiters = distance > 0 && fuelConsumption > 0 ? distance / fuelConsumption : 0;
        const fuelCost = fuelLiters * fuelPrice;

        const formattedDuration = `${Math.floor(duration / 60)}h ${duration % 60}m`;

        return [
            { title: "Distância da Rota", value: `${distance.toFixed(1)} km`, icon: "navigation" as const },
            { title: "Duração Estimada", value: formattedDuration, icon: "clock" as const },
            { title: "Combustível Estimado", value: `${fuelLiters.toFixed(1)} L`, icon: "gas-pump" as const },
            { title: "Custo Estimado", value: `R$ ${fuelCost.toFixed(2)}`, icon: "dollarSign" as const },
        ];
    }, []);

    const handleSelectOrder = useCallback((order: Order | null) => {
        setSelectedOrder(order);
    }, []);

    useEffect(() => {
        if (!currentUser?.id) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const settingsRef = doc(db, "companySettings", "main");
        const ordersQuery = query(
            collection(db, "orders"),
            where("assignedDriverId", "==", currentUser.id),
        );

        let settingsData = { fuelPrice: 6.2 };
        let vehicleData = { fuelConsumption: 10 };

        const settingsPromise = getDoc(settingsRef).then(snap => {
            if (snap.exists()) settingsData.fuelPrice = snap.data().fuelPrice || 6.2;
            if (currentUser.vehicle?.costs.fuelConsumption) {
                vehicleData.fuelConsumption = currentUser.vehicle.costs.fuelConsumption;
            }
        });

        const unsubscribe = onSnapshot(ordersQuery, async (ordersSnap) => {
            await settingsPromise; // Ensure settings are loaded before calculating stats
            
            const fetchedOrders = ordersSnap.docs
                .map((doc) => sanitizeOrderFromFirestore(doc, "DriverDashboard_Stats"))
                .filter(Boolean) as Order[];
            
            setAllOrders(fetchedOrders);
            setIsLoading(false);
            
            // This will be re-run by the next effect when selectedOrder changes.
        }, (error) => {
            toast({ title: "Erro ao Carregar Dados", variant: "destructive" });
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser?.id, currentUser?.vehicle]);
    
    useEffect(() => {
      if (!currentUser || isLoading) return;

       const settingsPromise = getDoc(doc(db, "companySettings", "main")).then(snap => ({
            fuelPrice: snap.exists() ? snap.data().fuelPrice || 6.2 : 6.2,
            fuelConsumption: currentUser.vehicle?.costs.fuelConsumption || 10,
        }));
        
        settingsPromise.then(({ fuelPrice, fuelConsumption }) => {
            if (selectedOrder) {
                const updatedSelectedOrder = allOrders.find(o => o.id === selectedOrder.id);
                if (updatedSelectedOrder) {
                    setStats(calculateOrderStats(updatedSelectedOrder, fuelPrice, fuelConsumption));
                } else {
                    setSelectedOrder(null); // Order disappeared, revert
                    setStats(calculateStats(allOrders, fuelPrice, fuelConsumption));
                }
            } else {
                setStats(calculateStats(allOrders, fuelPrice, fuelConsumption));
            }
        });

    }, [allOrders, selectedOrder, currentUser, isLoading, calculateOrderStats, calculateStats]);


  if (isLoading) {
    return (
        <div className="flex items-center justify-center h-screen">
          <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold">Bem vindo, {currentUser?.name || "Motorista"}!</h1>
        <p className="text-muted-foreground">
          {selectedOrder ? `Detalhes para o pedido Nº ${selectedOrder.id.substring(0,8)}` : 'Aqui está um resumo de sua atividade e seus próximos pedidos.'}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = Icons[stat.icon] || Icons.info;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stat.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DriverCalendarView
        allOrders={allOrders}
        isLoading={isLoading}
        onOrderSelect={handleSelectOrder}
        selectedOrder={selectedOrder}
      />
    </div>
  );
}
