"use client";

import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { LiveTracking } from "./components/LiveTracking";
import { OrderHistory } from "./components/OrderHistory";
import { NewQuoteForm } from "./components/NewQuoteForm";
import { ClientCalendarView } from "./components/ClientCalendarView";
import { useAuth } from "@/hooks/useAuth";

export default function ClientDashboardPage() {
  const { currentUser } = useAuth();

  return (
    <>
    <div className="container mx-auto py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Bem-vindo(a), {currentUser?.name || "Cliente"}!
        </h1>
        <p className="text-muted-foreground">
          Acompanhe seus pedidos, veja seu histórico e solicite novos
          serviços.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Coluna Principal (2/3 da largura) */}
        <div className="lg:col-span-2 space-y-8">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icons.navigation className="h-6 w-6 text-primary" />
                Acompanhamento em Tempo Real
              </CardTitle>
              <CardDescription>
                Visualize o progresso dos seus pedidos em trânsito.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LiveTracking />
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icons.history className="h-6 w-6 text-primary" />
                Histórico de Pedidos Concluídos
              </CardTitle>
              <CardDescription>
                Consulte seus pedidos finalizados e acesse as faturas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OrderHistory />
            </CardContent>
          </Card>
        </div>

        {/* Coluna Lateral (1/3 da largura) */}
        <div className="lg:col-span-1 space-y-8">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icons.calendarCheck className="h-6 w-6 text-primary" />
                Seu Calendário
              </CardTitle>
              <CardDescription>
                Veja seus pedidos agendados e adicione novos destinos a rotas em andamento.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClientCalendarView />
            </CardContent>
          </Card>
          
          <Card className="shadow-lg">
            <CardHeader>
               <CardTitle className="flex items-center gap-2">
                <Icons.plusCircle className="h-6 w-6 text-primary" />
                Solicitar Novo Serviço
              </CardTitle>
               <CardDescription>
                Precisa de um novo transporte? Preencha os detalhes abaixo para solicitar um orçamento.
              </CardDescription>
            </CardHeader>
             <CardContent>
               <NewQuoteForm />
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
    </>
  );
}
