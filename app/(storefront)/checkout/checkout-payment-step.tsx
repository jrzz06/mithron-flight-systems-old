"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import styles from "./checkout.module.css";

function formatPaymentProviderLabel(provider: string) {
  if (provider === "razorpay") return "Razorpay";
  if (provider === "cashfree") return "Cashfree";
  if (provider === "stub") return "Payment gateway";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function formatPaymentProviderHint(provider: string) {
  if (provider === "razorpay") return "Cards, UPI, net banking, and wallets";
  if (provider === "cashfree") return "Cards, UPI, and bank transfers";
  return "Secure online payment";
}

export function CheckoutPaymentStep({
  paymentProviders,
  paymentProvider,
  onPaymentProviderChange
}: {
  paymentProviders: string[];
  paymentProvider: string;
  onPaymentProviderChange: (provider: string) => void;
}) {
  if (!paymentProviders.length) return null;

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Payment method</legend>
      <p className={styles.paymentLead}>Choose how you would like to pay. You will complete payment in a secure gateway window.</p>
      <div className={styles.paymentOptions}>
        {paymentProviders.map((provider) => (
          <label
            key={provider}
            className={cn(styles.paymentOption, paymentProvider === provider && styles.paymentOptionSelected)}
          >
            <input
              type="radio"
              name="paymentProvider"
              value={provider}
              checked={paymentProvider === provider}
              onChange={() => onPaymentProviderChange(provider)}
              className={styles.paymentOptionInput}
            />
            <span className={styles.paymentOptionBody}>
              <span className={styles.paymentOptionTitle}>{formatPaymentProviderLabel(provider)}</span>
              <span className={styles.paymentOptionHint}>{formatPaymentProviderHint(provider)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const CheckoutPaymentStepLazy = dynamic(
  async () => ({ default: CheckoutPaymentStep }),
  { loading: () => null }
);

export { CheckoutPaymentStepLazy };
