

"use client";

import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
  useContext,
} from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, Timestamp } from "firebase/firestore";
import { toast } from "@/hooks/use-toast";
import type { User, NotificationSettings } from "@/types/user";
import type { Vehicle } from "@/types/vehicle";
import { toISOString } from "@/lib/utils";

const defaultNotificationSettings: NotificationSettings = {
  newRouteAssignedNotification: true,
  routeStartNotification: true,
  routeCompletionNotification: true,
  routeUpdateNotification: true,
  checkpointDelayNotification: false,
  routeCancellationNotification: true,
  chatMessageNotification: true,
};

interface AuthContextType {
  currentUser: User | null;
  firebaseUser: FirebaseUser | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (updatedProfileData: Partial<User>) => Promise<boolean>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        try {
          await fetch('/api/session', { method: 'DELETE' });
        } catch (e) {
          console.error("Failed to clear session cookie:", e);
        }
        setCurrentUser(null);
        setIsLoading(false);
        return;
      }
      
      try {
        const idToken = await fbUser.getIdToken(true);
        await fetch('/api/session', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${idToken}` },
        });
      } catch (e: any) {
        console.error("AuthContext: Failed to set session cookie:", e);
        toast({
          title: "Erro de Sessão",
          description: `Não foi possível criar a sessão do servidor: ${e.message}`,
          variant: "destructive"
        })
      }

      setIsLoading(true);
      try {
        const userDocRef = doc(db, "users", fbUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          let vehicleData: Vehicle | null = null;
          if (userData.vehicleId) {
            const vehicleRef = doc(db, "vehicles", userData.vehicleId);
            const vehicleSnap = await getDoc(vehicleRef);
            if (vehicleSnap.exists()) {
              vehicleData = { id: vehicleSnap.id, ...vehicleSnap.data() } as Vehicle;
            }
          }

          const finalNotificationSettings = {
            ...defaultNotificationSettings,
            ...(userData.notificationSettings || {}),
          };

          if (!userData.notificationSettings) {
              await updateDoc(userDocRef, { notificationSettings: finalNotificationSettings });
          }

          const userProfile: User = {
            id: userDocSnap.id,
            email: fbUser.email!,
            name: userData.name || fbUser.displayName || "Novo Usuário",
            role: userData.role || "driver",
            profilePictureUrl: userData.profilePictureUrl || fbUser.photoURL,
            createdAt: toISOString(userData.createdAt) || new Date().toISOString(),
            notificationSettings: finalNotificationSettings,
            vehicleId: userData.vehicleId || null,
            vehicle: vehicleData,
            phone: userData.phone || null,
            isActive: userData.isActive ?? true,
            clientId: userData.clientId || null,
            salaryDetails: userData.salaryDetails || null,
          };
          setCurrentUser(userProfile);
        } else {
          const newUserProfile: User = {
            id: fbUser.uid,
            email: fbUser.email!,
            name: fbUser.displayName || "Novo Usuário",
            role: "driver", 
            profilePictureUrl: fbUser.photoURL || null,
            createdAt: new Date().toISOString(),
            notificationSettings: defaultNotificationSettings,
            vehicleId: null, vehicle: null, phone: null,
            isActive: true, clientId: null,
            salaryDetails: null,
          };
          await setDoc(doc(db, "users", fbUser.uid), {
            name: newUserProfile.name,
            email: newUserProfile.email,
            role: newUserProfile.role,
            createdAt: Timestamp.now(),
            isActive: true, phone: null, vehicleId: null,
            clientId: null,
            salaryDetails: null,
            notificationSettings: defaultNotificationSettings,
          });
          setCurrentUser(newUserProfile);
        }
      } catch (error: any) {
        console.error("Auth context error:", error);
        
        // **RESILIENCE LOGIC**
        // If Firestore is offline or fails, log in the user with basic data.
        if (error.message.includes("offline") || error.code === 'unavailable' || error.message.includes("Failed to get document")) {
            toast({
              title: "Aviso: Modo Offline",
              description: "Não foi possível carregar todos os dados do seu perfil. Algumas funcionalidades podem estar limitadas.",
              variant: "destructive",
              duration: 10000,
            });
            const fallbackUser: User = {
                id: fbUser.uid,
                email: fbUser.email!,
                name: fbUser.displayName || 'Usuário',
                role: 'driver', // Fallback role
                createdAt: new Date().toISOString(),
                profilePictureUrl: null,
                notificationSettings: defaultNotificationSettings,
                isActive: true,
                phone: null,
                vehicle: null,
                vehicleId: null,
                clientId: null,
                salaryDetails: null,
            };
            setCurrentUser(fallbackUser);
        } else {
            setCurrentUser(null);
            toast({
              title: "Erro de Perfil",
              description: "Não foi possível carregar os dados do seu perfil.",
              variant: "destructive",
            });
        }
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const login = useCallback(async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    await signOut(auth);
    setIsLoading(false);
    toast({ title: "Logout Efetuado", description: "Você foi desconectado." });
  }, []);

  const updateUserProfile = useCallback(
    async (updatedProfileData: Partial<User>) => {
      if (!currentUser?.id) {
        toast({
          title: "Erro ao Atualizar",
          description: "Nenhum usuário logado.",
          variant: "destructive",
        });
        return false;
      }
      try {
        const userDocRef = doc(db, "users", currentUser.id);
        const filteredData = Object.fromEntries(
          Object.entries(updatedProfileData).filter(
            ([key, v]) => v !== undefined && key !== "vehicle",
          ),
        );
        await updateDoc(userDocRef, filteredData);
        setCurrentUser((prev) =>
          prev ? { ...prev, ...filteredData } : null,
        );
        toast({
          title: "Perfil Atualizado",
          description: "Seu perfil foi atualizado.",
        });
        return true;
      } catch (_error) {
        return false;
      }
    },
    [currentUser],
  );

  const value = useMemo(
    () => ({ currentUser, firebaseUser, isLoading, login, logout, updateUserProfile }),
    [currentUser, firebaseUser, isLoading, login, logout, updateUserProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
