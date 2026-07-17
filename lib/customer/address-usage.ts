export type AddressUsageFlags = {
  isBilling: boolean;
  isShipping: boolean;
};

export function mergeAddressUsageFlags(
  existing: AddressUsageFlags,
  patch: Partial<AddressUsageFlags>
): AddressUsageFlags {
  return {
    isBilling: patch.isBilling !== undefined ? patch.isBilling : existing.isBilling,
    isShipping: patch.isShipping !== undefined ? patch.isShipping : existing.isShipping
  };
}

export function assertAddressUsage(input: Partial<AddressUsageFlags>) {
  const isBilling = input.isBilling ?? true;
  const isShipping = input.isShipping ?? true;
  if (!isBilling && !isShipping) {
    throw new Error("An address must be enabled for shipping, billing, or both.");
  }
}
