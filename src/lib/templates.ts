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
    linkedin_url: contact.linkedinUrl || "",
    company_url: contact.companyUrl || "",
    notes: contact.notes,
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export const DEFAULT_INITIAL_SUBJECT =
  "Quick question for {{company}}";

export const DEFAULT_INITIAL_BODY = `<p>Hi {{first_name}},</p>
<p>I'm reaching out from our team. We work with companies like <strong>{{company}}</strong> and thought there might be a good fit to connect.</p>
<p>Would you be open to a brief 15-minute call this week?</p>`;

export const DEFAULT_FOLLOWUP_SUBJECT = "Following up — {{company}}";

export const DEFAULT_FOLLOWUP_BODY = `<p>Hi {{first_name}},</p>
<p>I wanted to follow up on my previous email about connecting with <strong>{{company}}</strong>.</p>
<p>If now isn't the right time, no worries — just let me know. Otherwise, I'd love to connect for a quick chat.</p>`;

/** C2C / vendor partnership outreach — subject A (value-led) */
export const C2C_VENDOR_SUBJECT_A =
  "IT Staffing Partnership – Ready Bench, Fast Turnaround";

/** C2C / vendor partnership outreach — subject B (personalized) */
export const C2C_VENDOR_SUBJECT_B =
  "Let's Partner – Vendor/C2C Opportunities for {{company}}";

export const C2C_VENDOR_BODY = `<p>Hi {{first_name}},</p>
<p>I hope you're doing well. I'm reaching out from our IT staffing team — we specialize in placing pre-screened consultants across Java, Data Engineering, SAP, and Cloud/DevOps.</p>
<p>We'd love to explore a <strong>vendor / C2C partnership</strong> with <strong>{{company}}</strong>. Here's a quick snapshot of what we bring:</p>
<ul>
<li><strong>Strong bench</strong> of pre-screened, immediately available consultants across in-demand tech stacks</li>
<li><strong>Fast turnaround</strong> — typically 24–48 hours on quality submittals</li>
<li><strong>Full compliance</strong> — E-Verify enabled, active MSA/NDA ready, W2 / C2C / 1099 flexibility</li>
<li><strong>Competitive rates</strong> with transparent margins — no hidden markups</li>
<li><strong>Dedicated account manager</strong> for smooth, responsive communication</li>
</ul>
<p>We'd be glad to sign your MSA and get set up in your vendor portal so we can start submitting candidates against your open requirements.</p>
<p>Could we set up a quick 10–15 min call this week to discuss how we can support {{company}}'s current and upcoming needs?</p>
<p>Looking forward to connecting.</p>`;

export const C2C_VENDOR_FOLLOWUP_SUBJECT =
  "Following up — vendor partnership with {{company}}";

export const C2C_VENDOR_FOLLOWUP_BODY = `<p>Hi {{first_name}},</p>
<p>Just following up on my note about a vendor / C2C partnership with <strong>{{company}}</strong>.</p>
<p>We have pre-screened consultants ready to submit, typically within 24–48 hours, and we're set up for MSA / portal onboarding whenever you're ready.</p>
<p>Would a brief 10–15 min call this week work to see if there's a fit?</p>`;
