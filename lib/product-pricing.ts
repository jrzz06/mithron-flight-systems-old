export type ProductDiscountType = "percent" | "amount";

export type ProductPricingInput = {
  listPrice: number;
  onSale: boolean;
  discountType: ProductDiscountType;
  discountValue: number;
  costOfGoods: number;
};

export type ProductPricingResult = {
  price: number;
  compareAt: number | null;
  onSale: boolean;
  discountType: ProductDiscountType | null;
  discountValue: number | null;
  costOfGoods: number | null;
  profit: number;
  marginPercent: number;
  salePrice: number;
};

import { roundInr } from "@/lib/currency";

export function calculateSalePrice(input: Pick<ProductPricingInput, "listPrice" | "discountType" | "discountValue">) {
  const listPrice = Math.max(0, input.listPrice);
  const discountValue = Math.max(0, input.discountValue);

  if (discountValue <= 0) return listPrice;

  if (input.discountType === "percent") {
    const boundedPercent = Math.min(discountValue, 100);
    return roundInr(listPrice - (listPrice * boundedPercent) / 100);
  }

  return roundInr(Math.max(0, listPrice - discountValue));
}

export function calculateProfitAndMargin(salePrice: number, costOfGoods: number) {
  const profit = roundInr(salePrice - Math.max(0, costOfGoods));
  const marginPercent = salePrice > 0 ? roundInr((profit / salePrice) * 100) : 0;
  return { profit, marginPercent };
}

export function resolveProductPricing(input: ProductPricingInput): ProductPricingResult {
  const listPrice = Math.max(0, input.listPrice);
  const costOfGoods = Math.max(0, input.costOfGoods);
  const salePrice = input.onSale
    ? calculateSalePrice({
        listPrice,
        discountType: input.discountType,
        discountValue: input.discountValue
      })
    : listPrice;
  const { profit, marginPercent } = calculateProfitAndMargin(salePrice, costOfGoods);

  if (!input.onSale) {
    return {
      price: listPrice,
      compareAt: null,
      onSale: false,
      discountType: null,
      discountValue: null,
      costOfGoods: costOfGoods > 0 ? costOfGoods : null,
      profit,
      marginPercent,
      salePrice: listPrice
    };
  }

  return {
    price: salePrice,
    compareAt: listPrice > salePrice ? listPrice : null,
    onSale: true,
    discountType: input.discountType,
    discountValue: input.discountValue > 0 ? input.discountValue : null,
    costOfGoods: costOfGoods > 0 ? costOfGoods : null,
    profit,
    marginPercent,
    salePrice
  };
}

export type ProductPricingFormState = {
  listPrice: number;
  onSale: boolean;
  discountType: ProductDiscountType;
  discountValue: number;
  costOfGoods: number;
};

export function derivePricingFormState(input: {
  price: number;
  compareAt?: number | null;
  onSale?: boolean | null;
  discountType?: ProductDiscountType | null;
  discountValue?: number | null;
  costOfGoods?: number | null;
}): ProductPricingFormState {
  const price = Math.max(0, input.price);
  const compareAt = input.compareAt && input.compareAt > 0 ? input.compareAt : null;
  const inferredOnSale = Boolean(input.onSale) || (compareAt !== null && compareAt > price);
  const listPrice = inferredOnSale && compareAt ? compareAt : price;
  const discountType = input.discountType === "percent" ? "percent" : "amount";
  const derivedDiscount = inferredOnSale && listPrice > price ? listPrice - price : 0;

  return {
    listPrice,
    onSale: inferredOnSale,
    discountType,
    discountValue: input.discountValue && input.discountValue > 0 ? input.discountValue : derivedDiscount,
    costOfGoods: Math.max(0, input.costOfGoods ?? 0)
  };
}
