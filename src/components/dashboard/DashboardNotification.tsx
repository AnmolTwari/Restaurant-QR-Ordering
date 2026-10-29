'use client';

import React from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { NotificationState } from '@/types/dashboard';

interface DashboardNotificationProps {
  notification: NotificationState | null;
}

export function DashboardNotification({ notification }: DashboardNotificationProps) {
  if (!notification) return null;

  const isSuccess = notification.type === 'success';

  return (
    <div
      role="alert"
      className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-xl flex items-center gap-2.5 text-sm transition-all animate-bounce ${
        isSuccess
          ? 'bg-emerald-950/90 text-emerald-200 border-emerald-800'
          : 'bg-red-950/90 text-red-200 border-red-800'
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
      )}
      <span>{notification.message}</span>
    </div>
  );
}
