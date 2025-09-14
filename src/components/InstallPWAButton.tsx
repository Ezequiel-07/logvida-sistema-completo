"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button"; // Assuming you use shadcn/ui buttons

declare global {
  interface Window {
    deferredPrompt: any; // Type for the beforeinstallprompt event
  }
}

export default function InstallPWAButton() {
  const [showInstallButton, setShowInstallButton] = useState(false);

  useEffect(() => {
    const handlePromptReady = (event: Event) => {
      // The event is now available in window.deferredPrompt
      setShowInstallButton(true);
      console.log("PWA prompt is ready and button is shown.");
    };

    // Listen for the custom event dispatched in layout.tsx
    window.addEventListener("pwa-prompt-ready", handlePromptReady);

    // Check if the app is already installed (basic checks)
    // This might need more robust logic depending on your needs
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone
    ) {
      setShowInstallButton(false);
    }

    return () => {
      // Clean up the event listener
      window.removeEventListener("pwa-prompt-ready", handlePromptReady);
    };
  }, []);

  const handleInstallClick = async () => {
    if (window.deferredPrompt) {
      // Show the install prompt
      window.deferredPrompt.prompt();

      // Wait for the user to respond to the prompt
      const { outcome } = await window.deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);

      // We've used the prompt, and it can't be used again.
      window.deferredPrompt = null;
      setShowInstallButton(false);
    }
  };

  if (!showInstallButton) {
    return null; // Don't render the button if the prompt is not ready or app is installed
  }

  return (
    // You can style this button to be discreet.
    // Using shadcn/ui Button with a minimal variant as an example.
    <Button
      variant="ghost" // Use a ghost or link variant for discreteness
      size="sm"
      onClick={handleInstallClick}
      className="text-blue-500 hover:text-blue-600 p-0 h-auto"
    >
      Instalar App
    </Button>
  );
}
