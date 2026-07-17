"use client";

import {
  DEFAULT_PHONE_COUNTRY_CODE,
  PHONE_COUNTRIES,
  digitsOnly,
  getPhoneCountry,
  validatePhoneWithCountry
} from "@/lib/api/customer-contact";

type PhoneCountryFieldProps = {
  id?: string;
  countryCode: string;
  national: string;
  onCountryChange: (code: string) => void;
  onNationalChange: (national: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  selectClassName?: string;
  inputClassName?: string;
  "data-testid"?: string;
};

export function PhoneCountryField({
  id,
  countryCode,
  national,
  onCountryChange,
  onNationalChange,
  disabled = false,
  required = true,
  className,
  selectClassName,
  inputClassName,
  "data-testid": testId = "phone-country-field"
}: PhoneCountryFieldProps) {
  const country = getPhoneCountry(countryCode || DEFAULT_PHONE_COUNTRY_CODE);

  return (
    <div className={className} data-testid={testId} style={{ display: "grid", gap: "0.5rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(7.5rem, 0.9fr) 1.4fr", gap: "0.5rem" }}>
        <select
          aria-label="Country code"
          value={country.code}
          disabled={disabled}
          className={selectClassName}
          data-testid="phone-country-select"
          onChange={(event) => {
            onCountryChange(event.target.value);
            onNationalChange(digitsOnly(national).slice(0, getPhoneCountry(event.target.value).nationalLength));
          }}
        >
          {PHONE_COUNTRIES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.label}
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          required={required}
          disabled={disabled}
          className={inputClassName}
          value={national}
          maxLength={country.nationalLength}
          placeholder={`${country.nationalLength}-digit number`}
          data-testid="phone-national-input"
          onChange={(event) => {
            onNationalChange(digitsOnly(event.target.value).slice(0, country.nationalLength));
          }}
        />
      </div>
    </div>
  );
}

export function validateAndComposePhone(countryCode: string, national: string) {
  return validatePhoneWithCountry(countryCode, national);
}
