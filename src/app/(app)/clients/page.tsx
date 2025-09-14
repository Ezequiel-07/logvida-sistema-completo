
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClientManagementClient } from "./components/ClientManagementClient";
import { Suspense } from "react";
import { Icons } from "@/components/icons";

export default function ClientManagementPage() {
  return (
    <div className="py-8 w-full max-w-7xl mx-auto">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary">
            Gerenciamento de Clientes
          </CardTitle>
          <CardDescription>
            Visualize, cadastre, edite e exclua os clientes da sua
            transportadora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="flex justify-center p-10"><Icons.loader className="h-8 w-8 animate-spin"/></div>}>
            <ClientManagementClient />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
