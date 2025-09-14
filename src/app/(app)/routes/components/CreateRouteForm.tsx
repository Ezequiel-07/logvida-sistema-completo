
"use client";

import { useFormContext, Controller, useFieldArray } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Icons } from "@/components/icons";
import * as z from "zod";
import { AddressInput } from "@/components/AddressInput";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { saveNamedLocations } from "@/server/actions/locations";
import { toast } from "@/hooks/use-toast";
import type { NamedLocation } from "@/types/namedLocation";

export const addressObjectSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(10, "O endereço completo é obrigatório.").max(200),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

export const routeStopSchema = z.object({
    name: z.string().optional().nullable(),
    address: addressObjectSchema,
    loadingInstructions: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    status: z.enum(["pending", "completed", "skipped"]).optional().default("pending"),
});


export const routeFormSchema = z.object({
  name: z.string().min(1, "O nome da rota é obrigatório."),
  origin: routeStopSchema,
  intermediateStops: z.array(routeStopSchema).optional(),
  destination: routeStopSchema,
  totalDistanceKm: z.number().nullable(),
  totalDurationMinutes: z.number().nullable(),
  totalTollCost: z.number().nullable(),
});

export type RouteFormData = z.infer<typeof routeFormSchema>;

interface CreateRouteFormProps {
  onCalculateRoute: (optimize: boolean) => Promise<void>;
  isSaving?: boolean;
  onMoveStop?: (from: number, to: number) => void;
}

