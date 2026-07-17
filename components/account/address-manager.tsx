"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StuckPendingSubmitButton } from "@/components/ui/stuck-pending-submit-button";
import { AccountCard, AccountEmptyState, AccountField, AccountInput, AccountStatusChip } from "@/components/account";
import { CUSTOMER_EMPTY_MESSAGES } from "@/lib/customer/copy";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import {
  createAddressFormAction,
  deleteAddressFormAction,
  setDefaultAddressFormAction,
  updateAddressFormAction
} from "@/app/(storefront)/account/addresses/actions";
import {
  initialAddressActionState,
  type AddressActionState
} from "@/app/(storefront)/account/addresses/address-action-state";
import { wrapServerAction } from "@/hooks/use-async-action";

const timedCreateAddress = wrapServerAction(createAddressFormAction, { label: "Save address" });
const timedUpdateAddress = wrapServerAction(updateAddressFormAction, { label: "Save address changes" });
const timedSetDefaultAddress = wrapServerAction(setDefaultAddressFormAction, { label: "Set default address" });
const timedDeleteAddress = wrapServerAction(deleteAddressFormAction, { label: "Delete address" });

type AddressRow = {
  id: string;
  label?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  postal_code: string;
  country?: string | null;
  phone?: string | null;
  is_default?: boolean | null;
  is_billing?: boolean | null;
  is_shipping?: boolean | null;
};

type AddressManagerProps = {
  addresses: AddressRow[];
};

function AddressActionError({ state }: { state: AddressActionState }) {
  if (!state.error) return null;

  return (
    <p role="alert" className="rounded-xl border border-[var(--account-danger)]/20 bg-[var(--account-danger)]/5 px-3 py-2 text-sm text-[var(--account-danger)]">
      {state.error}
    </p>
  );
}

function useAddressActionFeedback(
  state: AddressActionState,
  successMessage: string,
  feedbackId: string
) {
  const router = useRouter();
  const lastStateRef = useRef<AddressActionState | null>(null);

  useEffect(() => {
    if (!state.ok && !state.error) return;
    if (lastStateRef.current === state) return;
    lastStateRef.current = state;

    if (state.ok) {
      notify.success(successMessage, { source: "account", id: `${feedbackId}:${Date.now()}` });
      router.refresh();
      return;
    }

    notify.error(state.error ?? FEEDBACK_MESSAGES.failedToSaveChanges, {
      source: "account",
      id: `${feedbackId}:error`
    });
  }, [feedbackId, router, state, successMessage]);
}

