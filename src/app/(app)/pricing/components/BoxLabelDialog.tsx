
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
    const contentToPrint = document.getElementById('labels-content')?.innerHTML;
    const printWindow = window.open('', '_blank', 'height=800,width=800');
    
    if (printWindow) {
        printWindow.document.write(`
            <html>
                <head>
                    <title>Imprimir Etiquetas</title>
                    <style>
                        @media print {
                            @page {
                                size: A4;
                                margin: 0;
                            }
                            body {
                                margin: 0;
                                padding: 1cm 0; /* Add padding to top and bottom for the whole page */
                                font-family: sans-serif;
                            }
                            /* Main container for a single label */
                            .label-container {
                                page-break-inside: avoid !important; /* Prevents the label from being split across pages */
                                border: 1px solid black !important;
                                height: 7.5cm;
                                width: 10cm;
                                padding: 8px;
                                display: flex; /* Use flexbox for robust layout */
                                flex-direction: column;
                                justify-content: space-between;
                                box-sizing: border-box;
                                margin: 0.5cm auto; /* Vertical spacing and horizontal centering */
                            }
                             /* Header: Logo and company info */
                            .header-flex {
                                display: flex;
                                justify-content: space-between;
                                align-items: center;
                                border-bottom: 1px dashed #ccc;
                                padding-bottom: 4px;
                            }
                            .logo-container {
                                display: flex;
                                align-items: center;
                            }
                            .logo-container img {
                                max-width: 32px;
                                max-height: 32px;
                                height: auto;
                                width: auto;
                            }
                            .header-flex .company-info {
                                text-align: right;
                                font-size: 7px;
                            }
                             /* Body: Sender and recipient */
                             .body-content {
                                flex-grow: 1; /* Allows body to take up remaining space */
                                display: flex;
                                flex-direction: column;
                                justify-content: center; /* Vertically center the content */
                                gap: 4px;
                                padding: 4px 0;
                             }
                             .body-content .address-block {
                                font-size: 10px;
                             }
                             .body-content .address-block .label {
                                font-weight: bold;
                                font-size: 12px;
                             }
                             .body-content .separator {
                                border-top: 1px dashed #ccc;
                                margin: 4px 0;
                             }
                              /* Footer: Order details and QR code */
                            .footer-flex {
                                display: flex;
                                justify-content: space-between;
                                align-items: flex-end; /* Align to the bottom */
                                border-top: 1px dashed #ccc;
                                padding-top: 4px;
                                font-size: 9px;
                            }
                            .qr-code-container {
                                text-align: center;
                            }
                            .qr-code-container .qr-code-text {
                                font-size: 7px;
                                margin-top: 2px;
                            }
                        }
                        /* Styles for the preview in the popup, not for printing */
                        body:not(:has(.label-container)) {
                             display: flex;
                             flex-direction: column;
                             align-items: center;
                        }
                    </style>
                </head>
                <body>
                    ${contentToPrint}
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    }
  };
  
  const trackingUrl = originUrl ? `${originUrl}/track/${order.id}` : "";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl text-primary">
            Etiquetas das Caixas
          </DialogTitle>
          <DialogDescription>
            Pedido Nº: {order.id.substring(0, 8)} - Cliente:{" "}
            {order.clientCompanyName}. Total de {totalBoxes}{" "}
            etiqueta(s).
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto p-4 bg-muted/30 rounded-md">
            <div id="labels-content" className="grid grid-cols-1 gap-4">
                {labels.map((box) => (
                <div
                    key={box.boxNumber}
                    className="label-container p-3 border-2 border-dashed border-gray-400 rounded-md bg-white text-black text-xs flex flex-col justify-between"
                    style={{ height: '7.5cm', width: '10cm', margin: 'auto' }} 
                >
                {/* Header */}
                <div className="header-flex flex justify-between items-center gap-2 border-b border-dashed pb-1">
                    <div className="logo-container flex items-center gap-2 shrink-0">
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
                    <div className="company-info text-right text-[8px]">
                        <p className="font-bold">{order.vidaLogInfo.name}</p>
                        <p>{order.vidaLogInfo.address}</p>
                        <p>CNPJ: {order.vidaLogInfo.cnpj} | CEP: {order.vidaLogInfo.cep}</p>
                    </div>
                </div>
                
                {/* Body */}
                <div className="body-content flex-grow flex flex-col justify-center my-1 gap-1">
                    <div className="address-block">
                        <p className="label">REMETENTE:</p>
                        <p className="font-semibold">{order.originStop.name}</p>
                        <p>{order.originStop.address.description}</p>
                    </div>
                    <div className="separator" />
                    <div className="address-block">
                    <p className="label">DESTINATÁRIO:</p>
                    <p className="font-semibold">{order.destinationStop.name || order.clientCompanyName}</p>
                    <p>{order.destinationStop.address.description}</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="footer-flex flex justify-between items-end gap-2 mt-auto pt-1 border-t border-dashed">
                    <div className="space-y-0.5">
                    <p><span className="font-semibold">PEDIDO Nº:</span> {order.id.substring(0, 8)}</p>
                    <p><span className="font-semibold">VOLUME:</span> {box.boxNumber} / {totalBoxes}</p>
                    <p><span className="font-semibold">TIPO/PESO:</span> {box.type} / {box.weight.toFixed(1)} kg</p>
                    </div>
                    {trackingUrl && (
                    <div className="qr-code-container flex flex-col items-center">
                        <QRCodeSVG value={trackingUrl} size={50} includeMargin={false} level="L" />
                        <span className="qr-code-text text-[7px] mt-0.5">RASTREIE AQUI</span>
                    </div>
                    )}
                </div>
                </div>
            ))}
            </div>
        </div>

        <DialogFooter>
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
