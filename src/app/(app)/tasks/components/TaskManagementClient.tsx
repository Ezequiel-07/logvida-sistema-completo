
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Icons } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import type { Task, ChecklistItem } from "@/types/task";
import type { User } from "@/types/user";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toISOString, formatDateDisplay, cn } from "@/lib/utils";
import { createTask, updateTask, deleteTask } from "@/server/actions/tasks";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const taskStatusConfig: Record<
  Task["status"],
  {
    label: string;
    badge: "default" | "secondary" | "destructive" | "outline";
    icon: keyof typeof Icons;
    color: string;
  }
> = {
  pending: { label: "A Fazer", badge: "outline", icon: "clock", color: "bg-blue-100/50 dark:bg-blue-900/20" },
  "in-progress": { label: "Em Progresso", badge: "secondary", icon: "loader", color: "bg-yellow-100/50 dark:bg-yellow-900/20" },
  completed: { label: "Concluído", badge: "default", icon: "checkCircle", color: "bg-green-100/50 dark:bg-green-900/20" },
  cancelled: { label: "Cancelado", badge: "destructive", icon: "xCircle", color: "bg-red-100/50 dark:bg-red-900/20" },
};

const checklistItemSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1, "O texto do item não pode ser vazio."),
  completed: z.boolean(),
});

const taskFormSchema = z.object({
  title: z.string().min(3, "O título é obrigatório."),
  checklist: z.array(checklistItemSchema).optional(),
  dueDate: z.string().optional(),
  status: z.enum(["pending", "in-progress", "completed", "cancelled"]),
  assigneeId: z.string().optional().nullable(),
});
type TaskFormData = z.infer<typeof taskFormSchema>;

interface TaskManagementClientProps {
  setOpenDialog: React.Dispatch<React.SetStateAction<(task: Task | null) => void>>;
}

