import { query, withTransaction } from '../../config/database';
import { NotFoundError, AppError } from '../../middleware/errorHandler';
import { SubscriptionPlan } from '../../types';

interface PlanInfo {
  id: SubscriptionPlan;
  name: string;
  priceMonthly: number;
  features: string[];
}

const PLANS: PlanInfo[] = [
  {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    features: ['Up to 5 journeys/day', 'Basic support'],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 299,
    features: ['Unlimited journeys', 'Priority support', 'Lower commission (8%)'],
  },
  {
    id: 'premium',
    name: 'Premium',
    priceMonthly: 599,
    features: ['Unlimited journeys', '24/7 support', 'Zero commission', 'Analytics dashboard'],
  },
];

export class SubscriptionsService {
  async listPlans(): Promise<PlanInfo[]> {
    return PLANS;
  }

  async getCurrentPlan(driverProfileId: string): Promise<{
    plan: SubscriptionPlan;
    expiresAt: Date | null;
    isActive: boolean;
  }> {
    const result = await query<{
      subscription_plan: SubscriptionPlan;
      subscription_expires_at: Date | null;
    }>(
      `SELECT subscription_plan, subscription_expires_at FROM driver_profiles WHERE id = $1`,
      [driverProfileId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Driver');

    const dp = result.rows[0];
    const isActive =
      dp.subscription_plan === 'free' ||
      (dp.subscription_expires_at !== null &&
        dp.subscription_expires_at > new Date());

    return {
      plan: dp.subscription_plan,
      expiresAt: dp.subscription_expires_at,
      isActive,
    };
  }

  async upgradePlan(
    driverProfileId: string,
    plan: SubscriptionPlan,
    razorpayPaymentId?: string
  ): Promise<void> {
    if (plan === 'free') throw new AppError('Cannot upgrade to free plan', 400);

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    await query(
      `UPDATE driver_profiles
       SET subscription_plan = $1, subscription_expires_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [plan, expiresAt, driverProfileId]
    );

    // Log the subscription transaction
    await query(
      `INSERT INTO subscription_transactions (driver_id, plan, expires_at, razorpay_payment_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [driverProfileId, plan, expiresAt, razorpayPaymentId ?? null]
    );
  }

  async cancelSubscription(driverProfileId: string): Promise<void> {
    await query(
      `UPDATE driver_profiles
       SET subscription_plan = 'free', subscription_expires_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [driverProfileId]
    );
  }
}
