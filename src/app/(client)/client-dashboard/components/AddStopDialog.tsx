
"use client";

import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icons } from "@/components/icons";
import { toast } from "@/hooks/use-toast";
import { AddressInput } from "@/components/AddressInput";
import { Textarea } from "@/components/ui/textarea";
import type { Order } from "@/types/order";
import { addStopToOrder } from "@/server/actions/orders";

const addStopSchema = z.object({
  name: z.string().optional().nullable(),
  address: z.object({
      description: z.string().min(10, "O endereço é obrigatório e deve ser completo."),
      latitude: z.number().optional().nullable(),
      longitude: z.number().optional().nullable()
  }),
  instructions: z.string().optional().nullable(),
});

type AddStopFormData = z.infer<typeof addStopSchema>;

interface AddStopDialogProps {
  order: Order | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onStopAdded: () => void;
}

export function AddStopDialog({ order, isOpen, onOpenChange, onStopAdded }: AddStopDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { control, handleSubmit, formState: { errors }, reset } = useForm<AddStopFormData>({
    resolver: zodResolver(addStopSchema),
    defaultValues: {
      name: "",
      address: { description: "" },
      instructions: "",
    },
  });

  // Reset form when dialog opens with a new order
  useEffect(() => {
    if (isOpen) {
        reset({ name: "", address: { description: "" }, instructions: "" });
    }
  }, [isOpen, reset]);

  if (!order) {
    return null;
  }

  const onSubmit = async (data: AddStopFormData) => {
    setIsSubmitting(true);
    toast({ title: "Processando...", description: "Adicionando parada e recalculando a rota." });

    const result = await addStopToOrder(order.id, {
      name: data.name || null,
      address: {
        id: `addr_new_${Date.now()}`, // Add a temporary ID
        description: data.address.description,
        latitude: data.address.latitude,
        longitude: data.address.longitude,
      },
      loadingInstructions: data.instructions || null,
    });
    
    if (result.success) {
      toast({
        title: "Parada Adicionada!",
        description: "A rota foi atualizada e o motorista será notificado.",
      });
      onStopAdded(); // This will close the dialog and reset state on the parent
    } else {
      toast({
        title: "Erro ao Adicionar Parada",
        description: result.error || "Não foi possível atualizar o pedido.",
        variant: "destructive",
      });
    }

    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent>
            <DialogHeader>
                 <DialogTitle>Adicionar Novo Destino à Ordem de Serviço <span className="text-primary">{order.id.substring(0,8)}</span></DialogTitle>
                 <DialogDescription>A nova parada será adicionada como o destino final da rota. A rota e os custos serão recalculados.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div>
                <Label htmlFor="stop-name">Nome do Local (Opcional)</Label>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <Input {...field} id="stop-name" placeholder="Ex: Hospital Central" disabled={isSubmitting} value={field.value ?? ""} />
                  )}
                />
              </div>
              <div>
                <Label htmlFor="stop-address">Endereço do Novo Destino</Label>
                <Controller
                  name="address"
                  control={control}
                  render={({ field }) => (
                    <AddressInput
                      id="stop-address"
                      value={field.value}
                      onChange={(newAddress) => {
                        field.onChange(newAddress);
                      }}
                      disabled={isSubmitting}
                      showLabel={false}
                    />
                  )}
                />
                {errors.address?.description && <p className="text-xs text-destructive mt-1">{errors.address.description.message}</p>}
              </div>
              <div>
                <Label htmlFor="stop-instructions">Instruções para o Motorista (Opcional)</Label>
                <Controller
                  name="instructions"
                  control={control}
                  render={({ field }) => (
                    <Textarea {...field} id="stop-instructions" placeholder="Ex: Entregar na recepção, procurar por Maria." disabled={isSubmitting} value={field.value ?? ""} />
                  )}
                />
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
                    Adicionar e Recalcular
                </Button>
              </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>
  );
}
