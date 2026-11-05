/** Every email/SMS leaves through this interface. Swap the provider in AdaptersModule only. */
export interface MessageAdapter {
  sendEmail(msg: { to: string; subject: string; text: string; html?: string }): Promise<void>;
}
export const MESSAGE_ADAPTER = Symbol('MESSAGE_ADAPTER');