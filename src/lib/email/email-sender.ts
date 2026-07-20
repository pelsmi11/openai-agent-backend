export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
}

/**
 * Adapter interface for sending transactional emails. Code that needs to send an email
 * depends on this, not on a specific provider — swapping providers means writing a new
 * implementation of this interface, not touching the callers.
 */
export interface EmailSender {
  send(params: SendEmailParams): Promise<void>;
}
