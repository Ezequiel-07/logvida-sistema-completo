
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";

export function UserAvatarDisplay() {
  const { currentUser } = useAuth();

  const userInitial = currentUser?.name
    ? currentUser.name.charAt(0).toUpperCase()
    : currentUser?.email
    ? currentUser.email.charAt(0).toUpperCase()
    : "U";

  return (
    <Avatar className="h-8 w-8">
      <AvatarImage
        src={currentUser?.profilePictureUrl || undefined}
        alt="Avatar do Usuário"
        data-ai-hint="user avatar"
      />
      <AvatarFallback>{userInitial}</AvatarFallback>
    </Avatar>
  );
}
