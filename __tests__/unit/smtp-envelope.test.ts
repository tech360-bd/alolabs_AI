// @vitest-environment node
import { createTransport } from 'nodemailer';
import { expect, it, vi } from 'vitest';
import { SMTPEmailService } from '@/lib/email/smtp';
import type { EmailMessage } from '@/lib/email/types';

const { captured } = vi.hoisted(() => ({ captured: vi.fn() }));
vi.mock('nodemailer', async importOriginal => {
  const real = await importOriginal<typeof import('nodemailer')>();
  // Exercise the actual MIME/envelope builder; don't open a network connection.
  return { createTransport: vi.fn(() => ({ async sendMail(options: Parameters<ReturnType<typeof real.createTransport>['sendMail']>[0]) {
    const info = await real.createTransport({ streamTransport: true, buffer: true }).sendMail(options);
    captured(info.envelope, info.message.toString());
    return info;
  } })) };
});

it('uses the authenticated envelope sender, delivers blind copies without revealing them, and keeps MIME parts', async () => {
  const smtp = new SMTPEmailService({ host: 'mail.invalid', port: 587, secure: false, auth: { user: 'sender@example.test', pass: 'test-only' } });
  const m: EmailMessage = { id: '', from: 'Alias <alias@another.test>', to: ['to@example.test'], cc: ['cc@example.test'], bcc: ['blind@example.test'],
    subject: 'A greeting', html: '<p>Hello</p>', text: 'Hello', attachments: [{ filename: 'note.txt', contentType: 'text/plain', content: Buffer.from('memo'), size: 4 }],
    headers: { 'X-Case': 'fixture' }, inReplyTo: '<original@example.test>', references: ['<original@example.test>'] };
  const result = await smtp.send(m);
  expect(result).toEqual({ success: true, messageId: expect.stringMatching(/^<.+@example\.test>$/) });
  expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: true, tls: expect.objectContaining({ rejectUnauthorized: true }) }));
  expect(captured).toHaveBeenCalledWith({ from: 'sender@example.test', to: ['to@example.test', 'cc@example.test', 'blind@example.test'] }, expect.any(String));
  const [, mime] = captured.mock.calls[0];
  for (const part of ['alias@another.test', 'In-Reply-To: <original@example.test>', 'multipart/alternative', 'multipart/mixed', 'note.txt', 'X-Case: fixture']) expect(mime).toContain(part);
  expect(mime).not.toContain('blind@example.test');
});
