
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { toast } from "@/hooks/use-toast";
import { AddressInput } from "@/components/AddressInput";
import { useSharedGoogleMapsLoader } from "@/lib/googleMaps";
import { submitQuote } from "@/server/actions/quotes";
import { useAuth } from "@/hooks/useAuth";
import type { Client } from "@/types/client";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Textarea } from "@/components/ui/textarea";
import type { NamedLocation } from "@/types/namedLocation";

const addressObjectSchema = z.object({
  description: z.string().min(10, "O endereço completo é obrigatório."),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

const quoteStopSchema = z.object({
  name: z.string().optional().nullable(),
  address: addressObjectSchema,
  instructions: z.string().optional().nullable(),
});

const quoteFormSchema = z.object({
  message: z.string().optional(),
  boxCount: z.coerce.number().optional(),
  origin: quoteStopSchema, // Tornando a rota obrigatória
  destination: quoteStopSchema, // Tornando a rota obrigatória
  intermediateStops: z.array(quoteStopSchema).optional(),
}).refine(data => {
    return data.origin?.address?.description && data.destination?.address?.description;
}, {
    message: "Origem e destino são obrigatórios para a solicitação.",
    path: ["destination", "address", "description"],
});

type QuoteFormData = z.infer<typeof quoteFormSchema>;

export function NewQuoteForm() {
  const { currentUser } = useAuth();
  const { isLoaded: isMapScriptLoaded } = useSharedGoogleMapsLoader();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [clientData, setClientData] = useState<Client | null>(null);

  const fetchClientData = useCallback(async () => {
    if (!currentUser?.clientId) return;
    try {
      const clientRef = doc(db, "clients", currentUser.clientId);
      const docSnap = await getDoc(clientRef);
      if (docSnap.exists()) {
        setClientData({ id: docSnap.id, ...docSnap.data() } as Client);
      }
    } catch (error) {
      toast({
        title: "Erro ao buscar dados",
        description: "Não foi possível carregar seus dados de cliente.",
        variant: "destructive",
      });
    }
  }, [currentUser?.clientId]);

  useEffect(() => {
    fetchClientData();
  }, [fetchClientData]);

  const form = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      boxCount: 1,
      message: "",
      origin: { name: "", address: { description: "" }, instructions: "" },
      destination: { name: "", address: { description: "" }, instructions: "" },
      intermediateStops: [],
    },
  });

  const { control, register, handleSubmit, formState: { errors }, setValue } = form;

  const { fields, append, remove } = useFieldArray({
    control: control,
    name: "intermediateStops"
  });

  const onSubmit = async (data: QuoteFormData) => {
    if (!currentUser || !clientData) {
      toast({ title: "Erro", description: "Informações do cliente não encontradas.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    const result = await submitQuote({
      name: clientData.companyName,
      document: clientData.cnpj,
      email: clientData.email,
      phone: clientData.phone,
      message: `Solicitação de cliente: ${data.message || 'N/A'}`,
      clientId: currentUser.clientId ?? undefined,
      boxCount: data.boxCount,
      origin: {
        name: data.origin?.name || "",
        address: data.origin?.address?.description || "",
        instructions: data.origin?.instructions || "",
      },
      destination: {
        name: data.destination?.name || "",
        address: data.destination?.address?.description || "",
        instructions: data.destination?.instructions || "",
      },
      intermediateStops: (data.intermediateStops || []).map(s => ({
        name: s.name || "",
        address: s.address?.description || "",
        instructions: s.instructions || "",
      })),
    });

    if (result.success) {
      toast({ title: "Solicitação Enviada!", description: "Recebemos seu pedido de orçamento e entraremos em contato." });
      setIsSubmitted(true);
      form.reset();
    } else {
      toast({ title: "Erro ao Enviar", description: result.error, variant: "destructive" });
    }

    setIsSubmitting(false);
  };

  if (isSubmitted) {
    return (
      <div className="w-full text-center p-4">
        <Icons.checkCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
        <CardTitle className="text-xl">Obrigado!</CardTitle>
        <CardDescription className="mt-2 text-sm">Sua solicitação foi enviada. Nossa equipe entrará em contato em breve.</CardDescription>
        <Button onClick={() => setIsSubmitted(false)} className="mt-6">Fazer Nova Solicitação</Button>
      </div>
    );
  }
  
  const handleLocationSelect = (
    fieldNamePrefix: 'origin' | 'destination' | `intermediateStops.${number}`,
    location: NamedLocation
  ) => {
    setValue(`${fieldNamePrefix}.name`, location.name);
    setValue(`${fieldNamePrefix}.address`, location.address);
    setValue(`${fieldNamePrefix}.instructions`, location.instructions);
  };

  const renderStopInput = (fieldNamePrefix: 'origin' | 'destination' | `intermediateStops.${number}`, title: string) => {
    const fieldErrors = fieldNamePrefix.startsWith('intermediate')
      ? errors.intermediateStops?.[parseInt(fieldNamePrefix.split('.')[1])]
      : errors[fieldNamePrefix as 'origin' | 'destination'];

    return (
      <div className="space-y-3">
        <h3 className="font-semibold text-primary">{title}</h3>
        <Controller
          name={`${fieldNamePrefix}.name` as const}
          control={control}
          render={({ field }) => (
            <Input {...field} placeholder={`Nome do Local (Ex: Sede, Depósito, etc.)`} disabled={isSubmitting} value={field.value ?? ''} />
          )}
        />
        <Controller
          name={`${fieldNamePrefix}.address` as const}
          control={control}
          render={({ field }) => (
            <AddressInput
              id={fieldNamePrefix}
              value={field.value}
              onChange={(address) => field.onChange(address)}
              onLocationSelect={(location) => handleLocationSelect(fieldNamePrefix, location)}
              label=""
              showLabel={false}
              disabled={isSubmitting}
            />
          )}
        />
        {fieldErrors?.address?.description && (
          <p className="text-xs text-destructive">
            {fieldErrors.address.description.message}
          </p>
        )}
         <Controller
            name={`${fieldNamePrefix}.instructions` as const}
            control={control}
            render={({ field }) => (
                <Textarea
                    {...field}
                    placeholder="Instruções/Observações (Ex: Procurar por João)"
                    className="text-sm"
                    disabled={isSubmitting}
                    value={field.value ?? ''}
                />
            )}
        />
      </div>
    );
  };


  return (
    <Card className="border-none shadow-none">
       <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4 p-0">
            
            <div className="space-y-2">
                <Label htmlFor="boxCount">Quantidade de Caixas (Opcional)</Label>
                <Input id="boxCount" type="number" {...register("boxCount")} min={1} disabled={isSubmitting} />
            </div>

            <div className="space-y-4">
              {renderStopInput("origin", "Origem")}
              
              {fields.map((field, index) => (
                <div key={field.id} className="space-y-3 p-3 border rounded-md relative bg-muted/30">
                   <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={isSubmitting} className="text-destructive h-7 w-7 absolute top-1 right-1"><Icons.delete className="h-4 w-4" /></Button>
                   {renderStopInput(`intermediateStops.${index}`, `Parada ${index + 1}`)}
                </div>
              ))}

              <Button type="button" variant="outline" size="sm" onClick={() => append({ name: "", address: { description: "" }, instructions: "" })} disabled={isSubmitting}><Icons.plusCircle className="mr-2 h-4 w-4" /> Adicionar Parada</Button>
              
              {renderStopInput("destination", "Destino")}
            </div>
             <div>
                <Label htmlFor="message">Mensagem Adicional (Opcional)</Label>
                <Textarea id="message" {...register("message")} disabled={isSubmitting} rows={3} placeholder="Forneça detalhes adicionais sobre sua necessidade de transporte..."/>
             </div>
        </CardContent>
        <CardFooter className="mt-6 p-0">
          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
            Enviar Solicitação de Orçamento
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
