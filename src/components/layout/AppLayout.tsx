
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import React, { ReactNode, useEffect, useState } from "react";
import { Icons, type IconName } from "@/components/icons";
import { Header } from "@/components/layout/Header";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { ScrollArea } from "../ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import type { User } from "@/types/user";
import { cn } from "@/lib/utils";
import InstallPWAButton from "@/components/InstallPWAButton";
import NotificationSubscriber from "@/components/NotificationSubscriber";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useChat } from "@/contexts/ChatContext";


// Navigation items
interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  disabled?: boolean;
  adminOnly?: boolean;
  driverOnly?: boolean;
  clientOnly?: boolean;
}

const mainNavItems: NavItem[] = [
  { href: "/dashboard", label: "Painel Admin", icon: "home", adminOnly: true },
  {
    href: "/client-dashboard",
    label: "Painel do Cliente",
    icon: "home",
    clientOnly: true,
  },
  {
    href: "/driver-dashboard",
    label: "Painel do Motorista",
    icon: "home",
    driverOnly: true,
  },
  { href: "/calendar", label: "Calendário", icon: "calendar", adminOnly: true },
];

const managementNavItems: NavItem[] = [
  { href: "/clients", label: "Clientes", icon: "users", adminOnly: true },
  {
    href: "/admin/drivers",
    label: "Equipe",
    icon: "user",
    adminOnly: true,
  },
  {
    href: "/admin/vehicles",
    label: "Veículos",
    icon: "truck",
    adminOnly: true,
  },
   {
    href: "/admin/quotes",
    label: "Orçamentos",
    icon: "calculator",
    adminOnly: true,
  },
];

const operationalNavItems: NavItem[] = [
  {
    href: "/driver-dashboard",
    label: "Minhas Rotas",
    icon: "navigation",
    driverOnly: true,
  },
  {
    href: "/tasks",
    label: "Tarefas",
    icon: "listChecks",
    adminOnly: true,
  },
  {
    href: "/admin/in-progress-routes",
    label: "Rotas em Progresso",
    icon: "mapPin",
    adminOnly: true,
  },
  {
    href: "/pricing",
    label: "Nova Ordem de Serviço",
    icon: "plusCircle",
    adminOnly: true,
  },
  {
    href: "/orders",
    label: "Gerenciar Ordens",
    icon: "clipboardList",
    adminOnly: true,
  },
];

const financialNavItems: NavItem[] = [
  { href: "/billing", label: "Faturamento", icon: "receipt", adminOnly: true },
  { href: "/reports", label: "Relatórios", icon: "report", adminOnly: true },
  {
    href: "/admin/accounting",
    label: "Contabilidade",
    icon: "calculator",
    adminOnly: true,
  },
];

