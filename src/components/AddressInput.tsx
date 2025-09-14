
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Building } from "lucide-react";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useSharedGoogleMapsLoader } from "@/lib/googleMaps";
import type { NamedLocation } from "@/types/namedLocation";
import { getNamedLocations } from "@/server/actions/locations";
import { Skeleton } from "./ui/skeleton";
import { ScrollArea } from "./ui/scroll-area";
import { Card } from "./ui/card";
import { Separator } from "./ui/separator";

interface Address {
    description: string;
    latitude?: number | null;
    longitude?: number | null;
}

interface AddressInputProps {
  id: string;
  label?: string;
  placeholder?: string;
  value?: Address;
  onChange?: (value: Address) => void;
  className?: string;
  disabled?: boolean;
  showLabel?: boolean;
  onLocationSelect?: (location: NamedLocation) => void;
}

export function AddressInput({
  id,
  label,
  placeholder = "Insira o endereço ou nome do local",
  value,
  onChange,
  className,
  disabled,
  showLabel = true,
  onLocationSelect,
}: AddressInputProps) {
  const { isLoaded: isGoogleMapsScriptLoaded, loadError } = useSharedGoogleMapsLoader();
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const serviceRef = useRef<google.maps.places.AutocompleteService | null>(null);

  const [inputValue, setInputValue] = useState(value?.description || "");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [googlePredictions, setGooglePredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [namedLocations, setNamedLocations] = useState<NamedLocation[]>([]);
  const [filteredNamedLocations, setFilteredNamedLocations] = useState<NamedLocation[]>([]);

  useEffect(() => {
    setInputValue(value?.description || "");
  }, [value?.description]);

  useEffect(() => {
    const fetchNamedLocations = async () => {
      const result = await getNamedLocations();
      if (result.locations) {
        setNamedLocations(result.locations);
      }
    };
    fetchNamedLocations();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputValue(text);
    setShowSuggestions(true);

    if (text) {
      // Filter named locations
      const lowercasedText = text.toLowerCase();
      setFilteredNamedLocations(
        namedLocations.filter(loc => loc.name.toLowerCase().includes(lowercasedText) || loc.address.description.toLowerCase().includes(lowercasedText))
      );

      // Get Google predictions
      if (serviceRef.current) {
        serviceRef.current.getPlacePredictions(
          { input: text, componentRestrictions: { country: "br" } },
          (predictions) => {
            setGooglePredictions(predictions || []);
          }
        );
      }
    } else {
      setFilteredNamedLocations([]);
      setGooglePredictions([]);
    }
  };

  const handleSelectGooglePlace = (prediction: google.maps.places.AutocompletePrediction) => {
    if (!window.google) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ placeId: prediction.place_id }, (results, status) => {
      if (status === 'OK' && results?.[0]) {
        const place = results[0];
        const newAddress: Address = {
          description: place.formatted_address || prediction.description,
          latitude: place.geometry?.location?.lat() ?? null,
          longitude: place.geometry?.location?.lng() ?? null,
        };
        setInputValue(newAddress.description);
        if (onChange) onChange(newAddress);
        setShowSuggestions(false);
      }
    });
  };

  const handleSelectNamedLocation = (location: NamedLocation) => {
    setInputValue(location.address.description);
    if (onLocationSelect) {
        onLocationSelect(location);
    } else if (onChange) {
        onChange(location.address);
    }
    setShowSuggestions(false);
  };

  useEffect(() => {
    if (isGoogleMapsScriptLoaded && !serviceRef.current) {
      serviceRef.current = new window.google.maps.places.AutocompleteService();
    }
  }, [isGoogleMapsScriptLoaded]);

  const hasSuggestions = filteredNamedLocations.length > 0 || googlePredictions.length > 0;

  if (loadError) {
    return (
      <div className={className}>
         {showLabel && <Label htmlFor={id}>{label}</Label>}
         <p className="text-destructive text-sm">Erro ao carregar Google Maps.</p>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full", className)}>
      {showLabel && <Label htmlFor={id}>{label}</Label>}
      <div className={cn("relative", showLabel && "mt-1")}>
        <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground z-10" />
        <Input
            ref={inputRef}
            id={id}
            placeholder={!isGoogleMapsScriptLoaded ? "Carregando..." : placeholder}
            className="pl-10"
            disabled={disabled || !isGoogleMapsScriptLoaded}
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} // Delay to allow click
            autoComplete="off"
        />
      </div>

      {showSuggestions && hasSuggestions && (
        <Card className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto">
          <ScrollArea className="h-full">
            {filteredNamedLocations.length > 0 && (
                <>
                    <p className="p-2 text-xs font-semibold text-muted-foreground">Locais Salvos</p>
                    {filteredNamedLocations.map((loc) => (
                        <div key={loc.id} onMouseDown={() => handleSelectNamedLocation(loc)} className="p-2 flex items-start gap-2 hover:bg-accent cursor-pointer">
                            <Building className="h-4 w-4 mt-1 text-primary shrink-0" />
                            <div>
                                <p className="text-sm font-medium">{loc.name}</p>
                                <p className="text-xs text-muted-foreground">{loc.address.description}</p>
                            </div>
                        </div>
                    ))}
                    <Separator />
                </>
            )}
            {googlePredictions.length > 0 && (
                 <>
                    <p className="p-2 text-xs font-semibold text-muted-foreground">Sugestões do Google</p>
                    {googlePredictions.map((prediction) => (
                        <div key={prediction.place_id} onMouseDown={() => handleSelectGooglePlace(prediction)} className="p-2 flex items-center gap-2 hover:bg-accent cursor-pointer">
                             <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                            <p className="text-sm">{prediction.description}</p>
                        </div>
                    ))}
                 </>
            )}
          </ScrollArea>
        </Card>
      )}

      {!isGoogleMapsScriptLoaded && <Skeleton className="h-10 w-full" />}
    </div>
  );
}
