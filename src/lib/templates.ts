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

/** C2C / vendor partnership — subject A (value-led) */
export const C2C_VENDOR_SUBJECT_A =
  "Vendor Partnership – Mutual Growth for {{company}}";

/** C2C / vendor partnership — subject B (personalized) */
export const C2C_VENDOR_SUBJECT_B =
  "Let's Build a C2C Vendor Partnership with {{company}}";

export const C2C_VENDOR_BODY = `<p>Hi {{first_name}},</p>
<p>I hope you're doing well. I'm reaching out from our IT staffing team — we place pre-screened consultants across <strong>MERN, Angular, GenAI, MS365, Java, WordPress/Shopify, SAP, QA/BA, and Cloud/DevOps</strong>.</p>
<p>We're looking to build a long-term <strong>vendor / C2C partnership</strong> with <strong>{{company}}</strong> — one that benefits both sides: you get reliable, ready-to-deploy talent for open roles, and we get a trusted channel to place our bench. Here's what we bring:</p>
<ul>
<li><strong>Strong bench</strong> — pre-screened consultants ready to deploy across the stacks above</li>
<li><strong>Fast turnaround</strong> — quality submittals typically within 24–48 hours</li>
<li><strong>C2C vendor engagement</strong> — clean corp-to-corp setup, MSA/NDA ready, GST-ready invoicing</li>
<li><strong>Transparent rates</strong> — competitive pricing with clear margins, no hidden markups</li>
<li><strong>Dedicated account manager</strong> — one point of contact for quick, reliable communication</li>
</ul>
<p>Happy to sign your MSA, complete vendor onboarding, and start submitting against your open requirements — so together we can close roles faster.</p>
<p>Could we book a quick 10–15 min call this week to explore a mutually beneficial partnership with {{company}}?</p>
<p>Looking forward to connecting.</p>`;

export const C2C_VENDOR_FOLLOWUP_SUBJECT =
  "Following up — vendor partnership with {{company}}";

export const C2C_VENDOR_FOLLOWUP_BODY = `<p>Hi {{first_name}},</p>
<p>Just following up on my note about a long-term <strong>vendor / C2C partnership</strong> with <strong>{{company}}</strong> — mutually beneficial for both our teams.</p>
<p>We have pre-screened consultants across MERN, Angular, GenAI, MS365, Java, WordPress/Shopify, SAP, QA/BA, and Cloud/DevOps — typically ready to submit within 24–48 hours. We're set for MSA / vendor onboarding whenever you are.</p>
<p>Would a brief 10–15 min call this week work to explore how we can support each other?</p>`;
