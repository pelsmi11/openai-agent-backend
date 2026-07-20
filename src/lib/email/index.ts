import { SendGridEmailSender } from './sendgrid-email-sender.js';
import type { EmailSender } from './email-sender.js';

export type { EmailSender, SendEmailParams } from './email-sender.js';

export const emailSender: EmailSender = new SendGridEmailSender();
