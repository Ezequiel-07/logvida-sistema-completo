// src/lib/googleMaps.ts
import { useJsApiLoader } from "@react-google-maps/api";

const googleMapsLibraries: (
  | "places"
  | "drawing"
  | "geometry"
  | "visualization"
)[] = ["places", "drawing", "geometry", "visualization"];

export const useSharedGoogleMapsLoader = () => {
  return useJsApiLoader({
    id: "google-maps-loader", // <-- esse ID será único no projeto inteiro
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
    libraries: googleMapsLibraries,
    version: "weekly",
    language: "pt-BR", 
    region: "BR",
    preventGoogleFontsLoading: true,
  });
};