export default function TaskManagementClient({ setOpenDialog }: TaskManagementClientProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isSavingTask, setIsSavingTask] = useState(false);

  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  
  const [newItemText, setNewItemText] = useState("");

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskFormSchema),
  });

  const { fields: checklistFields, append, remove } = useFieldArray({
    control: form.control,
    name: "checklist"
  });

  const handleAddNewChecklistItem = () => {
    if (newItemText.trim()) {
      append({ id: `new_${Date.now()}`, text: newItemText, completed: false });
      setNewItemText("");
    }
  };


  useEffect(() => {
    setIsLoading(true);

    const usersQuery = query(
      collection(db, "users"),
      where("role", "in", ["driver", "admin"]),
    );
    const usersUnsub = onSnapshot(usersQuery, (snapshot) => {
      const loadedUsers = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as User,
      );
      setUsers(loadedUsers);
    });

    const tasksQuery = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
    const tasksUnsub = onSnapshot(
      tasksQuery,
      (snapshot) => {
        const loadedTasks = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: toISOString(doc.data().createdAt)!,
          updatedAt: toISOString(doc.data().updatedAt),
          dueDate: toISOString(doc.data().dueDate),
        })) as Task[];
        setTasks(loadedTasks);
        setIsLoading(false);
      },
      (error) => {
        console.error("Failed to fetch tasks:", error);
        toast({ title: "Erro ao carregar tarefas", variant: "destructive" });
        setIsLoading(false);
      },
    );

    return () => {
      usersUnsub();
      tasksUnsub();
    };
  }, []);

  const openTaskDialog = useCallback(
    (task: Task | null = null) => {
      setEditingTask(task);
      if (task) {
        form.reset({
          title: task.title,
          checklist: task.checklist || [],
          dueDate: task.dueDate
            ? formatDateDisplay(task.dueDate, false).split("/").reverse().join("-")
            : "",
          status: task.status,
          assigneeId: task.assigneeId || null,
        });
      } else {
        form.reset({
          title: "",
          checklist: [],
          dueDate: "",
          status: "pending",
          assigneeId: null,
        });
      }
      setNewItemText("");
      setIsTaskDialogOpen(true);
    },
    [form],
  );

  useEffect(() => {
    setOpenDialog(() => openTaskDialog);
  }, [setOpenDialog, openTaskDialog]);

  const handleTaskFormSubmit = async (data: TaskFormData) => {
    setIsSavingTask(true);
    const assigneeName = data.assigneeId
      ? users.find((u) => u.id === data.assigneeId)?.name || null
      : null;

    const payload: Partial<Task> = {
      ...data,
      assigneeName,
      dueDate: data.dueDate ? data.dueDate : null,
    };

    try {
      if (editingTask) {
        await updateTask(editingTask.id, payload);
        toast({ title: "Tarefa Atualizada" });
      } else {
        await createTask(payload);
        toast({ title: "Tarefa Criada" });
      }
      setIsTaskDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Erro ao Salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleQuickStatusUpdate = async (taskId: string, newStatus: Task['status']) => {
    try {
        await updateTask(taskId, { status: newStatus });
    } catch (error) {
        toast({ title: "Erro ao atualizar status", variant: "destructive" });
    }
  };

  const handleToggleChecklistItem = async (task: Task, itemIndex: number, completed: boolean) => {
    const updatedChecklist = [...(task.checklist || [])];
    updatedChecklist[itemIndex] = { ...updatedChecklist[itemIndex], completed };
    try {
        await updateTask(task.id, { checklist: updatedChecklist });
    } catch (error) {
        toast({ title: "Erro ao atualizar item", variant: "destructive" });
    }
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    setIsSavingTask(true);
    try {
      await deleteTask(taskToDelete.id);
      toast({ title: "Tarefa Excluída" });
    } catch (error: any) {
      toast({
        title: "Erro ao Excluir",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSavingTask(false);
      setTaskToDelete(null);
    }
  };
  
  const confirmDelete = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation(); // Impede que o clique abra o modal de edição
    setTaskToDelete(task);
  };

  const groupedTasks = useMemo(() => {
    const todo: Task[] = [];
    const inProgress: Task[] = [];
    const done: Task[] = [];
    
    tasks.forEach(task => {
        switch (task.status) {
            case 'pending':
                todo.push(task);
                break;
            case 'in-progress':
                inProgress.push(task);
                break;
            case 'completed':
            case 'cancelled':
                done.push(task);
                break;
        }
    });
    return { todo, inProgress, done };
  }, [tasks]);

  const TaskColumn = ({ title, tasks, color }: { title: string, tasks: Task[], color: string }) => (
    <div className={`flex flex-col ${color} rounded-lg p-4`}>
        <h2 className="text-lg font-bold mb-4">{title} ({tasks.length})</h2>
        <ScrollArea className="flex-grow h-96">
          <div className="space-y-3 pr-4">
            {tasks.map(task => {
                const checklist = task.checklist || [];
                const completedItems = checklist.filter(item => item.completed).length;

                return (
                  <Card key={task.id} className="cursor-pointer hover:shadow-md relative group flex flex-col" onClick={() => openTaskDialog(task)}>
                      <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={(e) => confirmDelete(e, task)}>
                          <Icons.delete className="h-4 w-4"/>
                      </Button>
                      <CardContent className="p-3 space-y-2 flex-grow">
                          <p className={cn("font-semibold break-words pr-6", task.status === 'cancelled' && 'line-through text-destructive/80')}>
                            {task.title}
                          </p>
                          {checklist.length > 0 ? (
                            <div className="space-y-1.5 text-sm">
                              {checklist.map((item, index) => (
                                <div key={item.id || index} className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  <Checkbox id={`${task.id}-${item.id}`} checked={item.completed} onCheckedChange={(checked) => handleToggleChecklistItem(task, index, !!checked)} />
                                  <label htmlFor={`${task.id}-${item.id}`} className={cn("text-sm", item.completed && "line-through text-muted-foreground")}>{item.text}</label>
                                </div>
                              ))}
                            </div>
                          ) : task.description && (
                              <p className="text-sm text-muted-foreground break-words">{task.description}</p>
                          )}
                      </CardContent>
                      <CardFooter className="p-3 pt-0 mt-auto flex justify-between items-center" onClick={(e) => e.stopPropagation()}>
                         <Select value={task.status} onValueChange={(newStatus) => handleQuickStatusUpdate(task.id, newStatus as Task['status'])}>
                             <SelectTrigger className="h-7 px-2 text-xs w-auto">
                                 <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                                 {Object.entries(taskStatusConfig).map(([key, config]) => (
                                     <SelectItem key={key} value={key}>{config.label}</SelectItem>
                                 ))}
                             </SelectContent>
                         </Select>
                         <p className="text-xs text-muted-foreground">{task.dueDate ? formatDateDisplay(task.dueDate) : "Sem prazo"}</p>
                      </CardFooter>
                  </Card>
                )
            })}
          </div>
        </ScrollArea>
    </div>
  );

  return (
    <>
      {isLoading ? (
        <div className="text-center py-10">
          <Icons.loader className="animate-spin w-6 h-6 mx-auto" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <TaskColumn title="A Fazer" tasks={groupedTasks.todo} color="bg-blue-100/50 dark:bg-blue-900/20" />
            <TaskColumn title="Em Progresso" tasks={groupedTasks.inProgress} color="bg-yellow-100/50 dark:bg-yellow-900/20" />
            <TaskColumn title="Concluído / Cancelado" tasks={groupedTasks.done} color="bg-green-100/50 dark:bg-green-900/20" />
        </div>
      )}

      <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
        <DialogContent
          className="sm:max-w-lg"
          overlayClassName="bg-transparent"
        >
          <DialogHeader>
            <DialogTitle>{editingTask ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
            <DialogDescription>Preencha os detalhes da tarefa abaixo.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit(handleTaskFormSubmit)}
            className="space-y-4 py-4"
          >
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Título</Label>
                <Input
                  id="title"
                  {...form.register("title")}
                  disabled={isSavingTask}
                />
                {form.formState.errors.title && (
                  <p className="text-xs text-destructive mt-1">
                    {form.formState.errors.title.message}
                  </p>
                )}
              </div>
              
              <div>
                <Label>Checklist</Label>
                <div className="space-y-2 mt-2 border rounded-md p-3 bg-background">
                    {checklistFields.map((field, index) => (
                      <div key={field.id} className="flex items-center gap-2 group">
                        <Controller
                          name={`checklist.${index}.completed`}
                          control={form.control}
                          render={({ field: checkboxField }) => (
                            <Checkbox
                              checked={checkboxField.value}
                              onCheckedChange={checkboxField.onChange}
                              disabled={isSavingTask}
                            />
                          )}
                        />
                        <Controller
                           name={`checklist.${index}.text`}
                           control={form.control}
                           render={({ field: inputField }) => (
                              <Input {...inputField} className="h-8 flex-grow bg-transparent border-0 focus-visible:ring-1" disabled={isSavingTask} />
                           )}
                        />
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100" onClick={() => remove(index)}>
                          <Icons.delete className="h-4 w-4"/>
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Input
                        placeholder="Adicionar novo item..."
                        value={newItemText}
                        onChange={(e) => setNewItemText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddNewChecklistItem();
                          }
                        }}
                        className="h-8 flex-grow border-0 bg-transparent focus-visible:ring-0"
                      />
                      <Button type="button" size="sm" onClick={handleAddNewChecklistItem} disabled={!newItemText.trim()}>Adicionar</Button>
                    </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="assigneeId">Atribuir a (Opcional)</Label>
                  <Controller
                    control={form.control}
                    name="assigneeId"
                    render={({ field }) => (
                      <Select
                        onValueChange={(value) =>
                          field.onChange(value === "__none__" ? null : value)
                        }
                        value={field.value ?? "__none__"}
                        disabled={isSavingTask}
                      >
                        <SelectTrigger id="assigneeId">
                          <SelectValue placeholder="Selecione um membro" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Ninguém</SelectItem>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div>
                  <Label htmlFor="dueDate">Prazo (Opcional)</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    {...form.register("dueDate")}
                    disabled={isSavingTask}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSavingTask}
                    >
                      <SelectTrigger id="status">
                        <SelectValue placeholder="Selecione um status" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(taskStatusConfig).map(
                          ([key, config]) => (
                            <SelectItem key={key} value={key}>
                              {config.label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
            <DialogFooter className="mt-auto pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTaskDialogOpen(false)}
                disabled={isSavingTask}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSavingTask}>
                {isSavingTask && (
                  <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingTask ? "Salvar Alterações" : "Criar Tarefa"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!taskToDelete}
        onOpenChange={(open) => !open && setTaskToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a tarefa &quot;{taskToDelete?.title}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTask}
              disabled={isSavingTask}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isSavingTask && (
                <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
              )}{" "}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
