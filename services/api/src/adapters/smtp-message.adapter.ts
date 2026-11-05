import { Injectable } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { MessageAdapter } from './message.adapter';

/** Any SMTP server: Mailpit locally, a transactional email provider in production. */
@Injectable()
export class SmtpMessageAdapter implements MessageAdapter {
  private readonly transport: Transporter;

  constructor() {
    const e = env();
    this.transport = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_PORT === 465,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
    });
  }

  async sendEmail(msg: { to: string; subject: string; text: string; html?: string }) {
    await this.transport.sendMail({ from: env().MAIL_FROM, ...msg });
  }
}