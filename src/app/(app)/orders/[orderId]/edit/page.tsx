
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LiveOrderEditClient } from "./components/LiveOrderEditClient";
import { useParams } from "next/navigation";

// This line tells Next.js to render this page dynamically on the server
// and exclude it from the static export process, resolving the build error.
export const dynamic = 'force-dynamic';

export default function EditLiveOrderPage() {
  const params = useParams();
  const orderId = Array.isArray(params.orderId)
    ? params.orderId[0]
    : params.orderId;

  if (!orderId) {
    return (
      <div className="w-full max-w-7xl mx-auto py-8">
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl text-destructive">
              Erro: ID da Ordem de Serviço não encontrado
            </CardTitle>
            <CardDescription>
              Não foi possível obter o ID da Ordem de Serviço a partir do URL.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Pass only the orderId string to the client component
  return (
    <div className="w-full mx-auto py-8">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl">
            Editar Ordem de Serviço
          </CardTitle>
          <CardDescription>
            Ajuste os detalhes e a rota de uma Ordem de Serviço que já foi criada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LiveOrderEditClient orderId={orderId} />
        </CardContent>
      </Card>
    </div>
  );
}
