

'use server';

import { getAdminDb, getAdminMessaging, FieldValue } from "@/server/lib/firebaseAdmin";
import type { NotificationType } from "@/types/notification";
import type { NotificationSettings } from "@/types/user";

const defaultNotificationSettings: NotificationSettings = {
  newRouteAssignedNotification: true,
  routeStartNotification: true,
  routeCompletionNotification: true,
  routeUpdateNotification: true,
  checkpointDelayNotification: false,
  routeCancellationNotification: true,
  chatMessageNotification: true,
};

const eventToSettingMap: Record<string, keyof NotificationSettings | null> = {
  newRouteAssigned: "newRouteAssignedNotification",
  routeStart: "routeStartNotification",
  routeCompletion: "routeCompletionNotification",
  routeUpdate: "routeUpdateNotification",
  routeCancellation: "routeCancellationNotification",
  checkpointDelay: "checkpointDelayNotification",
  chatMessage: "chatMessageNotification",
  newQuote: null, // Always notify admins about new quotes
  test: null, // Test notifications should always be sent
};

export async function sendNotification(
    userId: string,
    title: string,
    body: string,
    type: NotificationType,
    data: { [key: string]: string } = {},
    bypassSettingsCheck = false,
) {
    if (!userId || !title || !body) {
        console.warn("[sendNotification] Missing required parameters (userId, title, or body).");
        return;
    }

    const adminDb = getAdminDb();
    const userRef = adminDb.collection("users").doc(userId);

    try {
        if (!bypassSettingsCheck) {
            const userDoc = await userRef.get();
            if (!userDoc.exists) {
                console.warn(`[sendNotification] User ${userId} not found.`);
                return;
            }
            const settings: NotificationSettings = {
                ...defaultNotificationSettings,
                ...(userDoc.data()?.notificationSettings || {}),
            };
            const eventType = data.eventType || "";
            const settingKey = eventToSettingMap[eventType];

            if (settingKey && settings[settingKey] === false) {
                console.log(`[sendNotification] Notification for event '${eventType}' blocked by user ${userId}'s settings.`);
                return;
            }
            if (settingKey === undefined) {
                console.warn(`[sendNotification] Unknown eventType '${eventType}'. Notification sent by default.`);
            }
        }

        await userRef.collection("notifications").add({
            message: body,
            title: title,
            type: type,
            routeId: data.routeId || null,
            routeName: data.routeName || null,
            senderId: data.senderId || null,
            senderName: data.senderName || null,
            chatId: data.chatId || null,
            quoteId: data.quoteId || null,
            timestamp: FieldValue.serverTimestamp(),
            read: false,
        });

        // *** BLOCO DE NOTIFICAÇÃO PUSH ISOLADO E À PROVA DE FALHAS ***
        const adminMessaging = getAdminMessaging();
        if (!adminMessaging) {
            console.log("[sendNotification] Admin Messaging not initialized. Skipping push notification.");
            return;
        }

        try {
            const tokensSnapshot = await userRef.collection("fcmTokens").get();
            if (tokensSnapshot.empty) {
                console.log(`[sendNotification] No FCM tokens found for user ${userId}.`);
                return; // Saída normal, não um erro.
            }
            
            const tokens = tokensSnapshot.docs.map((doc) => doc.id);
            
            let url = '/dashboard';
            if (data.routeId) url = `/routes/${data.routeId}/timeline`;
            else if (data.quoteId) url = '/admin/quotes';
            else if (data.chatId && data.senderId) url = `/dashboard?openChatWith=${data.senderId}`;
            
            const payload = { notification: { title, body }, data: { ...data, url } };
            const multicastMessage = { ...payload, tokens };
            
            const response = await adminMessaging.sendEachForMulticast(multicastMessage);

            if (response.failureCount > 0) {
                const tokensToDelete: Promise<any>[] = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const errorCode = resp.error?.code;
                        if (errorCode === 'messaging/invalid-registration-token' || errorCode === 'messaging/registration-token-not-registered') {
                            tokensToDelete.push(tokensSnapshot.docs[idx].ref.delete());
                        }
                    }
                });
                if (tokensToDelete.length > 0) {
                    await Promise.all(tokensToDelete);
                    console.log(`[sendNotification] Cleaned up ${tokensToDelete.length} invalid FCM tokens for user ${userId}.`);
                }
            }
        } catch (fcmError: any) {
            // Captura qualquer erro CRÍTICO do FCM (ex: falha de autenticação com o serviço) e o impede de parar a execução.
            console.error(`[sendNotification] A CRITICAL error occurred during the FCM call for user ${userId}. This error was caught and suppressed. Details:`, fcmError);
        }

    } catch (error) {
        // O catch principal agora só lidará com erros na criação da notificação no Firestore ou na busca de usuário.
        console.error(`[sendNotification] An unexpected error occurred for user ${userId}:`, error);
    }
}
