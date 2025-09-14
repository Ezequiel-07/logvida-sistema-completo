
"use client";

import React, { useMemo } from 'react';
import { eachDayOfInterval, format, getDay, isSameDay, parseISO, setHours, setMinutes, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Order } from '@/types/order';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface WeekViewProps {
  weekStart: Date;
  orders: Order[];
}

const dayOfWeekToJsDay: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const executionStatusColors: Record<string, string> = {
  pending: 'bg-blue-500/80 border-blue-700',
  'in-progress': 'bg-amber-500/80 border-amber-700',
  completed: 'bg-green-500/80 border-green-700',
  cancelled: 'bg-red-500/80 border-red-700',
};

const hours = Array.from({ length: 24 }, (_, i) => i);

const getOrderTimeInfo = (order: Order): { start: number; end: number } => {
  let startDate: Date;
  try {
    startDate = parseISO(order.startedAt || order.serviceDate || order.createdAt);
    if (!isValid(startDate)) startDate = new Date();
  } catch {
    startDate = new Date();
  }

  const startHour = startDate.getHours() + startDate.getMinutes() / 60;

  let durationMinutes = 120; // Default 2 hours
  if (order.totalDurationMinutes && order.totalDurationMinutes > 0) {
    durationMinutes = order.totalDurationMinutes;
  }
  
  if (order.executionStatus === 'completed' && order.startedAt && order.completedAt) {
      try {
          const start = parseISO(order.startedAt);
          const end = parseISO(order.completedAt);
          durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
      } catch {}
  }

  const endHour = startHour + durationMinutes / 60;
  return { start: startHour, end: endHour };
};


