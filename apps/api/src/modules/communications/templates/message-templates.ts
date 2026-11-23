import type { MessageTemplate } from '@dostelo/types';

/**
 * Message templates (Phase 6). Templates are code-versioned in
 * this chunk (the Prisma MessageTemplate model is where
 * staff-edited templates land later); the rendered output is
 * stored on every communication log entry, so what a customer
 * was actually sent never depends on a template's later edits.
 *
 * Variables use {{name}} placeholders. The recovery flow supplies
 * firstName, itemCount, total (formatted, e.g. "BDT 1850.00") and
 * recoveryLink (the unguessable token URL).
 */
export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: 'recovery-whatsapp-1',
    channel: 'whatsapp',
    subject: null,
    body: 'Hi {{firstName}}, you left {{itemCount}} item(s) in your Dostelo bag, total {{total}}. Complete your order here: {{recoveryLink}}',
  },
  {
    key: 'recovery-email-1',
    channel: 'email',
    subject: 'You left something in your Dostelo bag',
    body: 'Hi {{firstName}},\n\nYour Dostelo bag is waiting for you: {{itemCount}} item(s), total {{total}}.\n\nComplete your order here: {{recoveryLink}}\n\nIf you have already placed your order, please ignore this message.',
  },
  {
    key: 'recovery-sms-1',
    channel: 'sms',
    subject: null,
    body: 'Dostelo: your bag ({{itemCount}} item(s), {{total}}) is waiting. Complete your order: {{recoveryLink}}',
  },
  {
    key: 'recovery-call-1',
    channel: 'call',
    subject: null,
    body: 'Call script: greet {{firstName}}, mention the Dostelo bag of {{itemCount}} item(s) totalling {{total}}, offer help completing the order and share the recovery link {{recoveryLink}} if they want it. Record the outcome honestly, including any opt-out.',
  },
];

export function findTemplate(key: string): MessageTemplate | null {
  return MESSAGE_TEMPLATES.find((template) => template.key === key) ?? null;
}

/** Substitutes {{variable}} placeholders. Unknown placeholders
 * are left untouched so a template mistake is visible in the log
 * instead of silently blanked. */
export function renderTemplateText(
  text: string,
  variables: Record<string, string | number>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in variables ? String(variables[name]) : match,
  );
}

export function renderTemplate(
  template: MessageTemplate,
  variables: Record<string, string | number>,
): { subject: string | null; body: string } {
  return {
    subject: template.subject
      ? renderTemplateText(template.subject, variables)
      : null,
    body: renderTemplateText(template.body, variables),
  };
}
