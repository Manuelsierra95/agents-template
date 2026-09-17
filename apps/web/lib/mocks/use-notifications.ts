"use client";

import { useMemo } from "react";

import type { Notification } from "./types";
import { useMocks } from "./provider";

export const NO_NOTIFICATIONS: Notification[] = [];

export function useNotifications() {
  const { state } = useMocks();
  return useMemo<Notification[]>(() => {
    if (state.notifications.length === 0) return NO_NOTIFICATIONS;
    return [...state.notifications].sort((a, b) => b.createdAt - a.createdAt);
  }, [state.notifications]);
}

export function useMarkNotificationRead() {
  const { setNotificationRead } = useMocks();
  return useMemo(
    () => async (id: string, read = true) => {
      setNotificationRead(id, read);
    },
    [setNotificationRead],
  );
}

export function useMarkAllNotificationsRead() {
  const { state, setState } = useMocks();
  return useMemo(
    () => async () => {
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) => ({ ...n, read: true })),
      }));
    },
    [setState, state.notifications],
  );
}