function AddAddressForm({
  show,
  onClose
}: {
  show: boolean;
  onClose: () => void;
}) {
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [state, formAction, pending] = useActionState(timedCreateAddress, initialAddressActionState);
  useAddressActionFeedback(state, FEEDBACK_MESSAGES.addressSaved, "address:create");

  useEffect(() => {
    if (state.ok) {
      onClose();
      setBillingSameAsShipping(true);
    }
  }, [onClose, state.ok]);

  if (!show) return null;

  return (
    <form action={formAction} className="mt-6 grid gap-4 border-t border-[var(--account-border)] pt-6 md:grid-cols-2">
      <input type="hidden" name="billing_same_as_shipping" value={billingSameAsShipping ? "true" : "false"} />

      <p className="type-section text-lg text-[var(--account-ink)] md:col-span-2">Shipping address</p>
      <AccountField label="Label" className="md:col-span-2">
        <AccountInput name="label" placeholder="Home, Office, etc." />
      </AccountField>
      <AccountField label="Address line 1" className="md:col-span-2">
        <AccountInput name="line1" required placeholder="Street address" />
      </AccountField>
      <AccountField label="Address line 2 (optional)" className="md:col-span-2">
        <AccountInput name="line2" placeholder="Apartment, suite, etc." />
      </AccountField>
      <AccountField label="City">
        <AccountInput name="city" required />
      </AccountField>
      <AccountField label="State / region">
        <AccountInput name="region" required />
      </AccountField>
      <AccountField label="Postal code">
        <AccountInput name="postal_code" required />
      </AccountField>
      <AccountField label="Country">
        <AccountInput name="country" defaultValue="India" />
      </AccountField>
      <AccountField label="Phone (optional)" className="md:col-span-2">
        <AccountInput name="phone" type="tel" inputMode="tel" autoComplete="tel" />
      </AccountField>
      <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--account-ink-muted)] md:col-span-2">
        <input type="checkbox" name="is_default" className="size-4" />
        Set as default shipping address
      </label>

      <label className="flex min-h-11 items-center gap-2 border-t border-[var(--account-border)] pt-4 text-sm text-[var(--account-ink-muted)] md:col-span-2">
        <input
          type="checkbox"
          checked={billingSameAsShipping}
          onChange={(event) => setBillingSameAsShipping(event.target.checked)}
          className="size-4"
        />
        Billing address is the same as shipping address
      </label>

      {!billingSameAsShipping ? (
        <>
          <p className="type-section text-lg text-[var(--account-ink)] md:col-span-2">Billing address</p>
          <AccountField label="Label" className="md:col-span-2">
            <AccountInput name="billing_label" placeholder="Billing, Office, etc." />
          </AccountField>
          <AccountField label="Address line 1" className="md:col-span-2">
            <AccountInput name="billing_line1" required placeholder="Street address" />
          </AccountField>
          <AccountField label="Address line 2 (optional)" className="md:col-span-2">
            <AccountInput name="billing_line2" placeholder="Apartment, suite, etc." />
          </AccountField>
          <AccountField label="City">
            <AccountInput name="billing_city" required />
          </AccountField>
          <AccountField label="State / region">
            <AccountInput name="billing_region" required />
          </AccountField>
          <AccountField label="Postal code">
            <AccountInput name="billing_postal_code" required />
          </AccountField>
          <AccountField label="Country">
            <AccountInput name="billing_country" defaultValue="India" />
          </AccountField>
          <AccountField label="Phone (optional)" className="md:col-span-2">
            <AccountInput name="billing_phone" type="tel" inputMode="tel" autoComplete="tel" />
          </AccountField>
        </>
      ) : null}

      <div className="grid gap-3 md:col-span-2">
        <AddressActionError state={state} />
        <StuckPendingSubmitButton
          pending={pending}
          guardId="address:create"
          idleLabel="Save address"
          pendingLabel="Saving..."
        />
      </div>
    </form>
  );
}

function EditAddressForm({
  address,
  onSaved
}: {
  address: AddressRow;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(timedUpdateAddress, initialAddressActionState);
  useAddressActionFeedback(state, FEEDBACK_MESSAGES.addressSaved, `address:update:${address.id}`);

  useEffect(() => {
    if (state.ok) {
      onSaved();
    }
  }, [onSaved, state.ok]);

  return (
    <form action={formAction} className="mt-4 grid gap-3 border-t border-[var(--account-border)] pt-4 md:grid-cols-2">
      <input type="hidden" name="address_id" value={address.id} />
      <AccountField label="Label" className="md:col-span-2">
        <AccountInput name="label" defaultValue={String(address.label ?? "Home")} />
      </AccountField>
      <AccountField label="Address line 1" className="md:col-span-2">
        <AccountInput name="line1" required defaultValue={address.line1} />
      </AccountField>
      <AccountField label="City">
        <AccountInput name="city" required defaultValue={address.city} />
      </AccountField>
      <AccountField label="State / region">
        <AccountInput name="region" required defaultValue={address.region} />
      </AccountField>
      <AccountField label="Postal code" className="md:col-span-2">
        <AccountInput name="postal_code" required defaultValue={address.postal_code} />
      </AccountField>
      <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--account-ink-muted)]">
        <input type="checkbox" name="is_shipping" defaultChecked={address.is_shipping !== false} className="size-4" />
        Use for shipping
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--account-ink-muted)]">
        <input type="checkbox" name="is_billing" defaultChecked={address.is_billing !== false} className="size-4" />
        Use for billing
      </label>
      <div className="grid gap-3 md:col-span-2">
        <AddressActionError state={state} />
        <StuckPendingSubmitButton
          pending={pending}
          guardId={`address:update:${address.id}`}
          idleLabel="Save changes"
          pendingLabel="Saving..."
        />
      </div>
    </form>
  );
}

