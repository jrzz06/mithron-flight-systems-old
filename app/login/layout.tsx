import { Suspense } from "react";
import { AuthNoticeToastBridge } from "@/components/notifications/auth-notice-toast-bridge";
import { ToastProvider } from "@/components/notifications/toast-provider";

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <AuthNoticeToastBridge />
      </Suspense>
      <ToastProvider theme="storefront" desktopPosition="top-center" />
    </>
  );
}
