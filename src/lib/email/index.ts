import { ResendEmailSender } from './resend-email-sender.js';
import type { EmailSender } from './email-sender.js';

export type { EmailSender, SendEmailParams } from './email-sender.js';

export const emailSender: EmailSender = new ResendEmailSender();
