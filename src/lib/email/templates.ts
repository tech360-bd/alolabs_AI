// ALO Labs AIOS — Email Template Engine

import * as crypto from 'crypto';
import type { EmailTemplate } from './types';

// ─── HTML Sanitizer ───────────────────────────────────────────────────────────

const DANGEROUS_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'applet', 'form',
  'input', 'textarea', 'select', 'button', 'link', 'style',
  'meta', 'base', 'frame', 'frameset',
]);

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'class', 'id', 'style',
  'width', 'height', 'border', 'cellpadding', 'cellspacing',
  'align', 'valign', 'bgcolor', 'color', 'face', 'size',
  'rowspan', 'colspan', 'nowrap', 'target', 'rel',
]);

function sanitizeHtml(input: string): string {
  let result = input;

  // Remove dangerous tags and their content
  for (const tag of DANGEROUS_TAGS) {
    // Remove opening tags with any attributes
    const openRegex = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
    result = result.replace(openRegex, '');

    // Remove closing tags
    const closeRegex = new RegExp(`</${tag}\\s*>`, 'gi');
    result = result.replace(closeRegex, '');

    // Remove self-closing tags
    const selfCloseRegex = new RegExp(`<${tag}\\b[^>]*/>`, 'gi');
    result = result.replace(selfCloseRegex, '');
  }

  // Remove event handler attributes (onclick, onerror, etc.)
  result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Remove javascript: URLs
  result = result.replace(/href\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, 'href="#"');

  // Remove data: URLs in src attributes (can be used for XSS)
  result = result.replace(/src\s*=\s*["']?\s*data:[^"'>\s]*/gi, 'src=""');

  return result;
}

// ─── Built-in Templates ───────────────────────────────────────────────────────

function createBuiltinTemplate(
  name: string,
  subject: string,
  html: string,
  text: string,
  variables: string[],
  category: string
): EmailTemplate {
  return {
    id: crypto.createHash('sha256').update(`builtin:${name}`).digest('hex').substring(0, 12),
    name,
    subject,
    html,
    text,
    variables,
    category,
  };
}

const BUILTIN_TEMPLATES: EmailTemplate[] = [
  createBuiltinTemplate(
    'welcome',
    'Welcome to {{companyName}}, {{userName}}!',
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0;">Welcome, {{userName}}!</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Thank you for joining <strong>{{companyName}}</strong>.</p>
    <p>We are excited to have you on board. Your account has been successfully created.</p>
    <p>To get started, you can log in to your dashboard at any time.</p>
    <p>If you have any questions, don't hesitate to reach out to our support team.</p>
    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
      <p>Best regards,<br>The {{companyName}} Team</p>
    </div>
  </div>
</body>
</html>`,
    `Welcome, {{userName}}!

Thank you for joining {{companyName}}.

We are excited to have you on board. Your account has been successfully created.

To get started, you can log in to your dashboard at any time.

If you have any questions, don't hesitate to reach out to our support team.

Best regards,
The {{companyName}} Team`,
    ['companyName', 'userName'],
    'onboarding'
  ),

  createBuiltinTemplate(
    'password-reset',
    'Reset your password — {{companyName}}',
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #DC2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0;">Password Reset Request</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Hi {{userName}},</p>
    <p>We received a request to reset your password for your <strong>{{companyName}}</strong> account.</p>
    <p>Click the button below to choose a new password:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{resetLink}}" style="background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
    </div>
    <p>This link will expire in <strong>{{expiryMinutes}} minutes</strong>.</p>
    <p>If you did not request this, you can safely ignore this email.</p>
    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
      <p>Best regards,<br>The {{companyName}} Team</p>
    </div>
  </div>
</body>
</html>`,
    `Hi {{userName}},

We received a request to reset your password for your {{companyName}} account.

Click the link below to choose a new password:

{{resetLink}}

This link will expire in {{expiryMinutes}} minutes.

If you did not request this, you can safely ignore this email.

Best regards,
The {{companyName}} Team`,
    ['companyName', 'userName', 'resetLink', 'expiryMinutes'],
    'security'
  ),

  createBuiltinTemplate(
    'mfa-code',
    'Your verification code: {{code}}',
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #7C3AED; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0;">Verification Code</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Hi {{userName}},</p>
    <p>Your verification code is:</p>
    <div style="text-align: center; margin: 30px 0;">
      <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #4F46E5;">{{code}}</span>
    </div>
    <p>This code expires in <strong>{{expiryMinutes}} minutes</strong>.</p>
    <p>If you did not request this code, please ignore this email.</p>
    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
      <p>Best regards,<br>The {{companyName}} Team</p>
    </div>
  </div>
</body>
</html>`,
    `Hi {{userName}},

Your verification code is:

  {{code}}

This code expires in {{expiryMinutes}} minutes.

If you did not request this code, please ignore this email.

Best regards,
The {{companyName}} Team`,
    ['userName', 'code', 'expiryMinutes', 'companyName'],
    'security'
  ),

  createBuiltinTemplate(
    'invoice',
    'Invoice #{{invoiceNumber}} from {{companyName}}',
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #059669; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0;">Invoice #{{invoiceNumber}}</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear {{customerName}},</p>
    <p>Thank you for your business. Please find your invoice details below:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <tr style="background: #F3F4F6;">
        <th style="padding: 10px; text-align: left; border: 1px solid #E5E7EB;">Description</th>
        <th style="padding: 10px; text-align: right; border: 1px solid #E5E7EB;">Amount</th>
      </tr>
      {{lineItems}}
    </table>
    <div style="text-align: right; font-size: 18px; font-weight: bold; margin: 20px 0;">
      Total: {{currency}}{{totalAmount}}
    </div>
    <p>Payment is due by <strong>{{dueDate}}</strong>.</p>
    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
      <p>Best regards,<br>{{companyName}}</p>
    </div>
  </div>
</body>
</html>`,
    `Dear {{customerName}},

Thank you for your business. Please find your invoice details below:

Invoice #: {{invoiceNumber}}

{{lineItems}}

Total: {{currency}}{{totalAmount}}

Payment is due by {{dueDate}}.

Best regards,
{{companyName}}`,
    ['invoiceNumber', 'companyName', 'customerName', 'lineItems', 'totalAmount', 'currency', 'dueDate'],
    'billing'
  ),

  createBuiltinTemplate(
    'approval-request',
    'Approval Required: {{requestTitle}}',
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #D97706; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0;">Approval Required</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Hi {{approverName}},</p>
    <p><strong>{{requesterName}}</strong> has submitted a request that requires your approval.</p>
    <div style="background: #F9FAFB; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #D97706;">
      <p style="margin: 0;"><strong>{{requestTitle}}</strong></p>
      <p style="margin: 5px 0 0 0; color: #6B7280;">{{requestDescription}}</p>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{approveLink}}" style="background: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 10px;">Approve</a>
      <a href="{{rejectLink}}" style="background: #DC2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reject</a>
    </div>
    <p style="color: #6B7280; font-size: 14px;">Requested on {{requestDate}}</p>
    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
      <p>Best regards,<br>{{companyName}}</p>
    </div>
  </div>
</body>
</html>`,
    `Hi {{approverName}},

{{requesterName}} has submitted a request that requires your approval.

Request: {{requestTitle}}
{{requestDescription}}

Approve: {{approveLink}}
Reject: {{rejectLink}}

Requested on {{requestDate}}

Best regards,
{{companyName}}`,
    ['approverName', 'requesterName', 'requestTitle', 'requestDescription', 'approveLink', 'rejectLink', 'requestDate', 'companyName'],
    'workflow'
  ),

  createBuiltinTemplate(
    'notification',
    '{{notificationTitle}}',
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #2563EB; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0;">{{notificationTitle}}</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Hi {{userName}},</p>
    <div style="background: #F9FAFB; padding: 15px; border-radius: 6px; margin: 15px 0;">
      <p style="margin: 0;">{{notificationBody}}</p>
    </div>
    {{#if actionLink}}
    <div style="text-align: center; margin: 20px 0;">
      <a href="{{actionLink}}" style="background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">{{actionLabel}}</a>
    </div>
    {{/if}}
    <p style="color: #6B7280; font-size: 14px;">Sent on {{sentDate}}</p>
    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
      <p>Best regards,<br>{{companyName}}</p>
    </div>
  </div>
</body>
</html>`,
    `Hi {{userName}},

{{notificationBody}}

Sent on {{sentDate}}

Best regards,
{{companyName}}`,
    ['notificationTitle', 'userName', 'notificationBody', 'actionLink', 'actionLabel', 'sentDate', 'companyName'],
    'notifications'
  ),
];

// ─── Template Engine ──────────────────────────────────────────────────────────

type VariableResolver = (key: string) => string;

export class EmailTemplateEngine {
  private readonly registry: Map<string, EmailTemplate> = new Map();
  private readonly resolvers: Map<string, VariableResolver> = new Map();

  constructor() {
    // Register all built-in templates
    for (const template of BUILTIN_TEMPLATES) {
      this.registry.set(template.name, template);
    }
  }

  loadTemplate(name: string): EmailTemplate {
    const template = this.registry.get(name);
    if (!template) {
      throw new Error(`Email template not found: ${name}`);
    }
    return { ...template };
  }

  render(
    template: EmailTemplate,
    variables: Record<string, string>
  ): { html: string; text: string } {
    const html = this.interpolate(template.html, variables);
    const text = this.interpolate(template.text, variables);

    return {
      html: sanitizeHtml(html),
      text,
    };
  }

  createSystemTemplate(
    name: string,
    subject: string,
    htmlBody: string
  ): EmailTemplate {
    const id = crypto.createHash('sha256').update(`system:${name}:${Date.now()}`).digest('hex').substring(0, 12);

    // Extract variables from the template
    const variables = this.extractVariables(subject + ' ' + htmlBody);

    const textBody = this.htmlToPlainText(htmlBody);

    const template: EmailTemplate = {
      id,
      name,
      subject,
      html: htmlBody,
      text: textBody,
      variables,
      category: 'system',
    };

    this.registry.set(name, template);
    return { ...template };
  }

  registerVariable(name: string, resolver: VariableResolver): void {
    this.resolvers.set(name, resolver);
  }

  /** List all registered template names */
  listTemplates(): string[] {
    return Array.from(this.registry.keys());
  }

  /** Check if a template exists */
  hasTemplate(name: string): boolean {
    return this.registry.has(name);
  }

  /** Extract {{variable}} names from a template string */
  private extractVariables(template: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const vars = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(template)) !== null) {
      vars.add(match[1]);
    }
    return Array.from(vars);
  }

  /** Replace {{variable}} placeholders with values */
  private interpolate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      if (variables[key] !== undefined) {
        return variables[key];
      }
      const resolver = this.resolvers.get(key);
      if (resolver) {
        return resolver(key);
      }
      return match;
    });
  }

  /** Basic HTML to plain text conversion */
  private htmlToPlainText(html: string): string {
    let text = html;

    // Replace block-level elements with newlines
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/?(p|div|h[1-6]|li|tr|blockquote)[^>]*>/gi, '\n');
    text = text.replace(/<\/?(ul|ol|table|thead|tbody|tfoot)[^>]*>/gi, '\n');

    // Remove all remaining tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode common HTML entities
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&nbsp;/g, ' ');

    // Collapse excessive whitespace
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }
}