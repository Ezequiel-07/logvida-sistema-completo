
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";
import type { Task } from "@/types/task";
import { toISOString } from "@/lib/utils";

const taskStatusConfig: Record<Task['status'], { label: string; badge: "default" | "secondary" | "destructive" | "outline"; icon: keyof typeof Icons, iconColor: string }> = {
  pending: { label: "Pendente", badge: "outline", icon: "clock", iconColor: "text-amber-500" },
  'in-progress': { label: "Em Progresso", badge: "secondary", icon: "loader", iconColor: "text-blue-500" },
  completed: { label: "Concluído", badge: "default", icon: "checkCircle", iconColor: "text-green-500" },
  cancelled: { label: "Cancelado", badge: "destructive", icon: "xCircle", iconColor: "text-destructive" },
};


export function TasksDashboardCard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingTasks, setUpdatingTasks] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIsLoading(true);
    const tasksQuery = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
      const loadedTasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: toISOString(doc.data().createdAt)!,
        updatedAt: toISOString(doc.data().updatedAt),
        dueDate: toISOString(doc.data().dueDate),
      } as Task));
      setTasks(loadedTasks);
      setIsLoading(false);
    }, (error) => {
      console.error("Failed to fetch tasks for dashboard:", error);
      toast({ title: "Erro ao carregar tarefas do painel", variant: "destructive"});
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const toggleTask = async (taskId: string, currentStatus: Task['status']) => {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    setUpdatingTasks(prev => new Set(prev).add(taskId));
    try {
        const taskRef = doc(db, "tasks", taskId);
        await updateDoc(taskRef, { status: newStatus });
    } catch (error) {
        toast({ title: "Erro ao atualizar tarefa", variant: "destructive" });
    } finally {
        setUpdatingTasks(prev => {
            const newSet = new Set(prev);
            newSet.delete(taskId);
            return newSet;
        });
    }
  };
  
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  const getDueDateLabel = (dueDateStr: string | null | undefined): { label: string; isOverdue: boolean } => {
    if (!dueDateStr) return { label: 'Sem prazo', isOverdue: false };
    const dueDate = new Date(dueDateStr);
    const now = new Date();
    const isOverdue = isPast(dueDate) && !isToday(dueDate);
    return {
        label: format(dueDate, "dd 'de' MMM", { locale: ptBR }),
        isOverdue
    };
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <Icons.listChecks className="h-6 w-6 text-primary"/>
            Tarefas
        </CardTitle>
        <CardDescription>
          Seu checklist de atividades para hoje e próximos dias.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 max-h-72 overflow-y-auto pr-2">
        {isLoading ? (
            <div className="flex items-center justify-center h-24">
                <Icons.loader className="animate-spin text-primary" />
            </div>
        ) : sortedTasks.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground pt-8">Nenhuma tarefa encontrada.</p>
        ) : (
            sortedTasks.map((task) => {
              const config = taskStatusConfig[task.status];
              const isCompleted = task.status === "completed";
              const isUpdating = updatingTasks.has(task.id);
              const { label: dueDateLabel, isOverdue } = getDueDateLabel(task.dueDate);
              const Icon = isUpdating ? Icons.loader : Icons[config.icon];

              return (
                <div
                  key={task.id}
                  className="flex items-start gap-3 p-2 rounded-md transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    id={`task-${task.id}`}
                    checked={isCompleted}
                    onCheckedChange={() => toggleTask(task.id, task.status)}
                    className="mt-1"
                    disabled={isUpdating}
                  />
                  <div className="flex-grow">
                    <label
                      htmlFor={`task-${task.id}`}
                      className={cn(
                        "font-medium cursor-pointer",
                        isCompleted && "text-muted-foreground line-through",
                      )}
                    >
                      {task.title}
                    </label>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Icon className={cn("h-3.5 w-3.5", config.iconColor, isUpdating && 'animate-spin')} />
                        <span className={cn(isOverdue && task.status !== 'completed' && 'text-destructive font-semibold')}>{config.label}</span>
                        <span className="text-gray-400 dark:text-gray-600">•</span>
                        <span>{dueDateLabel}</span>
                    </div>
                  </div>
                </div>
              );
            })
        )}
      </CardContent>
      <CardFooter>
        <Button asChild variant="ghost" className="w-full text-primary text-sm">
          <Link href="/tasks">
            <Icons.plusCircle className="mr-2 h-4 w-4" />
            Gerenciar Todas as Tarefas
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
