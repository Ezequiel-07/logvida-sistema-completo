
"use client";

import { useEffect } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/hooks/useAuth';

/**
 * A component that handles subscribing the user to push notifications
 * when they are logged in and haven't yet subscribed.
 * This runs in the background.
 */
export default function NotificationSubscriber() {
  const { subscribeUser, canSubscribe, isSubscribed } = useNotifications();
  const { currentUser } = useAuth();

  useEffect(() => {
    // If the user is logged in, notifications are possible, but they haven't subscribed yet
    if (currentUser && canSubscribe && !isSubscribed) {
      // Automatically try to subscribe them.
      // This will prompt for permission if it hasn't been granted yet.
      subscribeUser();
    }
  }, [currentUser, canSubscribe, isSubscribed, subscribeUser]);

  // This component doesn't render anything visible
  return null;
}
