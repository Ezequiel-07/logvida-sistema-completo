
"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import type { User } from "@/types/user";
import { Icons } from "@/components/icons";
import Image from "next/image";

interface AuthGuardProps {
  children: ReactNode;
  allowedRoles: User["role"][];
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) {
      return; // Still waiting for auth state, do nothing yet.
    }

    // If user is not logged in, always redirect to login.
    if (!currentUser) {
      router.replace("/login");
      return;
    }

    // Determine the correct home page for the current user's role
    let homePath = "/dashboard"; // Default for admin
    if (currentUser.role === "driver") homePath = "/driver-dashboard";
    if (currentUser.role === "client") homePath = "/client-dashboard";
    
    // If user is on the wrong dashboard, redirect them.
    // e.g., a driver visiting '/dashboard' should be sent to '/driver-dashboard'
    if (pathname === '/dashboard' && currentUser.role !== 'admin') {
      router.replace(homePath);
      return;
    }

    // If the user's role is not allowed for the current route group, redirect them home.
    if (!allowedRoles.includes(currentUser.role)) {
       if (pathname !== homePath) {
        router.replace(homePath);
      }
    }
    
  }, [currentUser, isLoading, router, allowedRoles, pathname]);

  // While loading, or if the user is not yet available, show a loader.
  if (isLoading || !currentUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <div className="relative w-20 h-20 mb-6">
            <Image src="/logvida-logo.png" alt="LogVida Logo" fill sizes="80px" className="object-contain" />
        </div>
        <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">
          Carregando...
        </p>
      </div>
    );
  }
  
  // If user is logged in but their role is not allowed for this layout, show a loader while redirecting.
  // The useEffect hook above will handle the actual redirection.
  if (!allowedRoles.includes(currentUser.role)) {
     return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <div className="relative w-20 h-20 mb-6">
            <Image src="/logvida-logo.png" alt="LogVida Logo" fill sizes="80px" className="object-contain" />
        </div>
        <Icons.loader className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">
          Verificando acesso...
        </p>
      </div>
    );
  }

  // If user is authenticated and has the correct role, render the children.
  return <>{children}</>;
}
