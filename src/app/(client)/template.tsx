"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import type { ReactNode } from "react";

// O template do cliente agora envolve o conteúdo com o AppLayout.
export default function ClientTemplate({ children }: { children: ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
