
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import QuoteListClient from "./components/QuoteListClient";
import { Suspense } from "react";
import { Icons } from "@/components/icons";

export default function QuoteManagementPage() {
  return (
    <div className="py-8 w-full max-w-7xl mx-auto">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary">
            Orçamentos Recebidos
          </CardTitle>
          <CardDescription>
            Gerencie as solicitações de novos visitantes e os pedidos de serviços de clientes existentes.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <Suspense fallback={<div className="flex justify-center py-10"><Icons.loader className="h-8 w-8 animate-spin" /></div>}>
              <QuoteListClient />
            </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
