
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
import type { Order } from "@/types/order";
import { Icons } from "@/components/icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import Image from "next/image";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { QRCodeSVG } from "qrcode.react";

interface InvoiceDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
}

export function InvoiceDialog({
  isOpen,
  onOpenChange,
  order,
}: InvoiceDialogProps) {
  const [originUrl, setOriginUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOriginUrl(window.location.origin);
    }
  }, []);

  if (!order) return null;

  const trackingUrl = originUrl ? `${originUrl}/track/${order.id}` : "";

  const handlePrint = () => {
    window.print();
  };

  const formatOrderIdForDisplay = (orderId: string) => {
    // Attempt to extract last digits or format; example keeps last 7
    const parts = orderId.split("-");
    if (parts.length > 1) {
      return parts[parts.length - 1].slice(-7).padStart(7, "0");
    }
    return orderId.slice(-7).padStart(7, "0");
  };

  const formatServiceDescription = () => {
    if (order.pricingMethod === "perBox") {
      return `Serviços prestados de transporte de ${order.numberOfBoxes || 0} volume(s).`;
    }
    return `Serviços prestados de transporte - Rota: ${order.selectedRouteName || "Não especificada"}.`;
  };

  const vidaLogInfo = order.vidaLogInfo || {
    name: "LogVida Transportes - Vida em movimento",
    cnpj: "37.519.142/0001-70",
    address:
      "Rua Vigário José Poggel, nº 494, Sala 905, Prédio Royalle - Tubarão, SC",
    cep: "88704-240",
  };

  const vidaLogTelefone = "(48) 9999-8888"; // Placeholder
  const vidaLogEmail = "contato@vidalog.com"; // Placeholder
  const vidaLogIM = "78071"; // Placeholder from image example for EZEQUIEL TRANSPORTES

  const dataEmissaoNota = order.createdAt
    ? format(parseISO(order.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })
    : "N/D";
  const dataFatoGerador = order.serviceDate
    ? format(parseISO(order.serviceDate), "dd/MM/yyyy", { locale: ptBR })
    : order.createdAt
      ? format(parseISO(order.createdAt), "dd/MM/yyyy", { locale: ptBR })
      : "N/D";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl print:shadow-none print:border-none print:max-w-full print:p-0">
        <DialogHeader className="print:hidden p-6 pb-0">
          <DialogTitle className="text-2xl text-primary">
            Nota Fiscal de Serviços (Simulação)
          </DialogTitle>
          <DialogDescription>
            Simulação de NFS-e para o pedido de {order.clientCompanyName}.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(100vh-220px)] md:max-h-[80vh] print:max-h-full print:overflow-visible">
          <div
            className="p-4 bg-white text-black text-[9px] print:p-1 print:text-[8px]"
            id="invoice-content"
          >
            {/* Top Section: Prefeitura & Nota Fiscal Info */}
            <div className="flex justify-between items-start mb-2 border-b border-black pb-2">
              <div className="text-left">
                {/* Placeholder for Prefeitura Logo - using text for now */}
                <div className="flex items-center mb-1">
                  {/* <Icons.officeBuilding className="h-8 w-8 mr-2" />  Or a generic icon */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-10 w-10 mr-2 opacity-70"
                    data-ai-hint="city hall building"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm4.5 9.75a.75.75 0 01.75-.75h3a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0v-1.5h-1.5a.75.75 0 01-.75-.75zm7.5-3a.75.75 0 00-1.5 0v5.25a.75.75 0 001.5 0V12.75zM12 12.75a.75.75 0 01.75-.75h3a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0v-1.5h-1.5a.75.75 0 01-.75-.75zM3 8.25a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <p className="font-bold text-[11px] print:text-[10px]">
                      PREFEITURA DE TUBARÃO
                    </p>
                    <p className="text-[10px] print:text-[9px]">
                      SECRETARIA DA FAZENDA
                    </p>
                  </div>
                </div>
              </div>
              <div className="text-right space-y-0.5">
                <div className="flex items-start justify-end">
                  <div className="mr-2 text-left">
                    <p className="font-bold text-[10px] print:text-[9px]">
                      NOTA FISCAL
                    </p>
                    <p className="text-[9px] print:text-[8px]">NÚMERO RPS</p>
                    <p className="text-[9px] print:text-[8px]">
                      DATA DE EMISSÃO NOTA
                    </p>
                    <p className="text-[9px] print:text-[8px]">
                      DATA DO FATO GERADOR
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg print:text-base">
                      {formatOrderIdForDisplay(order.id)}
                    </p>
                    <p className="text-[9px] print:text-[8px]">---</p>{" "}
                    {/* Placeholder RPS */}
                    <p className="text-[9px] print:text-[8px]">
                      {dataEmissaoNota}
                    </p>
                    <p className="text-[9px] print:text-[8px]">
                      {dataFatoGerador}
                    </p>
                  </div>
                </div>
                <div className="ml-auto flex flex-col items-center">
                  {trackingUrl ? (
                    <>
                      <QRCodeSVG
                        value={trackingUrl}
                        size={60}
                        includeMargin={false}
                        level="L"
                      />
                      <span className="text-[7px] print:text-[6px] mt-0.5">
                        RASTREIE AQUI
                      </span>
                    </>
                  ) : (
                    <div className="w-[60px] h-[60px] bg-muted flex items-center justify-center text-center text-[7px] p-1">
                      QR Code indisponível
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Prestador de Serviços */}
            <div className="border border-black p-1 mb-1">
              <p className="font-bold text-center bg-gray-200 text-[10px] print:text-[9px] py-0.5">
                PRESTADOR DE SERVIÇOS
              </p>
              <div className="grid grid-cols-[1fr_auto] gap-x-1">
                <div>
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    RAZÃO SOCIAL PRESTADOR
                  </span>
                  <p className="font-semibold">
                    {vidaLogInfo.name.toUpperCase()}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    NOME FANTASIA PRESTADOR
                  </span>
                  <p className="font-semibold">
                    {vidaLogInfo.name.toUpperCase()}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-[3fr_1fr] gap-x-1">
                <div>
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    ENDEREÇO
                  </span>
                  <p>
                    {vidaLogInfo.address.toUpperCase()},{" "}
                    {vidaLogInfo.cep}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    COMPLEMENTO
                  </span>
                  <p>&nbsp;</p> {/* Placeholder Complemento */}
                </div>
              </div>
              <div className="grid grid-cols-6 gap-x-0.5 border-t border-black mt-0.5 pt-0.5">
                <div className="border-r border-black pr-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    Nº CPF/CNPJ
                  </span>
                  <p>{vidaLogInfo.cnpj}</p>
                </div>
                <div className="border-r border-black px-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    SIMPLES NACIONAL
                  </span>
                  <p>SIM</p>
                </div>
                <div className="border-r border-black px-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    INSC. MUNICIPAL
                  </span>
                  <p>{vidaLogIM}</p>
                </div>
                <div className="border-r border-black px-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    INSC. ESTADUAL
                  </span>
                  <p>&nbsp;</p>
                </div>
                <div className="border-r border-black px-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    TELEFONE
                  </span>
                  <p>{vidaLogTelefone}</p>
                </div>
                <div className="pl-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    E-MAIL
                  </span>
                  <p>{vidaLogEmail}</p>
                </div>
              </div>
            </div>

            {/* Tomador de Serviços */}
            <div className="border border-black p-1 mb-1">
              <p className="font-bold text-center bg-gray-200 text-[10px] print:text-[9px] py-0.5">
                TOMADOR DE SERVIÇOS
              </p>
              <div className="grid grid-cols-[1fr_auto] gap-x-1">
                <div>
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    NOME DO TOMADOR
                  </span>
                  <p className="font-semibold">
                    {order.clientCompanyName.toUpperCase()}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    COMPLEMENTO
                  </span>
                  <p>&nbsp;</p> {/* Placeholder Complemento */}
                </div>
              </div>
              <p>
                <span className="text-muted-foreground text-[8px] print:text-[7px]">
                  ENDEREÇO
                </span>{" "}
                {order.clientAddress.toUpperCase()}
              </p>
              <div className="grid grid-cols-5 gap-x-0.5 border-t border-black mt-0.5 pt-0.5">
                <div className="col-span-1 border-r border-black pr-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    Nº CPF/CNPJ
                  </span>
                  <p>{order.clientCnpj}</p>
                </div>
                <div className="border-r border-black px-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    INSC. MUNICIPAL
                  </span>
                  <p>&nbsp;</p>
                </div>
                <div className="border-r border-black px-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    INSC. ESTADUAL
                  </span>
                  <p>&nbsp;</p>
                </div>
                <div className="border-r border-black px-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    TELEFONE
                  </span>
                  <p>{order.clientPhone}</p>
                </div>
                <div className="pl-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    E-MAIL
                  </span>
                  <p>{order.clientEmail}</p>
                </div>
              </div>
            </div>

            {/* Discriminação dos Serviços */}
            <div className="border border-black p-1 mb-1">
              <p className="font-bold text-center bg-gray-200 text-[10px] print:text-[9px] py-0.5">
                DISCRIMINAÇÃO DOS SERVIÇOS
              </p>
              <table className="w-full mt-0.5">
                <thead>
                  <tr className="border-b border-t border-black">
                    <th className="w-[5%] text-left py-0.5 px-0.5 border-r border-black text-[8px] print:text-[7px]">
                      UNID
                    </th>
                    <th className="w-[8%] text-left py-0.5 px-0.5 border-r border-black text-[8px] print:text-[7px]">
                      QUANT.
                    </th>
                    <th className="text-left py-0.5 px-0.5 border-r border-black text-[8px] print:text-[7px]">
                      DESCRIÇÃO DO SERVIÇO
                    </th>
                    <th className="w-[12%] text-right py-0.5 px-0.5 border-r border-black text-[8px] print:text-[7px]">
                      VALOR UNIT.
                    </th>
                    <th className="w-[12%] text-right py-0.5 px-0.5 text-[8px] print:text-[7px]">
                      VALOR TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-0.5 px-0.5 border-r border-black align-top">
                      1
                    </td>
                    <td className="py-0.5 px-0.5 border-r border-black align-top">
                      1
                    </td>
                    <td className="py-0.5 px-0.5 border-r border-black align-top">
                      {formatServiceDescription()}
                    </td>
                    <td className="py-0.5 px-0.5 border-r border-black align-top text-right">
                      {order.totalValue.toFixed(2).replace(".", ",")}
                    </td>
                    <td className="py-0.5 px-0.5 align-top text-right">
                      {order.totalValue.toFixed(2).replace(".", ",")}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-1">
                <span className="text-muted-foreground text-[8px] print:text-[7px]">
                  OBSERVAÇÕES
                </span>
                <div className="border border-black min-h-[20px] p-0.5 mt-0.5">
                  <p>&nbsp;</p> {/* Placeholder for observations if any */}
                </div>
              </div>
            </div>

            {/* Total Geral and Impostos Table */}
            <div className="border border-black p-0 mb-1">
              <div className="grid grid-cols-[1fr_auto] bg-gray-200 px-1 py-0.5">
                <span className="text-[8px] print:text-[7px]">&nbsp;</span>
                <span className="font-bold text-[9px] print:text-[8px]">
                  TOTAL GERAL: {order.totalValue.toFixed(2).replace(".", ",")}
                </span>
              </div>
              <table className="w-full text-center">
                <thead>
                  <tr className="bg-gray-200">
                    <td
                      colSpan={6}
                      className="font-bold border-r border-black text-[9px] print:text-[8px] py-0.5"
                    >
                      IMPOSTOS FEDERAIS
                    </td>
                    <td
                      colSpan={3}
                      className="font-bold text-[9px] print:text-[8px] py-0.5"
                    >
                      IMPOSTOS MUNICIPAIS
                    </td>
                  </tr>
                  <tr className="border-t border-b border-black">
                    <th className="w-[8%] border-r border-black text-[8px] print:text-[7px]">
                      RETIDO
                    </th>
                    <th className="w-[8%] border-r border-black text-[8px] print:text-[7px]">
                      INSS
                    </th>
                    <th className="w-[8%] border-r border-black text-[8px] print:text-[7px]">
                      PIS/PASEP
                    </th>
                    <th className="w-[8%] border-r border-black text-[8px] print:text-[7px]">
                      COFINS
                    </th>
                    <th className="w-[8%] border-r border-black text-[8px] print:text-[7px]">
                      IR
                    </th>
                    <th className="w-[8%] border-r border-black text-[8px] print:text-[7px]">
                      CSLL
                    </th>
                    <th className="w-[12%] border-r border-black text-[8px] print:text-[7px]">
                      ALÍQUOTA ISS
                    </th>
                    <th className="w-[15%] border-r border-black text-[8px] print:text-[7px]">
                      BASE DE CÁLCULO
                    </th>
                    <th className="w-[12%] text-[8px] print:text-[7px]">
                      TOTAL ISS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-black">
                    <td className="border-r border-black py-0.5">NÃO</td>
                    <td className="border-r border-black py-0.5">0,00</td>
                    <td className="border-r border-black py-0.5">0,00</td>
                    <td className="border-r border-black py-0.5">0,00</td>
                    <td className="border-r border-black py-0.5">0,00</td>
                    <td className="border-r border-black py-0.5">0,00</td>
                    <td className="border-r border-black py-0.5">2,0100%</td>
                    <td className="border-r border-black py-0.5">
                      {order.totalValue.toFixed(2).replace(".", ",")}
                    </td>
                    <td className="py-0.5">
                      {(order.totalValue * 0.0201).toFixed(2).replace(".", ",")}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="grid grid-cols-[1fr_auto] bg-gray-200 px-1 py-0.5">
                <span className="text-[8px] print:text-[7px]">&nbsp;</span>
                <span className="font-bold text-[9px] print:text-[8px]">
                  VALOR LÍQUIDO: {order.totalValue.toFixed(2).replace(".", ",")}
                </span>
              </div>
            </div>

            {/* Descrição Atividade, Descontos, Outras Informações */}
            <div className="border border-black p-1 mb-1">
              <p>
                <span className="text-muted-foreground text-[8px] print:text-[7px]">
                  DESCRIÇÃO DA ATIVIDADE DA PRESTAÇÃO
                </span>{" "}
                LC116: 16.01 - TRANSPORTE DE CARGAS / CNAE: 4930-2/01
              </p>
            </div>

            <div className="border border-black p-1 mb-1">
              <p className="font-bold text-center bg-gray-200 text-[10px] print:text-[9px] py-0.5">
                DESCONTOS / DEDUÇÕES
              </p>
              <div className="grid grid-cols-4 text-center border-t border-b border-black">
                <div className="border-r border-black py-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    DESC. CONDICIONADO
                  </span>
                  <p>R$ 0,00</p>
                </div>
                <div className="border-r border-black py-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    DESC. INCONDICIONADO
                  </span>
                  <p>R$ 0,00</p>
                </div>
                <div className="border-r border-black py-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    DEDUÇÕES (Materiais e Outros)
                  </span>
                  <p>R$ 0,00</p>
                </div>
                <div className="py-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    OUTRAS DEDUÇÕES
                  </span>
                  <p>R$ 0,00</p>
                </div>
              </div>
            </div>

            <div className="border border-black p-1 mb-1">
              <p className="font-bold text-center bg-gray-200 text-[10px] print:text-[9px] py-0.5">
                OUTRAS INFORMAÇÕES
              </p>
              <div className="grid grid-cols-4 text-center border-t border-b border-black">
                <div className="border-r border-black py-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    NATUREZA DA OPERAÇÃO
                  </span>
                  <p>Tributado no Município</p>
                </div>
                <div className="border-r border-black py-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    RECOLHIMENTO
                  </span>
                  <p>ISS A RECOLHER PELO PRESTADOR</p>
                </div>
                <div className="border-r border-black py-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    LOCAL DA PRESTAÇÃO DO SERVIÇO
                  </span>
                  <p>TUBARÃO - SC</p>
                </div>
                <div className="py-0.5">
                  <span className="text-muted-foreground text-[8px] print:text-[7px]">
                    VALOR APROXIMADO DOS TRIBUTOS (IBPT)
                  </span>
                  <p>
                    R${" "}
                    {(order.totalValue * 0.1345).toFixed(2).replace(".", ",")}{" "}
                    (13.45%)
                  </p>
                </div>
              </div>
            </div>

            {/* Validação */}
            <div className="text-center space-y-0.5 mb-2">
              <p>
                ESTE DOCUMENTO PODE SER VALIDADO NO SITE
                www.prefeituramoderna.com.br
              </p>
              <p>CÓDIGO DE VALIDAÇÃO - bbe51d8c168e7a54f55b7876a1d4091d</p>
              <p className="text-[8px] print:text-[7px]">
                ASSINATURA DIGITAL ANTIGA - 5cb4597ee2f257fb8dc2ca7da617d8a6
                (Exemplo)
              </p>
            </div>

            {/* Recibo */}
            <div className="border border-black p-1">
              <div className="flex justify-between items-end">
                <p className="max-w-[70%]">
                  Recebi(emos) de {vidaLogInfo.name.toUpperCase()} o(s)
                  serviço(s) indicado(s) à nota fiscal eletrônica de serviço de
                  número {formatOrderIdForDisplay(order.id)}.
                </p>
                <div className="text-right">
                  <span className="text-[8px] print:text-[7px]">
                    NÚMERO NOTA FISCAL
                  </span>
                  <p className="font-bold text-lg print:text-base">
                    {formatOrderIdForDisplay(order.id)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-dashed border-black">
                <div className="border-t border-black pt-0.5 text-center">
                  <span className="text-[8px] print:text-[7px]">
                    Data do Recebimento
                  </span>
                </div>
                <div className="border-t border-black pt-0.5 text-center">
                  <span className="text-[8px] print:text-[7px]">
                    Identificação e assinatura do recebedor
                  </span>
                </div>
              </div>
            </div>
            <p className="text-right text-[8px] print:text-[7px] mt-0.5">
              BAUHAUS SISTEMAS ®
            </p>
          </div>
        </ScrollArea>

        <DialogFooter className="print:hidden p-6 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={handlePrint}>
            <Icons.printer className="mr-2 h-4 w-4" /> Imprimir / Salvar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
