
"use client";

import React from "react";
import { RouteExecutionClient } from "./components/RouteExecutionClient";
import { Icons } from "@/components/icons";
import { Suspense } from "react";

// This line tells Next.js to render this page dynamically and exclude it
// from the static export process, which resolves the build error.
export const dynamic = 'force-dynamic';

export default function RouteExecutionPage() {
  // A página agora não depende mais de um orderId específico,
  // o componente RouteExecutionClient buscará todas as rotas ativas do motorista.
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Icons.loader className="h-12 w-12 animate-spin text-primary" /></div>}>
       <RouteExecutionClient />
    </Suspense>
  );
}
