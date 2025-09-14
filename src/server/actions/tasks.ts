
'use server';

import { getAdminDb, Timestamp } from "@/server/lib/firebaseAdmin";
import type { Task } from "@/types/task";
import { sendNotification } from "./notifications";

// Função para criar uma nova tarefa
export async function createTask(taskData: Partial<Task>) {
  if (!taskData.title) {
    throw new Error("O título da tarefa é obrigatório.");
  }
  const adminDb = getAdminDb();
  const newTaskRef = adminDb.collection("tasks").doc();
  const now = Timestamp.now();

  const checklistWithIds = (taskData.checklist || []).map(item => ({
    ...item,
    id: item.id || `item_${Date.now()}_${Math.random()}`
  }));

  const fullTaskData = {
    ...taskData,
    checklist: checklistWithIds,
    id: newTaskRef.id,
    createdAt: now,
    updatedAt: now,
    status: taskData.status || 'pending',
    dueDate: taskData.dueDate ? Timestamp.fromDate(new Date(taskData.dueDate)) : null,
  };

  await newTaskRef.set(fullTaskData);

  // Enviar notificação se a tarefa for atribuída a alguém
  if (taskData.assigneeId) {
    await sendNotification(
      taskData.assigneeId,
      "Nova Tarefa Atribuída",
      `Você foi atribuído à tarefa: "${taskData.title}"`,
      "info",
      { eventType: "newRouteAssigned" } // Reutilizando um tipo de evento existente
    );
  }

  return { id: newTaskRef.id };
}

// Função para atualizar uma tarefa existente
export async function updateTask(taskId: string, updates: Partial<Task>) {
  if (!taskId) {
    throw new Error("ID da tarefa não fornecido.");
  }
  const adminDb = getAdminDb();
  const taskRef = adminDb.collection("tasks").doc(taskId);

  // Buscar o estado atual da tarefa antes de atualizar
  const originalTaskSnap = await taskRef.get();
  if (!originalTaskSnap.exists) {
    throw new Error("Tarefa não encontrada.");
  }
  const originalTask = originalTaskSnap.data() as Task;

  const payload: any = {
    ...updates,
    updatedAt: Timestamp.now(),
  };

  if(updates.dueDate) {
    payload.dueDate = Timestamp.fromDate(new Date(updates.dueDate));
  }
  
  if (updates.checklist) {
    payload.checklist = updates.checklist.map(item => ({
      ...item,
      id: item.id || `item_${Date.now()}_${Math.random()}`
    }));
  }

  await taskRef.update(payload);

  // Lógica de Notificação
  const title = updates.title || originalTask.title;

  // Notificar se a atribuição mudou
  if (updates.assigneeId && updates.assigneeId !== originalTask.assigneeId) {
    await sendNotification(
      updates.assigneeId,
      "Nova Tarefa Atribuída",
      `Você foi atribuído à tarefa: "${title}"`,
      "info",
       { eventType: "newRouteAssigned" }
    );
  } else if (originalTask.assigneeId) { // Notificar o responsável atual sobre outras mudanças
      // Notificar se o status mudou
      if (updates.status && updates.status !== originalTask.status) {
          let statusMessage = "";
          switch(updates.status) {
              case 'in-progress': statusMessage = `A tarefa "${title}" foi iniciada.`; break;
              case 'completed': statusMessage = `A tarefa "${title}" foi concluída!`; break;
              case 'cancelled': statusMessage = `A tarefa "${title}" foi cancelada.`; break;
          }
          if(statusMessage) {
            await sendNotification(
              originalTask.assigneeId,
              "Status da Tarefa Atualizado",
              statusMessage,
              "info",
              { eventType: "routeUpdate" } // Reutilizando
            );
          }
      }
  }


  return { id: taskId };
}

// Função para deletar uma tarefa
export async function deleteTask(taskId: string) {
  if (!taskId) {
    throw new Error("ID da tarefa não fornecido.");
  }
  const adminDb = getAdminDb();
  const taskRef = adminDb.collection("tasks").doc(taskId);

  // Buscar a tarefa antes de deletar para notificar o responsável
  const taskSnap = await taskRef.get();
  if (taskSnap.exists) {
    const taskData = taskSnap.data() as Task;
    await taskRef.delete();

    if (taskData.assigneeId) {
      await sendNotification(
        taskData.assigneeId,
        "Tarefa Removida",
        `A tarefa "${taskData.title}" foi removida.`,
        "warning",
        { eventType: "routeCancellation" } // Reutilizando
      );
    }
  } else {
    // Se não existir, apenas confirme a exclusão do lado do cliente
  }

  return { success: true };
}