export function CreateRouteForm({ onCalculateRoute, isSaving, onMoveStop }: CreateRouteFormProps) {
  const { control, formState: { errors }, getValues, setValue } = useFormContext<RouteFormData>();
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "intermediateStops",
  });
  
  const handleSaveLocation = async (fieldNamePrefix: 'origin' | 'destination' | `intermediateStops.${number}`) => {
    const stopData = getValues(fieldNamePrefix);
    const instructions = fieldNamePrefix === 'origin' ? stopData.notes : stopData.loadingInstructions;

    if (!stopData.name || !stopData.address.description) {
        toast({
            title: "Dados incompletos",
            description: "É preciso preencher o Nome do Local e o Endereço para salvar.",
            variant: "destructive"
        });
        return;
    }
    
    toast({ title: "Salvando local...", description: `"${stopData.name}" será salvo para uso futuro.` });
    
    const result = await saveNamedLocations([{ 
        name: stopData.name, 
        address: stopData.address,
        instructions: instructions
    }]);
    
    if (result.success) {
        toast({ title: "Local Salvo!", description: `Agora você pode pesquisar por "${stopData.name}" ao criar rotas.` });
    } else {
        toast({ title: "Erro ao Salvar", description: result.error, variant: "destructive" });
    }
  }

  const handleLocationSelect = (
    fieldNamePrefix: 'origin' | 'destination' | `intermediateStops.${number}`,
    location: NamedLocation
  ) => {
    setValue(`${fieldNamePrefix}.name`, location.name);
    setValue(`${fieldNamePrefix}.address`, location.address);
    if (fieldNamePrefix === 'origin') {
        setValue('origin.notes', location.instructions);
    } else {
        setValue(`${fieldNamePrefix}.loadingInstructions`, location.instructions);
    }
  };


  const renderStopInput = (
    fieldNamePrefix: 'origin' | 'destination' | `intermediateStops.${number}`,
    title: string,
    isDraggable: boolean = false,
    index?: number
  ) => {
    
    const fieldErrors = fieldNamePrefix.startsWith('intermediate')
      ? errors.intermediateStops?.[index!]
      : errors[fieldNamePrefix as 'origin' | 'destination'];

    return (
      <div className="space-y-3 p-3 border rounded-md relative bg-muted/20">
         {isDraggable && onMoveStop && (
            <div className="absolute top-2 right-2 flex flex-col gap-1">
                <TooltipProvider>
                    <Tooltip><TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={() => onMoveStop(index!, index! - 1)}><Icons.chevronUp className="h-4 w-4" /></Button>
                    </TooltipTrigger><TooltipContent><p>Mover para Cima</p></TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={index! >= fields.length - 1} onClick={() => onMoveStop(index!, index! + 1)}><Icons.chevronDown className="h-4 w-4" /></Button>
                    </TooltipTrigger><TooltipContent><p>Mover para Baixo</p></TooltipContent></Tooltip>
                </TooltipProvider>
            </div>
         )}
         {fieldNamePrefix.includes('intermediate') && (
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="h-7 w-7 absolute top-2 left-2 text-destructive hover:text-destructive hover:bg-destructive/10"><Icons.delete className="h-4 w-4"/></Button>
         )}

        <h3 className="font-semibold text-primary pl-8">{title}</h3>
        
        <div className="space-y-2">
            <Label>Nome do Local</Label>
            <div className="flex items-center gap-2">
                 <Controller
                    name={`${fieldNamePrefix}.name` as const}
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="Ex: Hospital Central"
                        className="flex-grow"
                        value={field.value ?? ''}
                      />
                    )}
                  />
              <TooltipProvider>
                  <Tooltip>
                      <TooltipTrigger asChild>
                         <Button type="button" variant="outline" size="icon" onClick={() => handleSaveLocation(fieldNamePrefix)}><Icons.archive className="h-4 w-4"/></Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Salvar este nome, endereço e instruções para uso futuro</p></TooltipContent>
                  </Tooltip>
              </TooltipProvider>
            </div>
        </div>

        <div className="space-y-2">
            <Label>Endereço Completo</Label>
            <Controller
                name={`${fieldNamePrefix}.address` as const}
                control={control}
                render={({ field }) => (
                  <AddressInput
                    id={fieldNamePrefix}
                    value={field.value}
                    onChange={(address) => field.onChange(address)}
                    onLocationSelect={(location) => handleLocationSelect(fieldNamePrefix, location)}
                    showLabel={false}
                  />
                )}
            />
            {fieldErrors?.address?.description && <p className="text-destructive text-xs mt-1">{fieldErrors.address.description.message}</p>}
        </div>

        <div className="space-y-2">
            <Label>Instruções / Observações</Label>
            <Controller name={fieldNamePrefix === 'origin' ? 'origin.notes' : `${fieldNamePrefix}.loadingInstructions`} control={control} render={({field}) => <Textarea {...field} placeholder="Ex: Entregar na recepção, procurar por Maria." value={field.value ?? ""} />} />
        </div>
      </div>
    );
  };

  return (
    <Card className="border-none shadow-none p-0">
        <CardContent className="space-y-4 p-0">
            <div className="space-y-2">
                <Label htmlFor="name">Nome da Ordem de Serviço / Rota</Label>
                <Controller name="name" control={control} render={({field}) => <Input {...field} id="name" placeholder="Ex: Entrega Semanal Hospital X" />} />
                {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
            </div>

            <Separator />
            
            <div className="space-y-4">
                {renderStopInput('origin', 'Origem')}

                {fields.map((field, index) => (
                  <div key={field.id}>
                    {renderStopInput(`intermediateStops.${index}`, `Parada Intermediária ${index + 1}`, true, index)}
                  </div>
                ))}
                
                <div className="flex justify-center my-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => append({ name: "", address: { description: ""}, loadingInstructions: "", status: "pending" })} disabled={isSaving}>
                        <Icons.plusCircle className="mr-2 h-4 w-4" />Adicionar Parada Intermediária
                    </Button>
                </div>
                
                {renderStopInput('destination', 'Destino')}
            </div>

            <div className="flex justify-end items-center">
                 <div className="flex gap-2">
                    <TooltipProvider>
                       <Tooltip>
                           <TooltipTrigger asChild>
                              <Button type="button" variant="secondary" onClick={() => onCalculateRoute(true)} disabled={isSaving}><Icons.repeat className="mr-2 h-4 w-4"/>Otimizar</Button>
                           </TooltipTrigger>
                           <TooltipContent><p>Reorganiza as paradas intermediárias para a rota mais rápida.</p></TooltipContent>
                       </Tooltip>
                       <Tooltip>
                           <TooltipTrigger asChild>
                              <Button type="button" onClick={() => onCalculateRoute(false)} disabled={isSaving}><Icons.calculator className="mr-2 h-4 w-4"/>Calcular</Button>
                           </TooltipTrigger>
                           <TooltipContent><p>Calcula a distância e pedágios da rota na ordem atual.</p></TooltipContent>
                       </Tooltip>
                    </TooltipProvider>
                 </div>
            </div>
            
            <Separator />

            <div className="p-4 bg-muted/50 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">Resumo da Rota</h3>
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                        <Label>Distância Total</Label>
                        <p className="font-bold text-primary">{(getValues('totalDistanceKm') ?? 0).toFixed(1)} km</p>
                    </div>
                     <div>
                        <Label>Duração Estimada</Label>
                        <p className="font-bold">{Math.round(getValues('totalDurationMinutes') ?? 0)} min</p>
                    </div>
                     <div>
                        <Label>Custo Pedágios</Label>
                        <p className="font-bold">R$ {(getValues('totalTollCost') ?? 0).toFixed(2)}</p>
                    </div>
                </div>
            </div>

        </CardContent>
    </Card>
  );
}
