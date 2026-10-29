'use client';

import React from 'react';
import {
  CheckCircle2,
  Clock,
  ChefHat,
  UtensilsCrossed,
  BellRing,
  LucideIcon,
} from 'lucide-react';
import { OrderStatus } from '@/types';

interface OrderTimelineProps {
  currentStatus: OrderStatus;
}

const STATUS_STEPS: Array<{ status: OrderStatus; label: string; icon: LucideIcon }> = [
  { status: OrderStatus.PENDING, label: 'Order Sent', icon: Clock },
  { status: OrderStatus.ACCEPTED, label: 'Accepted', icon: CheckCircle2 },
  { status: OrderStatus.PREPARING, label: 'Preparing', icon: ChefHat },
  { status: OrderStatus.READY, label: 'Ready', icon: BellRing },
  { status: OrderStatus.SERVED, label: 'Served', icon: UtensilsCrossed },
];

export function OrderTimeline({ currentStatus }: OrderTimelineProps) {
  const currentStepIndex = STATUS_STEPS.findIndex((s) => s.status === currentStatus);

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
        Live Kitchen Progress
      </h3>

      <div className="relative flex justify-between items-center">
        {/* Connecting Line */}
        <div className="absolute top-1/2 left-4 right-4 -translate-y-1/2 h-0.5 bg-slate-200 z-0" />
        <div
          className="absolute top-1/2 left-4 -translate-y-1/2 h-0.5 bg-orange-500 z-0 transition-all duration-500"
          style={{
            width: `${Math.max(
              0,
              (currentStepIndex / (STATUS_STEPS.length - 1)) * 100,
            )}%`,
          }}
        />

        {STATUS_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isDone = idx < currentStepIndex;
          const isCurrent = idx === currentStepIndex;

          return (
            <div
              key={step.status}
              className="relative z-10 flex flex-col items-center gap-1.5"
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  isDone
                    ? 'bg-orange-500 text-white shadow-sm'
                    : isCurrent
                    ? 'bg-orange-600 text-white ring-4 ring-orange-100 scale-110 shadow-md'
                    : 'bg-slate-100 text-slate-400 border border-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span
                className={`text-[10px] font-medium whitespace-nowrap ${
                  isCurrent
                    ? 'text-orange-600 font-bold'
                    : isDone
                    ? 'text-slate-800'
                    : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
