

"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PricingClient } from "./components/PricingClient";
import { Suspense } from "react";
import { Icons } from "@/components/icons";

export default function PricingPage() {
  return (
    <div className="w-full max-w-7xl mx-auto py-8">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary">
            Criar Nova Ordem de Serviço
          </CardTitle>
          <CardDescription>
            Crie e configure uma nova ordem de serviço, definindo cliente, motorista, rota e precificação.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
           <Suspense fallback={<div className="flex justify-center py-10"><Icons.loader className="h-8 w-8 animate-spin" /></div>}>
            <PricingClient />
           </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
