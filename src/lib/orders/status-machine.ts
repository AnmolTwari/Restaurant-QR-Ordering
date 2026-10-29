import { OrderStatus, UserRole } from '@/generated/prisma';

export class InvalidStatusTransitionError extends Error {
  constructor(
    public readonly currentStatus: OrderStatus,
    public readonly targetStatus: OrderStatus,
    message?: string,
  ) {
    super(
      message ||
        `Invalid order status transition from ${currentStatus} to ${targetStatus}.`,
    );
    this.name = 'InvalidStatusTransitionError';
  }
}

export class UnauthorizedStatusTransitionError extends Error {
  constructor(
    public readonly role: UserRole | 'CUSTOMER',
    public readonly targetStatus: OrderStatus,
    message?: string,
  ) {
    super(
      message ||
        `Role "${role}" is not authorized to transition order to ${targetStatus}.`,
    );
    this.name = 'UnauthorizedStatusTransitionError';
  }
}

/**
 * Valid transitions map: fromStatus -> set of allowed toStatuses
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.SERVED, OrderStatus.CANCELLED],
  [OrderStatus.SERVED]: [], // Terminal state
  [OrderStatus.CANCELLED]: [], // Terminal state
};

/**
 * Validates whether an order status transition is permissible by the state machine
 * and whether the acting role is authorized to perform it.
 */
export function validateStatusTransition(
  currentStatus: OrderStatus,
  targetStatus: OrderStatus,
  actorRole: UserRole | 'CUSTOMER',
): void {
  // 1. Check if the transition is allowed in the state machine
  const allowedTargets = ALLOWED_STATUS_TRANSITIONS[currentStatus];
  if (!allowedTargets || !allowedTargets.includes(targetStatus)) {
    throw new InvalidStatusTransitionError(currentStatus, targetStatus);
  }

  // 2. Cancellation rules
  if (targetStatus === OrderStatus.CANCELLED) {
    if (actorRole === 'CUSTOMER') {
      // Customer may only cancel if the order is still PENDING
      if (currentStatus !== OrderStatus.PENDING) {
        throw new UnauthorizedStatusTransitionError(
          actorRole,
          targetStatus,
          'Customers may only cancel an order while it is still PENDING.',
        );
      }
      return;
    }

    // Staff cancellation:
    // WAITER can only cancel while PENDING
    // OWNER and MANAGER can cancel at any non-terminal stage
    // KITCHEN cannot cancel (must consult manager)
    if (actorRole === UserRole.WAITER && currentStatus !== OrderStatus.PENDING) {
      throw new UnauthorizedStatusTransitionError(
        actorRole,
        targetStatus,
        'Waiters can only cancel an order while it is still PENDING. Contact a manager for later cancellations.',
      );
    }
    if (actorRole === UserRole.KITCHEN) {
      throw new UnauthorizedStatusTransitionError(
        actorRole,
        targetStatus,
        'Kitchen staff cannot directly cancel orders. Please notify a manager.',
      );
    }
    return;
  }

  // 3. Forward progression rules
  if (actorRole === 'CUSTOMER') {
    throw new UnauthorizedStatusTransitionError(
      actorRole,
      targetStatus,
      'Customers cannot advance order status.',
    );
  }

  switch (targetStatus) {
    case OrderStatus.ACCEPTED:
      // OWNER, MANAGER, KITCHEN, WAITER can accept
      if (
        !(
          [
            UserRole.OWNER,
            UserRole.MANAGER,
            UserRole.KITCHEN,
            UserRole.WAITER,
          ] as readonly (UserRole | string)[]
        ).includes(actorRole)
      ) {
        throw new UnauthorizedStatusTransitionError(actorRole, targetStatus);
      }
      break;

    case OrderStatus.PREPARING:
      // OWNER, MANAGER, KITCHEN can start prep
      if (
        !(
          [
            UserRole.OWNER,
            UserRole.MANAGER,
            UserRole.KITCHEN,
          ] as readonly (UserRole | string)[]
        ).includes(actorRole)
      ) {
        throw new UnauthorizedStatusTransitionError(
          actorRole,
          targetStatus,
          'Only kitchen staff or managers can start preparing orders.',
        );
      }
      break;

    case OrderStatus.READY:
      // OWNER, MANAGER, KITCHEN can mark ready
      if (
        !(
          [
            UserRole.OWNER,
            UserRole.MANAGER,
            UserRole.KITCHEN,
          ] as readonly (UserRole | string)[]
        ).includes(actorRole)
      ) {
        throw new UnauthorizedStatusTransitionError(
          actorRole,
          targetStatus,
          'Only kitchen staff or managers can mark orders as ready.',
        );
      }
      break;

    case OrderStatus.SERVED:
      // OWNER, MANAGER, WAITER, KITCHEN can mark served
      if (
        !(
          [
            UserRole.OWNER,
            UserRole.MANAGER,
            UserRole.WAITER,
            UserRole.KITCHEN,
          ] as readonly (UserRole | string)[]
        ).includes(actorRole)
      ) {
        throw new UnauthorizedStatusTransitionError(actorRole, targetStatus);
      }
      break;

    default:
      throw new InvalidStatusTransitionError(currentStatus, targetStatus);
  }
}