export function WeekView({ weekStart, orders }: WeekViewProps) {
  const router = useRouter();

  const weekDays = useMemo(() => {
    return eachDayOfInterval({ start: weekStart, end: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000) });
  }, [weekStart]);

  const getEventsForDay = (day: Date) => {
    const targetDayStart = day;

    return orders.filter(order => {
        if (order.executionStatus === 'cancelled') return false;

        // Check for specific service date match
        if (order.serviceDate) {
            try {
                if (isSameDay(parseISO(order.serviceDate), targetDayStart)) {
                    return true;
                }
            } catch {}
        }
        
        // For recurring orders, check if the day of the week matches AND there's no specific serviceDate
        // This prevents recurring orders from showing on every matching day of the week, even in the past/future
        if (!order.serviceDate && order.repeatDaysOrder && order.repeatDaysOrder.length > 0) {
            const targetJsDay = getDay(targetDayStart);
            if (order.repeatDaysOrder.some(d => dayOfWeekToJsDay[d] === targetJsDay)) {
                return true; 
            }
        }
        
        // Include orders that started or completed on this day but didn't have a service date
        if (!order.serviceDate && !order.repeatDaysOrder?.length) {
            const started = order.startedAt && isSameDay(parseISO(order.startedAt), targetDayStart);
            const completed = order.completedAt && isSameDay(parseISO(order.completedAt), targetDayStart);
            if(started || completed) return true;
        }

        return false;
    });
  };
  
   const calculateEventStyle = (
    order: Order,
    day: Date,
    overlappingEvents: { order: Order; cols: number; col: number }[]
  ): React.CSSProperties => {
    const { start } = getOrderTimeInfo(order);

    let durationMinutes = 120; // Default duration
    if (order.executionStatus === 'completed' && order.startedAt && order.completedAt) {
      try {
        const startDate = parseISO(order.startedAt);
        const endDate = parseISO(order.completedAt);
        durationMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
      } catch {}
    } else if (order.totalDurationMinutes) {
      durationMinutes = order.totalDurationMinutes;
    }

    const top = (start / 24) * 100;
    const height = (durationMinutes / (24 * 60)) * 100;
    
    const overlapInfo = overlappingEvents.find(e => e.order.id === order.id);
    const width = 100 / (overlapInfo?.cols || 1);
    const left = (overlapInfo?.col || 0) * width;

    return {
      top: `${top}%`,
      height: `${height}%`,
      minHeight: '20px',
      width: `${width}%`,
      left: `${left}%`,
    };
  };

  const handleEventClick = (orderId: string) => {
    router.push(`/routes/${orderId}/timeline`);
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col print:h-auto print:overflow-visible">
        <div className="grid grid-cols-[4rem_repeat(7,1fr)] sticky top-0 bg-background z-10 border-b print:static">
          <div className="p-2 border-r">&nbsp;</div>
          {weekDays.map(day => (
            <div key={day.toISOString()} className={cn("p-2 text-center border-r last:border-r-0", isSameDay(day, new Date()) && "bg-primary/10")}>
              <p className="text-xs font-semibold uppercase text-muted-foreground">{format(day, 'EEE', { locale: ptBR })}</p>
              <p className="text-xl font-bold">{format(day, 'd')}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[4rem_repeat(7,1fr)] flex-grow overflow-auto print:overflow-visible">
          <div className="border-r relative print:hidden">
            {hours.map(hour => (
              <div key={hour} className="h-16 relative flex justify-end pr-2 pt-1 text-xs text-muted-foreground border-b last:border-b-0">
                <span className="absolute -top-2 right-2">{hour.toString().padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>

          {weekDays.map(day => {
            const dayEvents = getEventsForDay(day);

            const sortedEvents = dayEvents.map(order => ({ order, time: getOrderTimeInfo(order) })).sort((a, b) => a.time.start - b.time.start);
            
            const eventLayouts: { order: Order; cols: number; col: number }[] = [];
            
            for (let i = 0; i < sortedEvents.length; i++) {
                let col = 0;
                while (true) {
                    let hasOverlap = false;
                    for (const placedEvent of eventLayouts) {
                        const isSameCol = placedEvent.col === col;
                        const eventA = sortedEvents[i].time;
                        const eventB = getOrderTimeInfo(placedEvent.order);
                        const overlapsInTime = eventA.start < eventB.end && eventA.end > eventB.start;

                        if (isSameCol && overlapsInTime) {
                            hasOverlap = true;
                            break;
                        }
                    }
                    if (!hasOverlap) break;
                    col++;
                }
                eventLayouts.push({ order: sortedEvents[i].order, cols: 1, col });
            }

            for(const eventLayout of eventLayouts) {
                const overlapping = eventLayouts.filter(otherLayout => {
                   const timeA = getOrderTimeInfo(eventLayout.order);
                   const timeB = getOrderTimeInfo(otherLayout.order);
                   return otherLayout.order.id !== eventLayout.order.id && timeA.start < timeB.end && timeA.end > timeB.start;
                });
                eventLayout.cols = overlapping.length + 1;
            }

            return (
              <div key={day.toISOString()} className="border-r last:border-r-0 relative min-h-[calc(24*4rem)] print:min-h-0 print:h-auto">
                {hours.map(hour => <div key={hour} className="h-16 border-b last:border-b-0" />)}

                {eventLayouts.map(({ order }, index) => {
                  const style = calculateEventStyle(order, day, eventLayouts);
                  return (
                    <Tooltip key={order.id}>
                        <TooltipTrigger asChild>
                            <div
                              onClick={() => handleEventClick(order.id)}
                              className={cn(
                                'absolute p-1.5 rounded-md text-white text-[10px] overflow-hidden cursor-pointer hover:opacity-100 opacity-90 transition-all duration-200 shadow-md',
                                executionStatusColors[order.executionStatus] || 'bg-gray-400 border-gray-600'
                              )}
                              style={{ ...style, zIndex: index + 10 }}
                            >
                              <p className="font-bold truncate">{order.clientCompanyName}</p>
                              <p className="truncate">{order.selectedRouteName || 'Rota customizada'}</p>
                              <p className="truncate text-white/80">{order.assignedDriverName}</p>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-background border-primary text-foreground" side="right">
                           <p className="font-bold">{order.clientCompanyName}</p>
                           <p>Rota: {order.selectedRouteName}</p>
                           <p>Motorista: {order.assignedDriverName}</p>
                           <p>Status: {order.executionStatus}</p>
                           <p>Início: {order.startedAt ? format(parseISO(order.startedAt), 'HH:mm') : (order.serviceDate ? format(parseISO(order.serviceDate), 'HH:mm') : 'Pendente')}</p>
                           <p>Fim: {order.completedAt ? format(parseISO(order.completedAt), 'HH:mm') : 'Em andamento'}</p>
                        </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
