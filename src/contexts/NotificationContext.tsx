
"use client";

import type { AppNotification, NotificationType } from "@/types/notification";
import type { ReactNode } from "react";
import { createContext, useState, useEffect, useCallback, useContext } from "react";
import { toast } from "@/hooks/use-toast";
import { db, getClientMessaging, auth } from "@/lib/firebase";
import {
  collection,
  query,
  getDocs,
  doc,
  updateDoc,
  writeBatch,
  deleteDoc,
  limit,
  onSnapshot,
  orderBy,
  addDoc,
} from "firebase/firestore";
import { getToken, onMessage } from "firebase/messaging";
import { useAuth } from "@/hooks/useAuth";
import { toISOString } from "@/lib/utils";
import type { FirebaseError } from "firebase/app";


interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  clearAllNotifications: () => void;
  clearNotification: (notificationId: string) => void;
  subscribeUser: () => Promise<void>;
  isSubscribed: boolean;
  canSubscribe: boolean;
}

export const NotificationContext = createContext<
  NotificationContextType | undefined
>(undefined);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider",
    );
  }
  return context;
}

const MAX_NOTIFICATIONS = 50;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { currentUser, isLoading } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(true); // Assume subscribed until checked
  const [canSubscribe, setCanSubscribe] = useState(false);

  // Check initial subscription status
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setCanSubscribe(true);
      if (Notification.permission === 'granted') {
        setIsSubscribed(true);
      } else {
        setIsSubscribed(false);
      }
    } else {
      setCanSubscribe(false);
    }
  }, []);


  useEffect(() => {
    if (isLoading || !currentUser?.id) {
      setNotifications([]);
      return;
    }

    const userNotificationsCollectionRef = collection(
      db,
      "users",
      currentUser.id,
      "notifications",
    );
    const q = query(userNotificationsCollectionRef, orderBy("timestamp", "desc"), limit(MAX_NOTIFICATIONS));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const loadedNotifications = querySnapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            timestamp: toISOString(data.timestamp) || new Date().toISOString(),
            read: typeof data.read === "boolean" ? data.read : false,
          } as AppNotification;
        });
        setNotifications(loadedNotifications);
      },
      (error: any) => {
        let description = "Não foi possível carregar as notificações em tempo real.";
        
        if (
          error.code === "failed-precondition" &&
          error.message &&
          typeof error.message === 'string' &&
          error.message.includes("The query requires an index")
        ) {
          const urlRegex = /(https?:\/\/[^\s]+)/;
          const match = error.message.match(urlRegex);
          const indexCreationUrl = match ? match[0].replace(/\\/g, '') : null;
          
          description = "Índice do banco de dados ausente. Notificações não podem ser carregadas. ";
          if (indexCreationUrl && currentUser?.role === 'admin') {
              description += `Como administrador, clique no seguinte link para criar o índice necessário e recarregue a página: ${indexCreationUrl}`;
          } else {
              description += "Contate o administrador do sistema.";
          }
        } else if (error.code === "permission-denied") {
            description = "Permissão negada para ler notificações. Verifique as regras de segurança do Firestore.";
        }
        
        
        toast({
          title: "Erro Crítico de Notificação",
          description: description,
          variant: "destructive",
          duration: 30000, 
        });
      },
    );

    return () => unsubscribe();
  }, [currentUser, isLoading]);

  const sendTokenToServer = useCallback(async (token: string) => {
    if (!currentUser || !auth.currentUser) return;
    console.log("[Context] Enviando token para o servidor:", token);
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ token }),
      });
      if(!response.ok) {
        const errorData = await response.json();
        console.error("[Context] Erro ao enviar token para o servidor:", errorData);
      } else {
        console.log("[Context] Token enviado com sucesso para o servidor.");
      }
    } catch (error) {
      console.warn("[Context] Falha ao enviar token FCM para o servidor:", error);
    }
  }, [currentUser]);

  const subscribeUser = useCallback(async () => {
    console.log("[Context] Tentando inscrever usuário para notificações...");
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      console.log("[Context] Navegador incompatível (sem service worker).");
      toast({ title: "Navegador incompatível", description: "Seu navegador não suporta notificações push.", variant: "destructive"});
      return;
    }

    try {
      const messaging = await getClientMessaging();
      if (!messaging) {
        console.log("[Context] Cliente de mensagens do Firebase não disponível.");
        toast({ title: "Navegador incompatível", description: "Seu navegador não suporta notificações push.", variant: "destructive"});
        return;
      }
      
      const applicationServerKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!applicationServerKey || applicationServerKey.includes("YOUR_")) {
        console.error("[Context] Chave VAPID não configurada.");
        return;
      }
      
      console.log("[Context] Solicitando permissão de notificação...");
      const permission = await Notification.requestPermission();
      console.log("[Context] Permissão de notificação:", permission);
      if (permission !== "granted") {
        toast({
          title: "Permissão de Notificação Negada",
          description: "Você não receberá atualizações em tempo real das rotas.",
          variant: "default",
        });
        setIsSubscribed(false);
        return;
      }
      
      setIsSubscribed(true);
      toast({ title: "Notificações Ativadas!", description: "Você está pronto para receber atualizações." });

      console.log("[Context] Obtendo token FCM...");
      const currentToken = await getToken(messaging, {
        vapidKey: applicationServerKey,
      });

      if (currentToken) {
        console.log("[Context] Token FCM recebido:", currentToken);
        await sendTokenToServer(currentToken);

        onMessage(messaging, (payload) => {
            if (!payload.notification) return;
            console.log("[Context] Mensagem recebida em foreground:", payload);

            toast({
              title: payload.notification.title || "Nova Notificação",
              description: payload.notification.body,
            });

            // Adiciona a notificação recebida à lista de notificações no estado.
            const newNotification: AppNotification = {
              id: payload.messageId || new Date().getTime().toString(),
              title: payload.notification.title || "Sem Título",
              message: payload.notification.body || "Sem conteúdo",
              type: (payload.data?.type as NotificationType) || "info",
              read: false,
              timestamp: new Date().toISOString(),
              routeId: payload.data?.routeId || undefined,
              chatId: payload.data?.chatId || undefined,
              senderId: payload.data?.senderId || undefined,
              senderName: payload.data?.senderName || undefined,
              quoteId: payload.data?.quoteId || undefined,
            };
            setNotifications((prev) => [newNotification, ...prev].slice(0, MAX_NOTIFICATIONS));

            // Dispara um evento para notificar outras partes da app, como o chat
            if (payload.data?.eventType === 'chatMessage') {
                window.dispatchEvent(new CustomEvent('new-chat-message'));
            }
        });
      } else {
        console.warn("[Context] Falha ao obter token FCM.");
      }
    } catch (error) {
      const fbError = error as FirebaseError;
      if (fbError.code === 'messaging/token-subscribe-failed') {
          console.error("[Context] Erro de Inscrição FCM: Não foi possível inscrever. Isso geralmente significa que a API do Firebase Cloud Messaging não está habilitada em seu projeto do Google Cloud ou há um problema com as permissões da chave de API.");
          toast({
              title: "Falha na Inscrição de Notificações",
              description: "A API Firebase Cloud Messaging pode não estar habilitada. Contate o suporte.",
              variant: "destructive"
          });
      } else {
        console.error("[Context] Ocorreu um erro ao configurar as notificações:", error);
      }
    }
  }, [sendTokenToServer]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!currentUser?.id) return;
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
      );
      try {
        const notificationRef = doc(
          db,
          "users",
          currentUser.id,
          "notifications",
          notificationId,
        );
        await updateDoc(notificationRef, { read: true });
      } catch (_error) {
        // No-op
      }
    },
    [currentUser],
  );

  const markAllAsRead = useCallback(async () => {
    if (!currentUser?.id) return;
    const unreadNotifications = notifications.filter((n) => !n.read);
    if (unreadNotifications.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      const batch = writeBatch(db);
      unreadNotifications.forEach((notification) => {
        const notificationRef = doc(
          db,
          "users",
          currentUser.id,
          "notifications",
          notification.id,
        );
        batch.update(notificationRef, { read: true });
      });
      await batch.commit();
    } catch (_error) {
      setNotifications((prev) =>
        prev.map((n) =>
          unreadNotifications.some((un) => un.id === n.id)
            ? { ...n, read: false }
            : n,
        ),
      );
    }
  }, [currentUser, notifications]);

  const clearAllNotifications = useCallback(async () => {
    if (!currentUser?.id) return;
    const oldNotifications = [...notifications];
    setNotifications([]);
    try {
      const userNotificationsCollectionRef = collection(
        db,
        "users",
        currentUser.id,
        "notifications",
      );
      const querySnapshot = await getDocs(
        query(userNotificationsCollectionRef),
      );
      if (querySnapshot.empty) return;
      const batch = writeBatch(db);
      querySnapshot.docs.forEach((docSnap) => {
        batch.delete(doc(userNotificationsCollectionRef, docSnap.id));
      });
      await batch.commit();
    } catch (_error) {
      setNotifications(oldNotifications);
    }
  }, [currentUser, notifications]);

  const clearNotification = useCallback(
    async (notificationId: string) => {
      if (!currentUser?.id) return;
      const oldNotifications = [...notifications];
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      try {
        const notificationRef = doc(
          db,
          "users",
          currentUser.id,
          "notifications",
          notificationId,
        );
        await deleteDoc(notificationRef);
      } catch (_error) {
        setNotifications(oldNotifications);
      }
    },
    [currentUser, notifications],
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearAllNotifications,
        clearNotification,
        subscribeUser,
        isSubscribed,
        canSubscribe,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
