import type { Contact } from "@prisma/client";

export function renderTemplate(template: string, contact: Contact): string {
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  const vars: Record<string, string> = {
    email: contact.email,
    first_name: contact.firstName,
    last_name: contact.lastName,
    full_name: fullName || contact.email,
    company: contact.company,
    title: contact.title,
    phone: contact.phone,
    notes: contact.notes,
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export const DEFAULT_INITIAL_SUBJECT =
  "Quick question for {{company}}";

export const DEFAULT_INITIAL_BODY = `<p>Hi {{first_name}},</p>
<p>I'm reaching out from our team. We work with companies like <strong>{{company}}</strong> and thought there might be a good fit to connect.</p>
<p>Would you be open to a brief 15-minute call this week?</p>
<p>Best regards,<br/>Your Team</p>`;

export const DEFAULT_FOLLOWUP_SUBJECT = "Following up — {{company}}";

export const DEFAULT_FOLLOWUP_BODY = `<p>Hi {{first_name}},</p>
<p>I wanted to follow up on my previous email about connecting with <strong>{{company}}</strong>.</p>
<p>If now isn't the right time, no worries — just let me know. Otherwise, I'd love to connect for a quick chat.</p>
<p>Best regards,<br/>Your Team</p>`;
