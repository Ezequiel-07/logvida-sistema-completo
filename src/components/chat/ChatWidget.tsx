
"use client";

import { useChat } from "@/contexts/ChatContext";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Icons } from "../icons";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "../ui/card";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import type { User } from "@/types/user";
import { Badge } from "../ui/badge";


export function ChatWidget() {
  const {
    conversations,
    users,
    messages,
    selectedUser,
    isChatOpen,
    isLoadingMessages,
    isLoadingConversations,
    unreadConversationsCount,
    selectUser,
    toggleChat,
    handleSendMessage,
    deleteConversationHistory,
  } = useChat();
  const { currentUser } = useAuth();
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [userToDeleteHistory, setUserToDeleteHistory] = useState<User | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatCardRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedUser]);
  
  const handleToggleChat = useCallback((open?: boolean) => {
    toggleChat(open);
  }, [toggleChat]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatCardRef.current && !chatCardRef.current.contains(event.target as Node)) {
        const toggleButton = document.querySelector('[aria-label="Abrir chat"]');
        if (toggleButton && !toggleButton.contains(event.target as Node)) {
          handleToggleChat(false);
        }
      }
    };
  
    if (isChatOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
  
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isChatOpen, handleToggleChat]);


  const onSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;
    
    setIsSending(true);
    try {
      const result = await handleSendMessage(inputText);
      if(result && !result.success) {
        console.error("[ChatWidget] ERRO RECEBIDO DO CHATCONTEXT:", result.error);
        toast({
          title: "Erro ao Enviar",
          description: result.error || "Não foi possível enviar a mensagem.",
          variant: "destructive"
        })
      } else {
        setInputText("");
      }
    } catch (error) {
       console.error("[ChatWidget] Erro inesperado ao chamar handleSendMessage:", error);
       toast({
          title: "Erro Crítico de Chat",
          description: "Ocorreu uma falha na comunicação com o chat.",
          variant: "destructive"
        })
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!userToDeleteHistory) return;
    await deleteConversationHistory(userToDeleteHistory.id);
    setUserToDeleteHistory(null);
  };
  
  const handleStartDelete = (e: React.MouseEvent, user: User) => {
    e.stopPropagation();
    setUserToDeleteHistory(user);
  };


  if (!currentUser) {
    return null;
  }

  const otherUsers = users.filter(u => u.id !== currentUser.id);
  
  const getAvatar = (user: User | null) => (
    <Avatar className="h-9 w-9">
      <AvatarImage src={user?.profilePictureUrl || undefined} />
      <AvatarFallback>{user?.name?.charAt(0) || "?"}</AvatarFallback>
    </Avatar>
  );

  return (
    <>
      <div className="fixed bottom-24 right-5 z-[100] print:hidden">
        <Button
          size="icon"
          className="rounded-full w-14 h-14 shadow-lg relative"
          onClick={() => toggleChat()}
          aria-label="Abrir chat"
        >
          {isChatOpen ? <Icons.xCircle className="w-7 h-7" /> : <Icons.send className="w-6 h-6" />}
          {unreadConversationsCount > 0 && !isChatOpen && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full p-0">
              {unreadConversationsCount}
            </Badge>
          )}
        </Button>
      </div>

      {isChatOpen && (
        <div
          ref={chatCardRef}
          className={cn(
            "fixed bottom-24 right-5 z-[100] transition-all duration-300 ease-in-out print:hidden",
            isChatOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10 pointer-events-none"
          )}
        >
          <Card className="w-80 h-[500px] shadow-2xl flex flex-col bg-card/90 backdrop-blur-sm">
            <CardHeader className="p-3 border-b flex-shrink-0">
              {userToDeleteHistory ? (
                <div className="text-center p-2">
                    <p className="text-sm font-semibold">Excluir histórico com {userToDeleteHistory.name}?</p>
                    <div className="flex justify-center gap-2 mt-2">
                        <Button size="sm" variant="destructive" onClick={handleDeleteConfirm}>Sim, excluir</Button>
                        <Button size="sm" variant="outline" onClick={() => setUserToDeleteHistory(null)}>Cancelar</Button>
                    </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {selectedUser && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => selectUser(null)}>
                          <Icons.chevronDown className="h-5 w-5 rotate-90" />
                      </Button>
                    )}
                    {selectedUser && getAvatar(selectedUser)}
                    <h3 className="font-semibold truncate">{selectedUser ? selectedUser.name : "Conversas"}</h3>
                  </div>
                  {selectedUser && (
                     <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={(e) => handleStartDelete(e, selectedUser)}>
                        <Icons.delete className="h-4 w-4" />
                     </Button>
                  )}
                </div>
              )}
            </CardHeader>
            
            <div className="flex-grow overflow-hidden">
              {!selectedUser ? (
                <ScrollArea className="h-full">
                  <div className="p-2 space-y-1">
                    {isLoadingConversations ? (
                        <div className="flex justify-center items-center h-full p-4">
                            <Icons.loader className="animate-spin" />
                        </div>
                    ) : otherUsers.length > 0 ? otherUsers.map(user => {
                      const conversation = conversations.find(c => c.participantIds.includes(user.id));
                      const hasUnread = (conversation?.unreadCount?.[currentUser.id] || 0) > 0;
                      return (
                          <div key={user.id} onClick={() => selectUser(user)} 
                             className="p-2 flex items-center gap-3 rounded-md hover:bg-muted cursor-pointer relative">
                              {getAvatar(user)}
                              <div className="flex-grow overflow-hidden">
                                  <p className="font-medium truncate text-sm">{user.name}</p>
                                  {conversation?.lastMessage && <p className="text-xs text-muted-foreground truncate">{conversation.lastMessage.text}</p>}
                              </div>
                              {hasUnread && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                </div>
                              )}
                          </div>
                      )
                    }) : <p className="text-center text-sm text-muted-foreground p-4">Nenhum usuário encontrado.</p>}
                  </div>
                </ScrollArea>
              ) : (
                <CardContent className="p-0 h-full flex flex-col">
                  <ScrollArea className="flex-grow p-3">
                    {isLoadingMessages ? (
                      <div className="flex justify-center items-center h-full"><Icons.loader className="animate-spin" /></div>
                    ) : messages.length === 0 ? (
                       <div className="flex items-center justify-center h-full text-center text-muted-foreground text-sm">
                          <p>Nenhuma mensagem nesta conversa.</p>
                       </div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((msg) => {
                          const isSender = msg.senderId === currentUser.id;
                          
                          return (
                            <div key={msg.id} className={cn("flex gap-2.5", isSender ? "justify-end" : "justify-start")}>
                              <div className={cn("max-w-[75%] p-2 rounded-lg text-sm", isSender ? "bg-primary text-primary-foreground" : "bg-muted")}>
                                <p>{msg.text}</p>
                                <div className={cn("text-xs mt-1 flex items-center gap-1", isSender ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                  <span>{formatDistanceToNowStrict(new Date(msg.timestamp), { locale: ptBR, addSuffix: true })}</span>
                                  {isSender && (
                                      <Icons.checkCheck className={cn("h-4 w-4", msg.read ? "text-blue-400" : "text-primary-foreground/70")} />
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </ScrollArea>
                  <CardFooter className="p-2 border-t">
                    <form onSubmit={onSendMessage} className="flex w-full gap-2">
                      <Input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Digite sua mensagem..." disabled={isSending} />
                      <Button type="submit" size="icon" className="flex-shrink-0 active:scale-95 transition-transform" disabled={isSending || !inputText.trim()}>
                        {isSending ? <Icons.loader className="h-4 w-4 animate-spin" /> : <Icons.send className="h-4 w-4" />}
                      </Button>
                    </form>
                  </CardFooter>
                </CardContent>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