// This is the main layout component, now including the SidebarProvider.
export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // States that depend on context or hooks are fine here now.
  const { currentUser } = useAuth();
  const { users, selectUser } = useChat();
  const [hasPendingQuotes, setHasPendingQuotes] = useState(false);

  // Listener for new quotes
  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    const q = query(collection(db, "quotes"), where("status", "==", "pending"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const hasUnread = !querySnapshot.empty;
        setHasPendingQuotes(hasUnread);
        if(hasUnread) {
          localStorage.setItem('hasPendingQuotes', 'true');
        }
    });
    setHasPendingQuotes(localStorage.getItem('hasPendingQuotes') === 'true');
    const handleStorageChange = () => {
      setHasPendingQuotes(localStorage.getItem('hasPendingQuotes') === 'true');
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [currentUser?.role]);

  // Listener for URL changes to open chat
  useEffect(() => {
    const userIdToOpen = searchParams.get('openChatWith');
    if (userIdToOpen && users.length > 0) {
      const userToSelect = users.find(u => u.id === userIdToOpen);
      if (userToSelect) {
        selectUser(userToSelect);
      }
    }
  }, [searchParams, users, selectUser]);
  
  const isExecutionPage = pathname.includes("/execute");

  const filterNavItems = (items: NavItem[]): NavItem[] => {
    return items.filter((item) => {
      if (!currentUser) return false;
      if (item.adminOnly) return currentUser.role === "admin";
      if (item.driverOnly) return currentUser.role === "driver";
      if (item.clientOnly) return currentUser.role === "client";
      return true;
    });
  };

  const filteredMainNavItems = filterNavItems(mainNavItems);
  const filteredManagementNavItems = filterNavItems(managementNavItems);
  const filteredOperationalNavItems = filterNavItems(operationalNavItems);
  const filteredFinancialNavItems = filterNavItems(financialNavItems);

  const renderNavMenu = (items: NavItem[], sidebarState: 'expanded' | 'collapsed', isMobile: boolean, handleLinkClick: () => void) => {
    return items.map((item) => {
      const IconComponent = Icons[item.icon as keyof typeof Icons] ?? Icons.warning;
      const showQuoteNotification = item.href === '/admin/quotes' && hasPendingQuotes;
      const button = (
        <SidebarMenuButton
            asChild
            isActive={
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                item.href !== "/client-dashboard" &&
                item.href !== "/driver-dashboard" &&
                pathname.startsWith(item.href) &&
                !item.href.includes("?status="))
            }
            onClick={handleLinkClick}
          >
            <Link href={item.href} className="relative">
              <IconComponent className="h-5 w-5" />
              <span>{item.label}</span>
              {showQuoteNotification && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
              )}
            </Link>
          </SidebarMenuButton>
      );
      const isSidebarCollapsed = sidebarState === 'collapsed' && !isMobile;
      return (
        <SidebarMenuItem key={item.label}>
          {isSidebarCollapsed ? (
             <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right" align="center" className="bg-primary text-primary-foreground">
                    <p>{item.label}</p>
                </TooltipContent>
             </Tooltip>
          ) : (
            button
          )}
        </SidebarMenuItem>
      );
    });
  };
  
  // Internal component to safely use useSidebar context
  const SidebarWithContext = () => {
    const { isMobile, setOpenMobile, state: sidebarState } = useSidebar();
    const handleLinkClick = () => {
      if (isMobile) setOpenMobile(false);
    };

    return (
      <Sidebar
        variant="sidebar"
        collapsible="icon"
        className="border-r print-hidden"
      >
        <SidebarHeader className="p-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center"
            onClick={handleLinkClick}
          >
            <div className="relative w-10 h-10 shrink-0">
               <Image
                  src="/logvida-logo.png"
                  alt="LogVida"
                  fill
                  sizes="40px"
                  className="object-contain"
                />
            </div>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <h1 className="text-xl font-bold text-sidebar-foreground leading-tight">
                LogVida
              </h1>
              <p className="text-xs text-sidebar-foreground/80 leading-tight" />
            </div>
          </Link>
        </SidebarHeader>
        <ScrollArea className="flex-1">
          <SidebarContent className="p-2">
            <SidebarMenu>{renderNavMenu(filteredMainNavItems, sidebarState, isMobile, handleLinkClick)}</SidebarMenu>
            {filteredManagementNavItems.length > 0 && (
              <SidebarGroup className="mt-2">
                <div className="my-1 border-t border-sidebar-border" />
                <SidebarGroupLabel className="flex items-center gap-2">
                  <Icons.clipboardList className="h-4 w-4" />
                  <span>Gerenciamento</span>
                </SidebarGroupLabel>
                <SidebarMenu>
                  {renderNavMenu(filteredManagementNavItems, sidebarState, isMobile, handleLinkClick)}
                </SidebarMenu>
              </SidebarGroup>
            )}
            {filteredOperationalNavItems.length > 0 && (
              <SidebarGroup className="mt-2">
                <div className="my-1 border-t border-sidebar-border" />
                <SidebarGroupLabel className="flex items-center gap-2">
                  <Icons.truck className="h-4 w-4" />
                  <span>Operacional</span>
                </SidebarGroupLabel>
                <SidebarMenu>
                  {renderNavMenu(filteredOperationalNavItems, sidebarState, isMobile, handleLinkClick)}
                </SidebarMenu>
              </SidebarGroup>
            )}
            {filteredFinancialNavItems.length > 0 && (
              <SidebarGroup className="mt-2">
                <div className="my-1 border-t border-sidebar-border" />
                <SidebarGroupLabel className="flex items-center gap-2">
                  <Icons.dollarSign className="h-4 w-4" />
                  <span>Financeiro</span>
                </SidebarGroupLabel>
                <SidebarMenu>
                  {renderNavMenu(filteredFinancialNavItems, sidebarState, isMobile, handleLinkClick)}
                </SidebarMenu>
              </SidebarGroup>
            )}
          </SidebarContent>
        </ScrollArea>
        <SidebarFooter className="p-4 border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              {sidebarState === 'collapsed' && !isMobile ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                       <SidebarMenuButton
                          asChild
                          isActive={pathname === "/settings"}
                          onClick={handleLinkClick}
                        >
                          <Link href="/settings">
                            <Icons.settings className="h-5 w-5" />
                            <span>Configurações</span>
                          </Link>
                        </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="right" align="center" className="bg-primary text-primary-foreground">
                        <p>Configurações</p>
                    </TooltipContent>
                  </Tooltip>
              ) : (
                 <SidebarMenuButton
                    asChild
                    isActive={pathname === "/settings"}
                    onClick={handleLinkClick}
                  >
                    <Link href="/settings">
                      <Icons.settings className="h-5 w-5" />
                      <span>Configurações</span>
                    </Link>
                  </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    );
  };

  return (
    <SidebarProvider defaultOpen={true}>
        <TooltipProvider delayDuration={0}>
          <InstallPWAButton />
          <NotificationSubscriber />
          <ChatWidget />
          
          <SidebarWithContext />
          
          <div className="flex flex-col w-full md:ml-[var(--sidebar-width-icon)] peer-data-[state=expanded]:md:ml-[var(--sidebar-width)] peer-data-[collapsible=offcanvas]:md:ml-0 peer-data-[collapsible=icon]:peer-data-[variant=floating]:md:ml-[calc(var(--sidebar-width-icon)+theme(spacing.4))] peer-data-[collapsible=icon]:peer-data-[variant=inset]:md:ml-[calc(var(--sidebar-width-icon)+theme(spacing.4))] transition-[margin-left] duration-200 ease-linear print-hide-all-but-this">
            {!isExecutionPage && <Header />}
            <main
              className={cn(
                "flex-1 overflow-y-auto flex flex-col w-full",
                isExecutionPage
                  ? "min-h-screen"
                  : "min-h-[calc(100vh-4rem)]",
              )}
            >
              <div className="flex-grow w-full">{children}</div>
              {!isExecutionPage && (
                <footer className="py-4 mt-8 text-center text-xs text-muted-foreground border-t w-full print:hidden">
                  © {new Date().getFullYear()} LogVida - Vida em movimento. Todos os
                  direitos reservados.
                </footer>
              )}
            </main>
          </div>
        </TooltipProvider>
    </SidebarProvider>
  );
}
