
"use client";

import React, { createContext, useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, where } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import type { ChatConversation, ChatMessage } from '@/types/chat';
import type { User } from '@/types/user';
import { toISOString } from '@/lib/utils';
import { sendMessage, deleteChatHistory } from '@/server/actions/chatActions';
import { toast } from '@/hooks/use-toast';

interface ChatContextType {
  conversations: ChatConversation[];
  users: User[];
  messages: ChatMessage[];
  selectedUser: User | null;
  isChatOpen: boolean;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  unreadConversationsCount: number;
  selectUser: (user: User | null) => void;
  toggleChat: (open?: boolean) => void;
  handleSendMessage: (text: string) => Promise<{success: boolean, error?: string}>;
  deleteConversationHistory: (otherUserId: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  
  const unreadConversationsCount = useMemo(() => {
    if (!currentUser) return 0;
    return conversations.filter(conv => (conv.unreadCount?.[currentUser.id] || 0) > 0).length;
  }, [conversations, currentUser]);


  useEffect(() => {
    // This effect handles fetching conversations and listening for updates.
    const fetchConversations = () => {
        if (!currentUser) {
            setConversations([]);
            setIsLoadingConversations(false);
            return () => {};
        }

        setIsLoadingConversations(true);
        const conversationsQuery = query(
            collection(db, "chats"),
            where("participantIds", "array-contains", currentUser.id),
            orderBy("lastMessage.timestamp", "desc")
        );

        const unsubscribe = onSnapshot(conversationsQuery, (snapshot) => {
            const convsData = snapshot.docs
                .map(doc => {
                    const data = doc.data();
                    if (!data.lastMessage || !data.lastMessage.timestamp) return null;
                    return {
                        id: doc.id,
                        ...data,
                        lastMessage: { ...data.lastMessage, timestamp: toISOString(data.lastMessage.timestamp)! },
                    } as ChatConversation
                }).filter((c): c is ChatConversation => c !== null); 
            
            setConversations(convsData);
            setIsLoadingConversations(false);
        }, (_error) => {
            setIsLoadingConversations(false);
        });

        return unsubscribe;
    };

    const unsubscribeConversations = fetchConversations();

    // Listener for the global 'new-chat-message' event.
    // When this event fires, we re-run fetchConversations to get the latest data.
    const handleNewChatMessage = () => {
        fetchConversations();
    };

    window.addEventListener('new-chat-message', handleNewChatMessage);

    // Cleanup function.
    return () => {
        if (unsubscribeConversations) {
            unsubscribeConversations();
        }
        window.removeEventListener('new-chat-message', handleNewChatMessage);
    };
}, [currentUser]);


  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const usersQuery = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
        const usersList = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as User))
            .filter(user => user.id !== currentUser.id && (user.role === 'admin' || user.role === 'driver' || user.role === 'client'));
        
        setUsers(usersList.sort((a, b) => a.name.localeCompare(b.name)));
    }, (_error) => {
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!selectedUser || !currentUser) {
        setMessages([]);
        return;
    }
    setIsLoadingMessages(true);
    const chatId = [currentUser.id, selectedUser.id].sort().join('_');
    const messagesQuery = query(collection(db, `chats/${chatId}/messages`), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        const msgs = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                timestamp: toISOString(data.timestamp)!,
            } as ChatMessage
        });
        setMessages(msgs);
        setIsLoadingMessages(false);
    }, (_error) => {
      setIsLoadingMessages(false);
    });
    return () => unsubscribe();
  }, [selectedUser, currentUser]);

  const markConversationAsRead = useCallback(async (user: User) => {
    if (!currentUser) return;
    const chatId = [currentUser.id, user.id].sort().join('_');
    const chatRef = doc(db, 'chats', chatId);
    const conversation = conversations.find(c => c.id === chatId);
    if (conversation && conversation.unreadCount?.[currentUser.id] > 0) {
        await updateDoc(chatRef, { [`unreadCount.${currentUser.id}`]: 0 });
    }
  }, [currentUser, conversations]);

  const selectUserAndOpenChat = (user: User | null) => {
    setSelectedUser(user);
    if(user) {
        setIsChatOpen(true);
        markConversationAsRead(user);
    }
  };

  const toggleChat = (open?: boolean) => {
    const newOpenState = open !== undefined ? open : !isChatOpen;
    setIsChatOpen(newOpenState);
    if (!newOpenState) {
        setSelectedUser(null);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !currentUser || !selectedUser) {
      return { success: false, error: "Dados da mensagem inválidos." };
    }
    
    try {
      const result = await sendMessage({
        senderId: currentUser.id,
        recipientId: selectedUser.id,
        text: text,
      });
      return result;
    } catch (error) {
      return { success: false, error: "Ocorreu uma falha na comunicação com o chat." };
    }
  };

  const deleteConversationHistory = async (otherUserId: string) => {
    if (!currentUser) return;
    const chatId = [currentUser.id, otherUserId].sort().join('_');
    
    toast({ title: 'Excluindo histórico...', description: 'Aguarde um momento.' });

    const result = await deleteChatHistory({ chatId });

    if (result.success) {
      toast({ title: 'Histórico Excluído', description: 'Todas as mensagens desta conversa foram removidas.' });
      setMessages([]); // Clear messages from UI immediately
    } else {
      toast({ title: 'Erro ao Excluir', description: result.error, variant: 'destructive' });
    }
  };

  const value = {
    conversations,
    users,
    messages,
    selectedUser,
    isChatOpen,
    isLoadingConversations,
    isLoadingMessages,
    unreadConversationsCount,
    selectUser: selectUserAndOpenChat,
    toggleChat,
    handleSendMessage,
    deleteConversationHistory,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
