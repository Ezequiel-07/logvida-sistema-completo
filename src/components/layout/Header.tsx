
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Menu,
  Bell,
  Search,
  Check,
  Trash2,
  MessageSquareWarning,
} from "lucide-react";
import { Icons, IconName } from "@/components/icons";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Input } from "../ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useNotifications } from "@/hooks/useNotifications";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AppNotification } from "@/types/notification";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { UserAvatarMenu } from "./UserAvatarMenu";
import { useChat } from "@/contexts/ChatContext";

export function Header() {
  const { toggleSidebar, isMobile } = useSidebar();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAllNotifications,
    clearNotification,
    isSubscribed,
    canSubscribe,
    subscribeUser
  } = useNotifications();
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { users, selectUser } = useChat();

  useEffect(() => {
    setMounted(true);
  }, []);

  const getNotificationIcon = (type: AppNotification["type"]): IconName => {
    switch (type) {
      case "success":
        return "checkCircle";
      case "warning":
        return "warning";
      case "error":
        return "xCircle";
      case "info":
      default:
        return "info";
    }
  };

  const handleNotificationClick = (notification: AppNotification) => {
    markAsRead(notification.id);
    if (notification.routeId) {
      router.push(`/routes/${notification.routeId}/timeline`);
    } else if (notification.chatId && notification.senderId) {
      const sender = users.find(u => u.id === notification.senderId);
      if (sender) {
        selectUser(sender);
      }
    }
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-md md:px-6 print:hidden">
      <Button
        variant="ghost"
        size="icon"
        className={cn(isMobile ? "flex" : "hidden md:flex")}
        onClick={toggleSidebar}
        aria-label="Alternar Menu"
      >
        <Menu className={cn(isMobile ? "h-6 w-6" : "h-5 w-5")} />
      </Button>

      <Link
        href="/dashboard"
        className={cn(
          isMobile
            ? "hidden"
            : "flex md:flex items-center justify-center h-10 w-10",
          "hover:bg-accent hover:text-accent-foreground rounded-md",
        )}
        aria-label="Voltar para o Painel"
      >
        <Icons.home className="h-5 w-5" />
      </Link>

      <div className="flex w-full items-center justify-end">
        <div className="flex items-center gap-2 md:gap-4">

          {canSubscribe && !isSubscribed && (
            <Button onClick={subscribeUser} size="sm" variant="outline">
              <Bell className="mr-2 h-4 w-4"/>
              Ativar Notificações
            </Button>
          )}

          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={toggleTheme}
              aria-label="Alterar Tema"
            >
              {resolvedTheme === "dark" ? (
                <Icons.sun className="h-5 w-5" />
              ) : (
                <Icons.moon className="h-5 w-5" />
              )}
            </Button>
          )}

          <form className="relative hidden md:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar..."
              className="pl-8 sm:w-[200px] md:w-[200px] lg:w-[300px] rounded-full bg-muted/50 h-9"
            />
          </form>

          {mounted && (
            <DropdownMenu
              onOpenChange={(open) => {
                if (!open && unreadCount > 0) markAllAsRead();
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full relative"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1 -right-1 h-4 w-4 min-w-4 p-0 flex items-center justify-center text-xs"
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </Badge>
                  )}
                  <span className="sr-only">Notificações</span>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-80 md:w-96">
                <DropdownMenuLabel className="flex justify-between items-center">
                  <span>Notificações</span>
                  {notifications.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        markAllAsRead();
                      }}
                      disabled={unreadCount === 0}
                      className="text-xs h-auto py-0.5 px-1.5"
                    >
                      <Check className="mr-1 h-3 w-3" /> Marcar todas como lidas
                    </Button>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <DropdownMenuItem
                    disabled
                    className="justify-center text-muted-foreground py-4"
                  >
                    <MessageSquareWarning className="mr-2 h-4 w-4" /> Nenhuma
                    notificação
                  </DropdownMenuItem>
                ) : (
                  <ScrollArea className="h-[300px] md:h-[400px]">
                    {notifications.map((notification) => {
                      const IconComponent =
                        Icons[getNotificationIcon(notification.type)];
                      return (
                        <DropdownMenuItem
                          key={notification.id}
                          className={cn(
                            "flex items-start gap-2.5 p-2.5 cursor-pointer hover:bg-accent/80",
                            !notification.read &&
                              "bg-primary/5 hover:bg-primary/10",
                          )}
                          onClick={(e) => {
                            handleNotificationClick(notification);
                          }}
                        >
                          <IconComponent
                            className={cn(
                              "h-5 w-5 mt-0.5 shrink-0",
                              notification.type === "success" && "text-green-500",
                              notification.type === "warning" && "text-amber-500",
                              notification.type === "error" && "text-destructive",
                              notification.type === "info" && "text-primary",
                            )}
                          />
                          <div className="flex-grow">
                            <p
                              className={cn(
                                "text-sm leading-snug",
                                !notification.read && "font-semibold",
                              )}
                            >
                              {notification.senderName ? (
                                <>
                                  <span className="font-bold text-primary/80">
                                    {notification.senderName}:{" "}
                                  </span>
                                  {notification.message}
                                </>
                              ) : (
                                notification.message
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNowStrict(
                                new Date(notification.timestamp),
                                { addSuffix: true, locale: ptBR },
                              )}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 opacity-50 hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearNotification(notification.id);
                            }}
                            aria-label="Remover notificação"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuItem>
                      );
                    })}
                  </ScrollArea>
                )}
                {notifications.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        clearAllNotifications();
                      }}
                      className="text-sm text-destructive focus:bg-destructive/10 focus:text-destructive flex items-center justify-center py-2"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Limpar Todas
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <UserAvatarMenu />
        </div>
      </div>
    </header>
  );
}
