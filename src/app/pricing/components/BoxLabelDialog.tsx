
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Order, BoxDetails } from "@/types/order";
import { Icons } from "@/components/icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { Separator } from "@/components/ui/separator";

interface BoxLabelDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
}

interface IndividualBox {
    boxNumber: number;
    totalBoxes: number;
    type: string;
    weight: number;
}

export function BoxLabelDialog({
  isOpen,
  onOpenChange,
  order,
}: BoxLabelDialogProps) {
  const [originUrl, setOriginUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOriginUrl(window.location.origin);
    }
  }, []);

  if (!order) return null;
  
  const generateIndividualBoxList = (boxDetails?: BoxDetails[]): IndividualBox[] => {
      if (!boxDetails || boxDetails.length === 0) {
          // Fallback for old orders that might only have numberOfBoxes
          const total = order.numberOfBoxes || 0;
          return Array.from({ length: total }, (_, i) => ({
              boxNumber: i + 1,
              totalBoxes: total,
              type: "Padrão",
              weight: 0
          }));
      }

      const individualBoxes: IndividualBox[] = [];
      const totalBoxes = boxDetails.reduce((sum, item) => sum + item.quantity, 0);
      let currentBoxNumber = 1;

      boxDetails.forEach(detail => {
          for (let i = 0; i < detail.quantity; i++) {
              individualBoxes.push({
                  boxNumber: currentBoxNumber++,
                  totalBoxes: totalBoxes,
                  type: detail.type,
                  weight: detail.weight
              });
          }
      });
      return individualBoxes;
  };

  const labels = generateIndividualBoxList(order.boxDetails);
  const totalBoxes = labels.length;

  if (totalBoxes === 0) return null;


  const handlePrint = () => {
    window.print();
  };
  
  const trackingUrl = originUrl ? `${originUrl}/track/${order.id}` : "";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl print:shadow-none print:border-none print:max-w-full print:p-0">
        <DialogHeader className="print:hidden">
          <DialogTitle className="text-2xl text-primary">
            Etiquetas das Caixas
          </DialogTitle>
          <DialogDescription>
            Pedido Nº: {order.id.substring(0, 8)} - Cliente:{" "}
            {order.clientCompanyName}. Total de {totalBoxes}{" "}
            etiqueta(s).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(100vh-250px)] p-1 print:max-h-full print:p-0 print:overflow-visible">
          <div
            id="labels-content"
            className="grid grid-cols-1 gap-4 p-4 print:grid-cols-1 print:gap-2 print:p-1"
          >
            {labels.map((box) => (
              <div
                key={box.boxNumber}
                className="p-3 border-2 border-dashed border-gray-400 rounded-md bg-white text-black text-xs print:border-solid print:border-black print:break-inside-avoid print:text-[10px] flex flex-col justify-between"
                style={{ height: '7.5cm', minHeight: '7.5cm', width: '10cm', margin: 'auto' }} 
              >
                {/* Header */}
                <div className="flex justify-between items-center gap-2 border-b border-dashed pb-1">
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="relative w-8 h-8">
                            <Image
                                src="/logvida-logo.png"
                                alt="Logotipo LogVida"
                                fill
                                sizes="32px"
                                className="object-contain"
                            />
                        </div>
                    </div>
                    <div className="text-right text-[8px] print:text-[7px]">
                       <p className="font-bold">{order.vidaLogInfo.name}</p>
                       <p>{order.vidaLogInfo.address}</p>
                       <p>CNPJ: {order.vidaLogInfo.cnpj} | CEP: {order.vidaLogInfo.cep}</p>
                    </div>
                </div>
                
                {/* Body */}
                <div className="flex-grow flex flex-col justify-center my-1 gap-1">
                   <div>
                       <p className="font-bold text-sm">REMETENTE:</p>
                       <p className="font-semibold text-xs">{order.originStop.name}</p>
                       <p className="text-xs">{order.originStop.address.description}</p>
                   </div>
                   <Separator className="my-1 border-dashed" />
                   <div>
                      <p className="font-bold text-sm">DESTINATÁRIO:</p>
                      <p className="font-semibold text-xs">{order.destinationStop.name || order.clientCompanyName}</p>
                      <p className="text-xs">{order.destinationStop.address.description}</p>
                   </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-end gap-2 mt-auto pt-1 border-t border-dashed print:border-solid">
                  <div className="space-y-0.5">
                    <p><span className="font-semibold">PEDIDO Nº:</span> {order.id.substring(0, 8)}</p>
                    <p><span className="font-semibold">VOLUME:</span> {box.boxNumber} / {totalBoxes}</p>
                    <p><span className="font-semibold">TIPO/PESO:</span> {box.type} / {box.weight.toFixed(1)} kg</p>
                  </div>
                  {trackingUrl && (
                    <div className="flex flex-col items-center">
                      <QRCodeSVG value={trackingUrl} size={50} includeMargin={false} level="L" />
                      <span className="text-[7px] print:text-[6px] mt-0.5">RASTREIE AQUI</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="print:hidden">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={handlePrint}>
            <Icons.printer className="mr-2 h-4 w-4" /> Imprimir Etiquetas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
