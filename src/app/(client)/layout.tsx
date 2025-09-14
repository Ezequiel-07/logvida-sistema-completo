import type { ReactNode } from "react";
import { AuthGuard } from "@/components/layout/AuthGuard";

export default function ClientPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AuthGuard allowedRoles={["client"]}>
        {children}
    </AuthGuard>
  );
}
