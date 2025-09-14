

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Icons } from "@/components/icons";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import Webcam from "react-webcam";
import { resizeImage } from "@/lib/image-utils";
import Image from 'next/image';
import { SignaturePad } from "./SignaturePad";
import type { CheckpointConfirmationDetails } from "@/types/order";

type ConfirmationValue = "yes" | "no" | "na" | "postponed";

interface RouteStopBase {
  address: { description: string };
  type: "origin" | "intermediate" | "destination";
}

interface OriginStop extends RouteStopBase { type: "origin"; }
interface IntermediateStop extends RouteStopBase { type: "intermediate"; }
interface DestinationStop extends RouteStopBase { type: "destination"; }

type AnyRouteStop = OriginStop | IntermediateStop | DestinationStop;


interface CheckpointDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  stop: AnyRouteStop | null;
  onConfirm: (details: CheckpointConfirmationDetails) => void;
  isProcessing: boolean;
  isOnline: boolean;
}

type PhotoSection = 'loading' | 'delivery' | 'collection' | 'unloading';

export function CheckpointDialog({ isOpen, onOpenChange, stop, onConfirm, isProcessing, isOnline }: CheckpointDialogProps) {
  const webcamRef = useRef<Webcam>(null);
  const signaturePadRef = useRef<{ clear: () => void; getSignature: () => string | null }>(null); // Ref para o SignaturePad


  // States for photos
  const [loadingPhotos, setLoadingPhotos] = useState<string[]>([]);
  const [deliveryPhotos, setDeliveryPhotos] = useState<string[]>([]);
  const [collectionPhotos, setCollectionPhotos] = useState<string[]>([]);
  const [unloadingPhotos, setUnloadingPhotos] = useState<string[]>([]);

  // States for form inputs
  const [notes, setNotes] = useState("");
  const [loadingStatus, setLoadingStatus] = useState<ConfirmationValue | "">("");
  const [deliveryStatus, setDeliveryStatus] = useState<ConfirmationValue | "">("");
  const [collectionStatus, setCollectionStatus] = useState<ConfirmationValue | "">("");
  const [unloadingStatus, setUnloadingStatus] = useState<ConfirmationValue | "">("");


  // States for camera UI
  const [activeCameraSection, setActiveCameraSection] = useState<PhotoSection | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Reset all states when dialog opens
      setLoadingPhotos([]);
      setDeliveryPhotos([]);
      setCollectionPhotos([]);
      setUnloadingPhotos([]);
      setNotes("");
      setLoadingStatus("");
      setDeliveryStatus("");
      setCollectionStatus("");
      setUnloadingStatus("");
      setActiveCameraSection(null);
      setIsCapturing(false);
      signaturePadRef.current?.clear(); // Limpa a assinatura
    }
  }, [isOpen]);

  const handleCaptureAndProcess = useCallback(async () => {
    if (webcamRef.current && activeCameraSection) {
      setIsCapturing(true);
      const imageSrc = webcamRef.current.getScreenshot({ width: 1280, height: 720 });
      if (imageSrc) {
        try {
            const resizedImage = await resizeImage(imageSrc, { maxWidth: 1280 }); // Use higher resolution
            const setPhotoStateAction = {
                'loading': setLoadingPhotos,
                'delivery': setDeliveryPhotos,
                'collection': setCollectionPhotos,
                'unloading': setUnloadingPhotos,
            }[activeCameraSection];
            
            setPhotoStateAction(prev => [...prev, resizedImage]);
        } catch (error) {
            console.error("Error resizing image:", error);
        }
      }
      setIsCapturing(false);
      setActiveCameraSection(null); // Close camera after capture
    }
  }, [activeCameraSection]);
  
  const removePhoto = (section: PhotoSection, index: number) => {
     const actionMap = {
        'loading': setLoadingPhotos,
        'delivery': setDeliveryPhotos,
        'collection': setCollectionPhotos,
        'unloading': setUnloadingPhotos,
     };
     actionMap[section](prev => prev.filter((_, i) => i !== index));
  };


  const mapRadioValueToConfirmation = (value?: ConfirmationValue | ""): boolean | "n/d" | "postponed" | null => {
    if (value === "yes") return true;
    if (value === "no") return false;
    if (value === "na") return "n/d";
    if (value === "postponed") return "postponed";
    return null;
  };

  const handleConfirm = () => {
    if (!stop) return;
    const signatureDataUrl = signaturePadRef.current?.getSignature(); // Pega a assinatura

    const confirmationDetails: CheckpointConfirmationDetails = {
      notes: notes || null,
      loadingPhotoProofDataUrls: loadingPhotos,
      deliveryPhotoProofDataUrls: deliveryPhotos,
      collectionPhotoProofDataUrls: collectionPhotos,
      unloadingPhotoProofDataUrls: unloadingPhotos,
      signatureDataUrl: signatureDataUrl || null, // Garante que seja null em vez de undefined
      loadingConfirmed: stop.type === 'origin' ? mapRadioValueToConfirmation(loadingStatus) : null,
      deliveryConfirmed: stop.type === 'intermediate' ? mapRadioValueToConfirmation(deliveryStatus) : null,
      collectionConfirmed: stop.type === 'intermediate' ? mapRadioValueToConfirmation(collectionStatus) : null,
      unloadingConfirmed: stop.type === 'destination' ? mapRadioValueToConfirmation(unloadingStatus) : null,
    };

    onConfirm(confirmationDetails);
  };

  const canConfirm = () => {
    if (!stop || activeCameraSection) return false;
    if (stop.type === "origin") return loadingStatus !== "";
    if (stop.type === "intermediate") return deliveryStatus !== "" && collectionStatus !== "";
    if (stop.type === "destination") return unloadingStatus !== "";
    return false;
  };

  const confirmationOptions: { value: ConfirmationValue; label: string }[] = [
    { value: 'yes', label: 'Sim' },
    { value: 'no', label: 'Não' },
    { value: 'na', label: 'Não se aplica' },
  ];
  const destinationOptions = [...confirmationOptions, { value: 'postponed', label: 'Adiado' } as const];

  const renderPhotoSection = (section: PhotoSection, title: string, photos: string[]) => (
    <div>
        <Label>{title}</Label>
        <div className="flex flex-wrap gap-2 mt-2 border p-2 rounded-md bg-muted/50 min-h-[68px]">
            {photos.map((photo, index) => (
                <div key={index} className="relative w-16 h-16">
                    <Image src={photo} alt={`Foto ${index + 1}`} width={64} height={64} className="rounded-md object-cover w-16 h-16" />
                    <Button variant="destructive" size="icon" onClick={() => removePhoto(section, index)} className="absolute -top-1 -right-1 h-5 w-5 rounded-full z-10">
                       <Icons.xCircle className="h-4 w-4" />
                    </Button>
                </div>
            ))}
            <Button type="button" variant="outline" size="icon" onClick={() => setActiveCameraSection(section)} className="w-16 h-16 shrink-0">
                <Icons.camera className="h-6 w-6" />
            </Button>
        </div>
    </div>
  );

  if (!stop) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Confirmar Parada - { stop.type === 'origin' ? 'Origem' : stop.type === 'intermediate' ? 'Parada Intermediária' : 'Destino' }
          </DialogTitle>
          <DialogDescription>
            Registre as informações do ponto de parada.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="space-y-2">
            <Label>Endereço:</Label>
            <p className="text-sm text-muted-foreground">{stop.address.description}</p>
          </div>
          
          {activeCameraSection ? (
            <div className="space-y-2">
                <Label>Câmera</Label>
                <div className="relative w-full aspect-[9/16] bg-black rounded-md overflow-hidden max-h-[40vh]">
                    <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: "environment", width: 720, height: 1280 }} className="w-full h-full object-cover" />
                </div>
                 <div className="flex gap-2">
                    <Button onClick={handleCaptureAndProcess} disabled={isCapturing} className="w-full">
                        {isCapturing ? <Icons.loader className="animate-spin mr-2" /> : <Icons.camera className="mr-2"/>}
                        {isCapturing ? 'Processando...' : 'Capturar Foto'}
                    </Button>
                    <Button variant="outline" onClick={() => setActiveCameraSection(null)}>Cancelar</Button>
                </div>
            </div>
          ) : (
             <div className="space-y-4">
                {stop.type === "origin" && (
                    <div className="space-y-4">
                      <div>
                        <Label>Carga foi realizada?</Label>
                         <RadioGroup value={loadingStatus} onValueChange={(v) => setLoadingStatus(v as ConfirmationValue)} className="flex space-x-4 mt-2">
                          {confirmationOptions.map(({ value, label }) => ( <div key={value} className="flex items-center space-x-2"><RadioGroupItem value={value} id={`loading-${value}`} /><Label htmlFor={`loading-${value}`}>{label}</Label></div>))}
                        </RadioGroup>
                      </div>
                      {renderPhotoSection('loading', 'Prova Fotográfica de Carregamento:', loadingPhotos)}
                    </div>
                )}
                {stop.type === "intermediate" && (
                  <div className="space-y-4">
                      <div>
                        <Label>Houve entrega?</Label>
                        <RadioGroup value={deliveryStatus} onValueChange={(v) => setDeliveryStatus(v as ConfirmationValue)} className="flex space-x-4 mt-2">
                          {confirmationOptions.map(({ value, label }) => ( <div key={value} className="flex items-center space-x-2"><RadioGroupItem value={value} id={`delivery-${value}`} /><Label htmlFor={`delivery-${value}`}>{label}</Label></div>))}
                        </RadioGroup>
                        {renderPhotoSection('delivery', 'Comprovação de Entrega:', deliveryPhotos)}
                      </div>
                      <div className="border-t pt-4">
                        <Label>Houve coleta?</Label>
                         <RadioGroup value={collectionStatus} onValueChange={(v) => setCollectionStatus(v as ConfirmationValue)} className="flex space-x-4 mt-2">
                          {confirmationOptions.map(({ value, label }) => ( <div key={value} className="flex items-center space-x-2"><RadioGroupItem value={value} id={`collection-${value}`} /><Label htmlFor={`collection-${value}`}>{label}</Label></div>))}
                        </RadioGroup>
                        {renderPhotoSection('collection', 'Comprovação de Coleta:', collectionPhotos)}
                      </div>
                  </div>
                )}
                {stop.type === "destination" && (
                    <div className="space-y-4">
                        <div>
                            <Label>Descarga foi realizada?</Label>
                            <RadioGroup value={unloadingStatus} onValueChange={(v) => setUnloadingStatus(v as ConfirmationValue)} className="flex space-x-4 mt-2">
                                {destinationOptions.map(({ value, label }) => ( <div key={value} className="flex items-center space-x-2"><RadioGroupItem value={value} id={`unloading-${value}`} /><Label htmlFor={`unloading-${value}`}>{label}</Label></div>))}
                            </RadioGroup>
                        </div>
                        {unloadingStatus === 'yes' && (
                            <div className="space-y-2">
                                <Label>Assinatura do Recebedor</Label>
                                <SignaturePad ref={signaturePadRef} />
                            </div>
                        )}
                        {renderPhotoSection('unloading', 'Prova Fotográfica de Descarregamento:', unloadingPhotos)}
                    </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="notes">Notas Adicionais (Opcional):</Label>
                  <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                </div>
             </div>
          )}

        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm() || isProcessing}>
             {isProcessing && <Icons.loader className="mr-2 h-4 w-4 animate-spin" />}
             {isOnline ? "Confirmar" : "Salvar Localmente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { CheckpointConfirmationDetails };
