
"use server";

import { getAdminAuth, getAdminDb, Timestamp } from "@/server/lib/firebaseAdmin";
import * as z from "zod";
import type { User, SalaryDetails, NotificationSettings } from "@/types/user";

const createClientUserSchema = z.object({
  email: z.string().email("Formato de e-mail inválido."),
  clientId: z.string().min(1, "ID do cliente é obrigatório."),
  clientName: z.string().min(1, "Nome do cliente é obrigatório."),
});

const defaultNotificationSettings: NotificationSettings = {
  newRouteAssignedNotification: true,
  routeStartNotification: true,
  routeCompletionNotification: true,
  routeUpdateNotification: true,
  checkpointDelayNotification: false,
  routeCancellationNotification: true,
  chatMessageNotification: true,
};

export async function createClientUser(
  data: z.infer<typeof createClientUserSchema>,
) {
  const validation = createClientUserSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: "Dados inválidos." };
  }

  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    const { email, clientId, clientName } = validation.data;

    const userRecord = await adminAuth.createUser({
      email: email,
      emailVerified: false,
      displayName: clientName,
      disabled: false,
    });

    const userDocRef = adminDb.collection("users").doc(userRecord.uid);
    await userDocRef.set({
      name: clientName,
      email: email,
      role: "client",
      clientId: clientId,
      createdAt: Timestamp.now(),
      isActive: true,
      phone: null,
      vehicleId: null,
      salaryDetails: null,
      notificationSettings: defaultNotificationSettings,
    });

    const link = await adminAuth.generatePasswordResetLink(email);

    return {
      success: true,
      userId: userRecord.uid,
      passwordSetupLink: link,
    };
  } catch (error: any) {
    if (error.code === "auth/email-already-exists") {
      return {
        success: false,
        error: "Este e-mail já está em uso por outra conta.",
      };
    }
    return {
      success: false,
      error: "Ocorreu um erro no servidor ao criar o usuário.",
    };
  }
}

const createTeamMemberSchema = z.object({
  email: z.string().email("Formato de e-mail inválido."),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  name: z.string().min(1, "Nome é obrigatório"),
  role: z.enum(["admin", "driver"]),
  phone: z.string().optional(),
  vehicleId: z.string().optional().nullable(),
  isActive: z.boolean(),
});

export async function createTeamMember(
  data: z.infer<typeof createTeamMemberSchema>,
) {
  const validation = createTeamMemberSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: "Dados inválidos." };
  }

  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();
    const { email, password, name, role, phone, vehicleId, isActive } =
      validation.data;

    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
      emailVerified: true,
      disabled: !isActive,
    });

    const batch = adminDb.batch();
    const userRef = adminDb.collection("users").doc(userRecord.uid);
    
    const salaryDetails: SalaryDetails | null = role === 'driver' ? {
        baseSalary: 3000,
        hazardPay: 30,
        benefits: 750,
    } : null;

    batch.set(userRef, {
      name,
      email,
      role,
      phone: phone || null,
      isActive,
      createdAt: Timestamp.now(),
      vehicleId: vehicleId || null,
      salaryDetails: salaryDetails,
      notificationSettings: defaultNotificationSettings,
    });

    if (vehicleId) {
      const vehicleRef = adminDb.collection("vehicles").doc(vehicleId);
      batch.update(vehicleRef, {
        assignedDriverId: userRecord.uid,
        assignedDriverName: name,
      });
    }

    await batch.commit();

    return { success: true, userId: userRecord.uid };
  } catch (error: any) {
    if (error.code === "auth/email-already-exists") {
      return {
        success: false,
        error: "Este e-mail já está em uso por outra conta.",
      };
    }
    console.error("Server Action Error: createTeamMember", error);
    return {
      success: false,
      error: "Ocorreu um erro no servidor ao criar o membro da equipe.",
    };
  }
}
