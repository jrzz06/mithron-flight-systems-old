export type AddressActionState = {
  ok: boolean;
  error?: string;
};

export const initialAddressActionState: AddressActionState = { ok: false };
