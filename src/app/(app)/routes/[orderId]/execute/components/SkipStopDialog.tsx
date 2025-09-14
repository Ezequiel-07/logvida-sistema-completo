
"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface SkipStopDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}

const skipReasons = [
    "Local Fechado",
    "Avisado previamente (sem entregas/coletas)",
    "Cliente ausente",
    "Problema no endereço",
    "Outro motivo (será registrado como 'Outro')",
];

export function SkipStopDialog({ isOpen, onOpenChange, onConfirm }: SkipStopDialogProps) {
  const [selectedReason, setSelectedReason] = useState<string>("");

  useEffect(() => {
    // Reset state when dialog is closed
    if (!isOpen) {
      setSelectedReason("");
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (selectedReason) {
      onConfirm(selectedReason);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pular Parada</DialogTitle>
          <DialogDescription>
            Selecione um motivo para pular esta parada. A ação será registrada na linha do tempo da rota.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label htmlFor="skip-reason">Motivo da Ocorrência:</Label>
          <RadioGroup 
            id="skip-reason"
            value={selectedReason} 
            onValueChange={setSelectedReason} 
            className="space-y-2"
          >
            {skipReasons.map((reason) => (
              <div key={reason} className="flex items-center space-x-2">
                <RadioGroupItem value={reason} id={reason} />
                <Label htmlFor={reason} className="font-normal">{reason}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedReason}>
            Confirmar e Pular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
