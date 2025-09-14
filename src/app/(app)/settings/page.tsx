

// src/app/(app)/settings/page.tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { User, NotificationSettings } from "@/types/user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getAuth,
  updatePassword as updateFirebaseAuthPassword,
} from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import { resizeImage } from "@/lib/image-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { clearAllPendingCheckpoints, getPendingCheckpoints } from "@/lib/offline-sync";


export default function SettingsPage() {
  const {
    currentUser,
    updateUserProfile,
    isLoading: isAuthLoading,
  } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [profilePicturePreview, setProfilePicturePreview] = useState<
    string | null
  >(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [notificationPrefs, setNotificationPrefs] =
    useState<NotificationSettings | null>(null);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State for offline data management
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setPhone(currentUser.phone || "");
      setProfilePicturePreview(currentUser.profilePictureUrl || null);
      setNotificationPrefs(currentUser.notificationSettings);

      const checkPending = async () => {
        const pending = await getPendingCheckpoints();
        setPendingSyncCount(pending.length);
      };
      checkPending();
    }
  }, [currentUser]);

  const handleNotificationChange = async (
    key: keyof NotificationSettings,
    value: boolean,
  ) => {
    if (!currentUser || !notificationPrefs) return;
    const newPrefs = { ...notificationPrefs, [key]: value };
    setNotificationPrefs(newPrefs); // Optimistic update
    const success = await updateUserProfile({ notificationSettings: newPrefs });
    if (success) {
      toast({
        title: "Preferência salva",
        description: "Sua preferência de notificação foi atualizada.",
        duration: 2000,
      });
    } else {
      setNotificationPrefs(notificationPrefs); // Revert on failure
      toast({
        title: "Erro ao Salvar",
        description: "Não foi possível salvar sua preferência.",
        variant: "destructive",
      });
    }
  };

  const handleEditProfile = () => {
    if (currentUser) {
      setName(currentUser.name || "");
      setPhone(currentUser.phone || "");
      setProfilePicturePreview(currentUser.profilePictureUrl || null);
      setNewPassword("");
      setConfirmNewPassword("");
    }
    setIsEditingProfile(true);
  };

  const handleCancelEditProfile = () => {
    if (currentUser) {
      setName(currentUser.name || "");
      setPhone(currentUser.phone || "");
      setProfilePicturePreview(currentUser.profilePictureUrl || null);
    }
    setIsEditingProfile(false);
  };

  const handleSaveProfile = async () => {
    if (!currentUser) return;

    const auth = getAuth();
    const firebaseUser = auth.currentUser;
    setIsSavingProfile(true);

    const updatedProfileData: Partial<User> = {
      name,
      phone: phone || null,
    };

    if (profilePicturePreview !== currentUser.profilePictureUrl) {
      updatedProfileData.profilePictureUrl = profilePicturePreview;
    }

    let passwordChanged = false;
    if (newPassword) {
      if (newPassword !== confirmNewPassword) {
        toast({
          title: "Erro na Senha",
          description: "As novas senhas não coincidem.",
          variant: "destructive",
        });
        setIsSavingProfile(false);
        return;
      }
      if (newPassword.length < 6) {
        toast({
          title: "Erro na Senha",
          description: "A nova senha deve ter pelo menos 6 caracteres.",
          variant: "destructive",
        });
        setIsSavingProfile(false);
        return;
      }
      if (firebaseUser) {
        try {
          await updateFirebaseAuthPassword(firebaseUser, newPassword);
          passwordChanged = true;
        } catch (error) {
          const firebaseError = error as FirebaseError;
          const errorMessage =
            firebaseError.code === "auth/requires-recent-login"
              ? "Por favor, faça login novamente para atualizar sua senha."
              : "Não foi possível atualizar sua senha.";
          toast({
            title: "Erro ao Salvar Senha",
            description: errorMessage,
            variant: "destructive",
          });
          setIsSavingProfile(false);
          return;
        }
      }
    }

    const success = await updateUserProfile(updatedProfileData);
    if (success) {
      toast({
        title: "Perfil Atualizado",
        description: `Suas informações foram salvas.${
          passwordChanged ? " Sua senha também foi atualizada." : ""
        }`,
      });
      setNewPassword("");
      setConfirmNewPassword("");
      setIsEditingProfile(false);
    } else {
      toast({
        title: "Erro ao Salvar",
        description: "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
    }
    setIsSavingProfile(false);
  };

  const handleProfilePictureChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsSavingProfile(true);
      try {
        const resizedDataUrl = await resizeImage(file, { maxWidth: 512 });
        setProfilePicturePreview(resizedDataUrl);
      } catch {
        toast({
          title: "Erro na Foto",
          description: "Não foi possível processar a imagem.",
          variant: "destructive",
        });
      } finally {
        setIsSavingProfile(false);
      }
    }
  };
  
  const handleCopyUserId = () => {
    if (currentUser?.id) {
        navigator.clipboard.writeText(currentUser.id);
        toast({
            title: "ID Copiado!",
            description: "O ID do usuário foi copiado para a área de transferência.",
        });
    }
  };

  const handleClearPendingData = async () => {
    setIsSavingProfile(true);
    try {
        await clearAllPendingCheckpoints();
        setPendingSyncCount(0);
        toast({
            title: "Dados Offline Limpos",
            description: "Todos os check-ins pendentes foram removidos com sucesso.",
        });
    } catch (error) {
        toast({
            title: "Erro ao Limpar",
            description: "Não foi possível limpar os dados offline.",
            variant: "destructive",
        });
    } finally {
        setIsSavingProfile(false);
        setIsClearConfirmOpen(false);
    }
  }

  const triggerFileInput = () => fileInputRef.current?.click();
  const userInitial =
    currentUser?.name?.charAt(0).toUpperCase() ||
    currentUser?.email?.charAt(0).toUpperCase() ||
    "U";

  if (isAuthLoading || !currentUser || !notificationPrefs) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Icons.loader className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
    <div className="container mx-auto py-8 max-w-3xl">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary flex items-center gap-2">
            <Icons.settings className="h-7 w-7" /> Configurações
          </CardTitle>
          <CardDescription>
            Gerencie suas informações de perfil e preferências do aplicativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <section>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-foreground">
                Perfil do Usuário
              </h3>
              {!isEditingProfile && (
                <Button variant="outline" onClick={handleEditProfile} size="sm">
                  <Icons.edit className="mr-2 h-4 w-4" /> Editar Perfil
                </Button>
              )}
            </div>
            {isEditingProfile ? (
              <div className="space-y-6 p-4 border rounded-lg bg-muted/20">
                <div className="flex flex-col items-center space-y-3">
                  <Avatar
                    className="h-24 w-24 cursor-pointer"
                    onClick={triggerFileInput}
                  >
                    <AvatarImage
                      src={profilePicturePreview || undefined}
                      alt="Avatar do Usuário"
                      data-ai-hint="user avatar"
                    />
                    <AvatarFallback className="text-3xl">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleProfilePictureChange}
                    accept="image/*"
                    className="hidden"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={triggerFileInput}
                      disabled={isSavingProfile}
                    >
                      {isSavingProfile && (
                        <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <Icons.upload className="mr-2 h-4 w-4" /> Alterar Foto
                    </Button>
                    {profilePicturePreview && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setProfilePicturePreview(null);
                        }}
                        disabled={isSavingProfile}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Icons.delete className="mr-2 h-4 w-4" /> Remover Foto
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 bg-background"
                    disabled={isSavingProfile}
                  />
                </div>
                <div>
                  <Label htmlFor="profileEmail">Endereço de E-mail</Label>
                  <Input
                    id="profileEmail"
                    type="email"
                    value={currentUser.email}
                    className="mt-1 bg-background"
                    disabled={true}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Celular (WhatsApp)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(XX) XXXXX-XXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 bg-background"
                    disabled={isSavingProfile}
                  />
                </div>
                {currentUser?.role === "driver" && currentUser.vehicle && (
                  <div className="p-3 border rounded-md bg-background">
                    <Label>Veículo Atribuído</Label>
                    <p className="text-sm font-semibold">
                      {currentUser.vehicle.name} ({currentUser.vehicle.plate})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      O veículo é gerenciado na tela de motoristas.
                    </p>
                  </div>
                )}
                <Separator />
                <div>
                  <Label htmlFor="newPassword">
                    Nova Senha (mín. 6 caracteres)
                  </Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="Deixe em branco para não alterar"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 bg-background"
                    disabled={isSavingProfile}
                  />
                </div>
                <div>
                  <Label htmlFor="confirmNewPassword">
                    Confirmar Nova Senha
                  </Label>
                  <Input
                    id="confirmNewPassword"
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="mt-1 bg-background"
                    disabled={isSavingProfile}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    onClick={handleCancelEditProfile}
                    disabled={isSavingProfile}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                    {isSavingProfile ? (
                      <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Icons.checkCircle className="mr-2 h-4 w-4" />
                    )}
                    Salvar Alterações
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm p-4 border rounded-lg">
                <div className="flex items-center gap-6">
                  <Avatar className="h-20 w-20">
                    <AvatarImage
                      src={currentUser?.profilePictureUrl || undefined}
                      alt="Avatar do Usuário"
                      data-ai-hint="user avatar"
                    />
                    <AvatarFallback className="text-2xl">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1 overflow-hidden">
                    <div className="flex">
                      <span className="font-medium w-28 text-muted-foreground shrink-0">
                        Nome:
                      </span>
                      <span>{currentUser?.name}</span>
                    </div>
                    <div className="flex">
                      <span className="font-medium w-28 text-muted-foreground shrink-0">
                        Email:
                      </span>
                      <span>{currentUser?.email}</span>
                    </div>
                    <div className="flex">
                      <span className="font-medium w-28 text-muted-foreground shrink-0">
                        Celular:
                      </span>
                      <span>{currentUser?.phone || "Não informado"}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="font-medium w-28 text-muted-foreground shrink-0">ID do Usuário:</span>
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="truncate">{currentUser?.id}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleCopyUserId}>
                            <Icons.copy className="h-3.5 w-3.5" />
                            <span className="sr-only">Copiar ID</span>
                        </Button>
                      </div>
                    </div>
                    {currentUser?.role === "driver" && (
                      <>
                        <div className="flex">
                          <span className="font-medium w-28 text-muted-foreground shrink-0">
                            Veículo:
                          </span>
                          <span>{currentUser.vehicle?.name || "Nenhum"}</span>
                        </div>
                        <div className="flex">
                          <span className="font-medium w-28 text-muted-foreground shrink-0">
                            Placa:
                          </span>
                          <span>{currentUser.vehicle?.plate || "N/A"}</span>
                        </div>
                      </>
                    )}
                    <div className="flex">
                      <span className="font-medium w-28 text-muted-foreground shrink-0">
                        Função:
                      </span>
                      <span className="capitalize">{currentUser?.role}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
          <Separator />
          <section>
            <h3 className="text-xl font-semibold text-foreground mb-4">
              Preferências de Notificação
            </h3>
            <div className="space-y-3">
              {[
                { id: "newRouteAssignedNotification", label: "Novas rotas atribuídas" },
                { id: "routeStartNotification", label: "Início de rota" },
                { id: "routeCompletionNotification", label: "Conclusão de rota" },
                { id: "routeUpdateNotification", label: "Alterações em rotas em andamento" },
                { id: "routeCancellationNotification", label: "Cancelamento de rota" },
                { id: "chatMessageNotification", label: "Novas mensagens no chat" },
                { id: "checkpointDelayNotification", label: "Atrasos em pontos de controle" },
              ].map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <Label
                    htmlFor={item.id}
                    className="font-normal flex-grow cursor-pointer"
                  >
                    {item.label}
                  </Label>
                  <Switch
                    id={item.id}
                    checked={
                      notificationPrefs[
                        item.id as keyof NotificationSettings
                      ] ?? false
                    }
                    onCheckedChange={(checked) =>
                      handleNotificationChange(
                        item.id as keyof NotificationSettings,
                        checked,
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <section>
             <h3 className="text-xl font-semibold text-foreground mb-4">Gerenciamento de Dados Offline</h3>
             <Card className="bg-destructive/5 border-destructive/20">
                <CardHeader>
                    <CardTitle className="text-lg text-destructive flex items-center gap-2">
                       <Icons.warning className="h-5 w-5" /> Zona de Perigo
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-destructive/80">
                      Use esta opção se estiver com problemas de sincronização. Isso irá remover todos os check-ins que estão salvos no seu aparelho e que ainda não foram enviados ao servidor.
                    </p>
                </CardContent>
                <CardFooter>
                    <Button variant="destructive" onClick={() => setIsClearConfirmOpen(true)} disabled={pendingSyncCount === 0}>
                        <Icons.delete className="mr-2 h-4 w-4" />
                        Limpar {pendingSyncCount > 0 ? `(${pendingSyncCount})` : ''} Check-ins Pendentes
                    </Button>
                </CardFooter>
             </Card>
          </section>
        </CardContent>
      </Card>
    </div>

    <AlertDialog open={isClearConfirmOpen} onOpenChange={setIsClearConfirmOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta ação irá deletar permanentemente todos os check-ins pendentes de sincronização salvos neste dispositivo. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearPendingData} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                    Sim, limpar dados
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
