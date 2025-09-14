
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format, isSameDay, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Order } from "@/types/order";
import type { DayOfWeek } from "@/types/route";

import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const executionStatusStyles: Record<string, { badge: string; calendar: string }> = {
  "in-progress": {
    badge: "border-amber-500 text-amber-600 bg-amber-500/10",
    calendar: "border-amber-500 text-amber-600 bg-amber-500/10",
  },
  pending: {
    badge: "border-blue-500 text-blue-600 bg-blue-500/10",
    calendar: "border-blue-500 text-blue-600 bg-blue-500/10",
  },
  completed: {
    badge: "border-green-500 text-green-600 bg-green-500/10",
    calendar: "border-green-500 text-green-600 bg-green-500/10",
  },
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

interface MonthlyCalendarViewProps {
  allOrders: Order[];
}

export function MonthlyCalendarView({ allOrders }: MonthlyCalendarViewProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const ordersForSelectedDay = useMemo(() => {
    if (!selectedDate || !allOrders) return [];
    return allOrders.filter((order) => {
      const serviceDate = order.serviceDate ? new Date(order.serviceDate) : null;
      return serviceDate && isSameDay(serviceDate, selectedDate);
    });
  }, [selectedDate, allOrders]);

  const calendarModifiers = useMemo(() => {
    const modifiers: Record<string, Date[]> = {
      'status-in-progress': [],
      'status-pending': [],
      'status-completed': [],
    };
    allOrders.forEach(order => {
      if (order.executionStatus === 'cancelled') return;
      const serviceDate = order.serviceDate ? new Date(order.serviceDate) : null;
      if (serviceDate) {
        const dateKey = `status-${order.executionStatus}`;
        if (modifiers[dateKey]) {
          modifiers[dateKey].push(startOfDay(serviceDate));
        }
      }
    });
    return modifiers;
  }, [allOrders]);

  const calendarModifiersClassNames = {
    'status-in-progress': cn("rounded-md", executionStatusStyles["in-progress"].calendar),
    'status-pending': cn("rounded-md", executionStatusStyles["pending"].calendar),
    'status-completed': cn("rounded-md", executionStatusStyles["completed"].calendar),
  };

  const handleCreateNewOrder = () => {
    const dateParam = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
    router.push(`/pricing?date=${dateParam}`);
  };

  return (
    <div className="grid md:grid-cols-[1.2fr_1fr] gap-8">
      <div>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          className="rounded-md border p-0 w-full"
          locale={ptBR}
          modifiers={calendarModifiers}
          modifiersClassNames={calendarModifiersClassNames}
        />
        <div className="mt-4 space-y-2 text-xs">
          <h4 className="font-semibold mb-2">Legenda de Status:</h4>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500/80 border border-blue-700"/>Pendente</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-700"/>Em Progresso</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500/80 border border-green-700"/>Concluído</div>
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-4">
          Ordens de Serviço para{" "}
          {selectedDate ? format(selectedDate, "dd/MM/yyyy") : "..."}
        </h3>
        <Button onClick={handleCreateNewOrder} className="w-full mb-4">
          <Icons.plusCircle className="mr-2" />
          Agendar Nova Ordem de Serviço
        </Button>
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
          {ordersForSelectedDay.length > 0 ? (
            ordersForSelectedDay.map((order) => {
              const statusStyle = executionStatusStyles[order.executionStatus] || {};
              return (
              <div
                key={order.id}
                className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/routes/${order.id}/timeline`)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{order.clientCompanyName}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.selectedRouteName}
                    </p>
                  </div>
                  <Badge variant={"outline"} className={cn("capitalize", statusStyle.badge)}>
                    {order.executionStatus === 'in-progress' ? 'Em Progresso' : order.executionStatus === 'pending' ? 'Pendente' : order.executionStatus === 'completed' ? 'Concluído' : order.executionStatus}
                  </Badge>
                </div>
              </div>
            )})
          ) : (
            <p className="text-center text-muted-foreground pt-8">
              Nenhuma Ordem de Serviço para este dia.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
