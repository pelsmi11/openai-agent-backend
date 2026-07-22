import { Resend } from 'resend';
import { CONFIG } from '../../utils/constants/config.js';
import type { EmailSender, SendEmailParams } from './email-sender.js';

export class ResendEmailSender implements EmailSender {
  private readonly resend = new Resend(CONFIG.RESEND_API_KEY);

  async send({ to, subject, text }: SendEmailParams): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: CONFIG.RESEND_FROM_EMAIL,
      to,
      subject,
      text,
    });
    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }
  }
}
