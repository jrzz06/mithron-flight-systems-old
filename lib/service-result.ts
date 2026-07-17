export type ServiceUnavailable = { ok: false; error: "unavailable"; status?: number };

export type ServiceResult<T> = { ok: true; data: T } | ServiceUnavailable;

export function serviceUnavailable(status?: number): ServiceUnavailable {
  return { ok: false, error: "unavailable", status };
}

export function isServiceUnavailable<T>(result: ServiceResult<T>): result is ServiceUnavailable {
  return !result.ok;
}
