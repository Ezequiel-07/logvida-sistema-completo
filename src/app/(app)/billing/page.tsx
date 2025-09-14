
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BillingClient } from "./components/BillingClient";
import { Suspense } from "react";
import { Icons } from "@/components/icons";

export default function BillingPage() {
  return (
    <div className="w-full max-w-7xl mx-auto py-8 space-y-8">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary">
            Faturamento e Emissão de Nota Fiscal
          </CardTitle>
          <CardDescription>
            Selecione um cliente e o período para listar as ordens de serviço concluídas e gerar a nota fiscal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="flex justify-center p-10"><Icons.loader className="h-8 w-8 animate-spin"/></div>}>
            <BillingClient />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
