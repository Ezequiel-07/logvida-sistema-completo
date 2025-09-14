
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { Order } from "@/types/order";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { toast } from "@/hooks/use-toast";
import { sanitizeOrderFromFirestore } from "@/lib/order-utils";
import { WeekView } from "./components/WeekView";
import { MonthlyCalendarView } from "./components/MonthlyCalendarView";

export default function CalendarPage() {
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDateForWeek, setCurrentDateForWeek] = useState(new Date());

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const ordersCollectionRef = collection(db, "orders");
      const q = query(ordersCollectionRef, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const ordersData = querySnapshot.docs
        .map((doc) => sanitizeOrderFromFirestore(doc, "CalendarPage"))
        .filter((o): o is Order => o !== null);
      setAllOrders(ordersData);
    } catch (error: unknown) {
      toast({
        title: "Erro ao Carregar Calendário",
        description:
          "Não foi possível buscar os dados das Ordens de Serviço.",
        variant: "destructive",
      });
      setAllOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const weekStart = startOfWeek(currentDateForWeek, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDateForWeek, { weekStartsOn: 0 });

  const weekLabel = useMemo(() => {
    const startMonth = format(weekStart, "MMMM", { locale: ptBR });
    const endMonth = format(weekEnd, "MMMM", { locale: ptBR });
    if (startMonth === endMonth) {
      return `${format(weekStart, "d")} - ${format(
        weekEnd,
        "d 'de' MMMM 'de' yyyy",
        { locale: ptBR },
      )}`;
    }
    return `${format(weekStart, "d 'de' MMMM", {
      locale: ptBR,
    })} - ${format(weekEnd, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
  }, [weekStart, weekEnd]);
  
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full max-w-7xl mx-auto py-8 px-4 md:px-6 lg:px-8 space-y-8 printable-area">
      <Card className="shadow-xl print:shadow-none print:border-none">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary">
            Calendário Mensal
          </CardTitle>
          <CardDescription>
            Visualize as ordens de serviço por dia e agende novas rotas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-[40vh]">
              <Icons.loader className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : (
            <MonthlyCalendarView allOrders={allOrders} />
          )}
        </CardContent>
      </Card>
      
      <Card className="shadow-xl print:shadow-none print:border-none">
        <CardHeader className="print:p-2">
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-3xl font-bold text-primary print:text-xl">
                  Agenda Semanal
                </CardTitle>
                <CardDescription className="print:hidden">
                  Visualize a programação de Ordens de Serviço da semana.
                </CardDescription>
              </div>
               <div className="flex items-center gap-2 print:hidden">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentDateForWeek(subWeeks(currentDateForWeek, 1))}
                  >
                    <Icons.chevronDown className="h-4 w-4 rotate-90" />
                    Anterior
                  </Button>
                  <h2 className="text-lg font-semibold text-center w-64 whitespace-nowrap">
                    {weekLabel}
                  </h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentDateForWeek(addWeeks(currentDateForWeek, 1))}
                  >
                    Próxima
                    <Icons.chevronDown className="h-4 w-4 -rotate-90" />
                  </Button>
                   <Button
                    variant="outline"
                    onClick={handlePrint}
                    className="ml-4"
                  >
                    <Icons.printer className="mr-2 h-4 w-4" /> Imprimir
                  </Button>
               </div>
           </div>
        </CardHeader>
        <CardContent className="p-0 md:p-2 lg:p-4 overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-[60vh]">
              <Icons.loader className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : (
            <div className="min-w-[800px] lg:min-w-full">
                <WeekView
                weekStart={weekStart}
                orders={allOrders}
                />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