function SetDefaultAddressForm({ addressId }: { addressId: string }) {
  const [state, formAction, pending] = useActionState(timedSetDefaultAddress, initialAddressActionState);
  useAddressActionFeedback(state, FEEDBACK_MESSAGES.defaultAddressUpdated, `address:default:${addressId}`);

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="address_id" value={addressId} />
      <StuckPendingSubmitButton
        pending={pending}
        guardId={`address:default:${addressId}`}
        idleLabel="Set default"
        pendingLabel="Saving..."
        variant="outline"
        size="sm"
      />
      <AddressActionError state={state} />
    </form>
  );
}

function DeleteAddressForm({ addressId }: { addressId: string }) {
  const [state, formAction, pending] = useActionState(timedDeleteAddress, initialAddressActionState);
  useAddressActionFeedback(state, FEEDBACK_MESSAGES.addressDeleted, `address:delete:${addressId}`);

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="address_id" value={addressId} />
      <StuckPendingSubmitButton
        pending={pending}
        guardId={`address:delete:${addressId}`}
        idleLabel="Delete"
        pendingLabel="Deleting..."
        variant="outline"
        size="sm"
        className="text-[var(--account-danger)] hover:text-[var(--account-danger)]"
      />
      <AddressActionError state={state} />
    </form>
  );
}

export function AddressManager({ addresses }: AddressManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="grid gap-6">
      <AccountCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="type-section text-[var(--account-ink)]">Saved addresses</h2>
            <p className="mt-1 text-sm text-[var(--account-ink-muted)]">
              Manage shipping and billing addresses for faster checkout.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAddForm((value) => !value)}
          >
            {showAddForm ? "Cancel" : "Add address"}
          </Button>
        </div>

        <AddAddressForm show={showAddForm} onClose={() => setShowAddForm(false)} />

        <div className="mt-6 grid gap-3">
          {addresses.length ? (
            addresses.map((address) => {
              const isEditing = editingId === address.id;
              return (
                <article
                  key={address.id}
                  className="rounded-2xl border border-[var(--account-border)] bg-[var(--account-surface-muted)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[var(--account-ink)]">
                          {String(address.label ?? "Address")}
                        </p>
                        {address.is_default ? (
                          <AccountStatusChip label="Primary" tone="success" />
                        ) : null}
                        {address.is_shipping !== false ? (
                          <AccountStatusChip label="Shipping" tone="neutral" />
                        ) : null}
                        {address.is_billing !== false ? (
                          <AccountStatusChip label="Billing" tone="neutral" />
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--account-ink-muted)]">
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ""}
                        <br />
                        {address.city}, {address.region} {address.postal_code}
                        {address.country ? `, ${address.country}` : ""}
                      </p>
                      {address.phone ? (
                        <p className="mt-1 text-sm text-[var(--account-ink-muted)]">{address.phone}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingId(isEditing ? null : address.id)}
                      >
                        {isEditing ? "Close" : "Edit"}
                      </Button>
                      {!address.is_default ? <SetDefaultAddressForm addressId={address.id} /> : null}
                      <DeleteAddressForm addressId={address.id} />
                    </div>
                  </div>

                  {isEditing ? (
                    <EditAddressForm address={address} onSaved={() => setEditingId(null)} />
                  ) : null}
                </article>
              );
            })
          ) : (
            <AccountEmptyState>{CUSTOMER_EMPTY_MESSAGES.addresses}</AccountEmptyState>
          )}
        </div>
      </AccountCard>
    </div>
  );
}
