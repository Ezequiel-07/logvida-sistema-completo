

"use client";

import { useSearchParams } from "next/navigation";
import { InvoiceDisplay } from "./components/InvoiceDisplay";
import { Suspense } from "react";
import { Icons } from "@/components/icons";

export default function GeneratedInvoicePage() {
    const searchParams = useSearchParams();

    const clientId = searchParams.get("clientId");
    const orderIds = searchParams.getAll("orderIds");

    if (!clientId) {
      return <div>ID do cliente inválido.</div>;
    }

    if (orderIds.length === 0) {
        return <div>Nenhuma Ordem de Serviço selecionada.</div>;
    }

    return (
        <Suspense fallback={<div className="flex items-center justify-center h-40"><Icons.loader className="h-8 w-8 animate-spin"/></div>}>
            <div className="w-full max-w-5xl mx-auto py-8 printable-area print:p-2 print:max-w-full">
                <InvoiceDisplay clientId={clientId} orderIds={orderIds} />
            </div>
        </Suspense>
    )
}
