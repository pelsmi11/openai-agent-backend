import sgMail from '@sendgrid/mail';
import { CONFIG } from '../../utils/constants/config.js';
import type { EmailSender, SendEmailParams } from './email-sender.js';

export class SendGridEmailSender implements EmailSender {
  constructor() {
    sgMail.setApiKey(CONFIG.SENDGRID_API_KEY);
  }

  async send({ to, subject, text }: SendEmailParams): Promise<void> {
    await sgMail.send({
      to,
      from: CONFIG.SENDGRID_FROM_EMAIL,
      subject,
      text,
    });
  }
}
