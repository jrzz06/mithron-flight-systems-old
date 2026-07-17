import {
  sendEmailWithFallback,
  getConfiguredEmailProviders,
  type EmailPayload
} from "@/services/email/providers";

export { sendEmailWithFallback, getConfiguredEmailProviders };
export type { EmailPayload, EmailSendResult, EmailProviderId } from "@/services/email/providers";

export async function sendEmail(payload: EmailPayload) {
  return sendEmailWithFallback(payload);
}

export async function dispatchEmailNotification(input: {
  recipientEmail: string;
  title: string;
  body: string;
}) {
  return sendEmail({
    to: input.recipientEmail,
    subject: input.title,
    html: `<p>${input.body}</p>`
  });
}
