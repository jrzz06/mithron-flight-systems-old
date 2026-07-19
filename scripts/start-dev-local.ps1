# Starts Next.js dev server with .env.local loaded (detached-friendly).
Set-Location $PSScriptRoot
Get-Content .env.local | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $k, $v = $_.Split('=', 2)
  if ($k) { Set-Item -Path "env:$k" -Value $v.Trim().Trim('"').Trim("'") }
}
$env:ALLOW_DEMO_SEED = "false"
if (-not $env:PAYMENT_EXPIRE_SECRET) { $env:PAYMENT_EXPIRE_SECRET = "local-dev-payment-expire-secret" }
npm run dev
