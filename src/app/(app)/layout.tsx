
"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { AppLayout } from "@/components/layout/AppLayout";

export default function AuthenticatedAppLayout({ children }: { children: ReactNode }) {
  // Este layout agora envolve todas as páginas autenticadas,
  // garantindo a verificação de autenticação E o layout visual persistente.
  return (
    <AuthGuard allowedRoles={["admin", "driver"]}>
      <AppLayout>{children}</AppLayout>
    </AuthGuard>
  );
}
