
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  format,
  parseISO,
  startOfDay,
  isSameDay,
  getDay,
  isValid,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import type { Order } from "@/types/order";
import type { DayOfWeek } from "@/types/route";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AddStopDialog } from "./AddStopDialog";


const executionStatusStyles: Record<string, { badge: string; calendar: string }> = {
  pending: {
    badge: "border-yellow-500 text-yellow-600 bg-yellow-500/10",
    calendar: "border-primary text-primary bg-primary/10",
  },
  "in-progress": {
    badge: "border-amber-500 text-amber-600 bg-amber-500/10",
    calendar: "border-amber-500 text-amber-600 bg-amber-500/10",
  },
  completed: {
    badge: "border-green-500 text-green-600 bg-green-500/10",
    calendar: "border-green-500 text-green-600 bg-green-500/10",
  },
};

const dayOfWeekToJsDay: Record<DayOfWeek, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 0,
};

function OrderCard({ order, onAddStop }: { order: Order, onAddStop: (order: Order) => void }) {
  return (
    <div className="p-2 mb-2 border rounded-lg bg-card transition-all">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold text-sm">Pedido Nº: {order.id.substring(0,8)}</p>
          <p className="text-xs text-muted-foreground">{order.selectedRouteName || 'Rota Customizada'}</p>
        </div>
        <Badge variant={
            order.executionStatus === 'completed' ? 'default' :
            order.executionStatus === 'in-progress' ? 'secondary' :
            'outline'
        }>
            {order.executionStatus === 'completed' ? 'Concluído' : order.executionStatus === 'in-progress' ? 'Em Progresso' : 'Pendente'}
        </Badge>
      </div>
      <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-dashed">
          <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
            <Link href={`/track/${order.id}`} target="_blank" rel="noopener noreferrer">
                Ver Rastreio
                <Icons.chevronDown className="h-3 w-3 -rotate-90"/>
            </Link>
          </Button>
          {order.executionStatus === 'in-progress' && (
            <Button variant="outline" size="sm" onClick={() => onAddStop(order)} className="h-auto px-2 py-1 text-xs">
              <Icons.plusCircle className="mr-1.5 h-3 w-3" />
              Adicionar Destino
            </Button>
          )}
      </div>
    </div>
  );
}


export function ClientCalendarView() {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isLoading, setIsLoading] = useState(true);

  // State for the dialog
  const [isAddStopDialogOpen, setIsAddStopDialogOpen] = useState(false);
  const [orderToModify, setOrderToModify] = useState<Order | null>(null);

  const fetchOrders = useCallback(() => {
    if (!currentUser?.clientId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    const ordersQuery = query(
      collection(db, "orders"),
      where("clientId", "==", currentUser.clientId),
      where("executionStatus", "in", ["pending", "in-progress", "completed"]),
    );

    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const ordersData = snapshot.docs
          .map((doc) => sanitizeOrderFromFirestore(doc, "ClientCalendarView"))
          .filter((o): o is Order => o !== null);
        setOrders(ordersData);
        setIsLoading(false);
      },
      () => {
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, [currentUser?.clientId]);

  useEffect(() => {
    const unsubscribe = fetchOrders();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [fetchOrders]);
  
  const getOrderEventsForDate = (date: Date | undefined): Order[] => {
    if (!date) return [];
    const targetDayStart = startOfDay(date);
    return orders.filter((order) => {
      if (order.serviceDate) {
        try {
          if (isSameDay(startOfDay(parseISO(order.serviceDate)), targetDayStart)) return true;
        } catch { /* ignore */ }
      }
      if (order.repeatDaysOrder && order.repeatDaysOrder.length > 0) {
        if (order.repeatDaysOrder.some(d => dayOfWeekToJsDay[d] === getDay(targetDayStart))) return true;
      }
      if (order.completedAt) {
        try {
          if (isSameDay(startOfDay(parseISO(order.completedAt)), targetDayStart)) return true;
        } catch { /* ignore */ }
      }
      return false;
    }).sort((a,b) => (a.createdAt > b.createdAt ? -1 : 1));
  };
  
  const calendarModifiers = orders.reduce((acc, order) => {
    const dates = [];
    if (order.serviceDate) {
        try {
            const serviceD = startOfDay(parseISO(order.serviceDate));
            if(isValid(serviceD)) dates.push(serviceD);
        } catch {}
    } else if (order.completedAt) {
         try {
            const completedD = startOfDay(parseISO(order.completedAt));
            if(isValid(completedD)) dates.push(completedD);
        } catch {}
    }
    
    if (dates.length > 0) {
      const styleInfo = executionStatusStyles[order.executionStatus] || executionStatusStyles.pending;
      const key = `order-${order.id}-${order.executionStatus}`;
      acc[key] = dates;
      acc[`${key}-class`] = `${styleInfo.calendar} rounded-md`;
    }
    return acc;
  }, {} as Record<string, any>);

  const calendarModifiersClassNames = Object.fromEntries(Object.entries(calendarModifiers).filter(([key]) => key.endsWith('-class')).map(([key, value]) => [key.replace('-class',''), value]));

  const eventsForSelectedDate = getOrderEventsForDate(selectedDate);
  
  const handleOpenAddStop = (order: Order) => {
    setOrderToModify(order);
    setIsAddStopDialogOpen(true);
  };
  
  const handleStopAdded = () => {
    setIsAddStopDialogOpen(false);
    setOrderToModify(null);
    fetchOrders(); // Refetch to update UI with new data
  };

  
  if (isLoading) {
      return (
          <div className="space-y-4">
              <Skeleton className="h-80 w-full" />
              <Skeleton className="h-24 w-full" />
          </div>
      )
  }

  return (
    <>
        <div className="space-y-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            className="rounded-md border p-0"
            locale={ptBR}
            modifiers={calendarModifiers}
            modifiersClassNames={calendarModifiersClassNames}
          />
          
          <div className="space-y-2">
             <h4 className="font-semibold text-md">
                {selectedDate ? `Pedidos para ${format(selectedDate, "dd/MM/yyyy")}` : "Selecione uma data"}
             </h4>
             <div className="min-h-[10rem] pr-1">
                 {eventsForSelectedDate.length > 0 ? (
                     eventsForSelectedDate.map(event => (
                        <OrderCard
                            key={event.id}
                            order={event}
                            onAddStop={handleOpenAddStop}
                        />
                     ))
                 ) : (
                    <div className="text-center text-muted-foreground text-sm pt-8">
                      Nenhum pedido para este dia.
                    </div>
                 )}
             </div>
          </div>
        </div>

        <AddStopDialog 
            order={orderToModify}
            isOpen={isAddStopDialogOpen}
            onOpenChange={setIsAddStopDialogOpen}
            onStopAdded={handleStopAdded}
        />
    </>
  );
}
