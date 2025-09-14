

"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { OrderManagementClient } from "./components/OrderManagementClient";
import { Suspense } from "react";
import { Icons } from "@/components/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// The main page component is now a client component to manage state and routing.
export default function OrderManagementPage() {
  return (
    <div className="pt-4 pb-8 w-full max-w-screen-2xl mx-auto px-4 md:px-6">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary">
            Gerenciamento de Ordens de Serviço
          </CardTitle>
          <CardDescription>
            Visualize e gerencie todas as Ordens de Serviço de transporte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="flex justify-center py-10"><Icons.loader className="h-8 w-8 animate-spin" /></div>}>
            <OrderManagementClient />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
