import Papa from "papaparse";

export interface LeadInput {
  contactName: string;
  email: string;
  company: string;
  title: string;
  phone: string;
  upworkJobUrl: string;
  linkedinProfileUrl: string;
  linkedinCompanyUrl: string;
  companyWebsite: string;
  source: string;
  status: string;
  researchedBy: string;
  notes: string;
}

const STATUSES = new Set(["new", "researching", "ready", "contacted"]);

const COLUMN_MAP: Record<string, keyof LeadInput> = {
  contact_name: "contactName",
  contactname: "contactName",
  name: "contactName",
  full_name: "contactName",
  fullname: "contactName",
  email: "email",
  "e-mail": "email",
  mail: "email",
  company: "company",
  organization: "company",
  org: "company",
  title: "title",
  job_title: "title",
  position: "title",
  role: "title",
  phone: "phone",
  mobile: "phone",
  telephone: "phone",
  upwork_job_url: "upworkJobUrl",
  upworkjoburl: "upworkJobUrl",
  upwork_url: "upworkJobUrl",
  upwork: "upworkJobUrl",
  job_url: "upworkJobUrl",
  linkedin_profile_url: "linkedinProfileUrl",
  linkedinprofileurl: "linkedinProfileUrl",
  linkedin_url: "linkedinProfileUrl",
  linkedin: "linkedinProfileUrl",
  profile_url: "linkedinProfileUrl",
  linkedin_company_url: "linkedinCompanyUrl",
  linkedincompanyurl: "linkedinCompanyUrl",
  company_linkedin: "linkedinCompanyUrl",
  company_website: "companyWebsite",
  companywebsite: "companyWebsite",
  website: "companyWebsite",
  company_url: "companyWebsite",
  source: "source",
  status: "status",
  researched_by: "researchedBy",
  researchedby: "researchedBy",
  researcher: "researchedBy",
  notes: "notes",
  note: "notes",
  comments: "notes",
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeStatus(value: unknown): string {
  const s = String(value || "new").trim().toLowerCase();
  return STATUSES.has(s) ? s : "new";
}

function emptyLead(): LeadInput {
  return {
    contactName: "",
    email: "",
    company: "",
    title: "",
    phone: "",
    upworkJobUrl: "",
    linkedinProfileUrl: "",
    linkedinCompanyUrl: "",
    companyWebsite: "",
    source: "",
    status: "new",
    researchedBy: "",
    notes: "",
  };
}

/** Map a loose object (CSV row or JSON item) into a LeadInput. */
export function normalizeLeadInput(raw: Record<string, unknown>): LeadInput | null {
  const lead = emptyLead();

  for (const [rawKey, value] of Object.entries(raw)) {
    const camel = rawKey as keyof LeadInput;
    if (camel in lead && value != null) {
      lead[camel] = String(value).trim();
      continue;
    }
    const field = COLUMN_MAP[normalizeHeader(rawKey)];
    if (field) {
      lead[field] = String(value ?? "").trim();
    }
  }

  lead.email = lead.email.toLowerCase();
  lead.status = normalizeStatus(lead.status);
  if (!lead.source && lead.upworkJobUrl) lead.source = "Upwork";
  else if (!lead.source && (lead.linkedinProfileUrl || lead.linkedinCompanyUrl)) {
    lead.source = "LinkedIn";
  }

  if (!lead.contactName && !lead.email && !lead.company && !lead.upworkJobUrl) {
    return null;
  }
  return lead;
}

export function parseLeadsCsv(csvText: string): {
  leads: LeadInput[];
  errors: string[];
} {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const errors: string[] = [];
  if (parsed.errors.length > 0) {
    errors.push(...parsed.errors.map((e) => e.message));
  }

  const leads: LeadInput[] = [];
  for (let i = 0; i < (parsed.data?.length ?? 0); i++) {
    const lead = normalizeLeadInput(parsed.data[i] as Record<string, unknown>);
    if (!lead) {
      errors.push(
        `Row ${i + 2}: need at least contact name, email, company, or Upwork job URL`
      );
      continue;
    }
    leads.push(lead);
  }

  return { leads, errors };
}

export function parseLeadsJson(jsonText: string): {
  leads: LeadInput[];
  errors: string[];
} {
  const errors: string[] = [];
  let text = jsonText.trim();
  // Strip markdown fences ChatGPT/Gemini often wrap around JSON
  if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { leads: [], errors: ["Invalid JSON — paste a JSON array of leads."] };
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { leads?: unknown }).leads)
      ? (parsed as { leads: unknown[] }).leads
      : null;

  if (!rows) {
    return {
      leads: [],
      errors: ['JSON must be an array, or an object with a "leads" array.'],
    };
  }

  const leads: LeadInput[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== "object") {
      errors.push(`Item ${i + 1}: expected an object`);
      continue;
    }
    const lead = normalizeLeadInput(row as Record<string, unknown>);
    if (!lead) {
      errors.push(
        `Item ${i + 1}: need at least contact name, email, company, or Upwork job URL`
      );
      continue;
    }
    leads.push(lead);
  }

  return { leads, errors };
}

/** Detect paste content: JSON if it starts with [ or {, else CSV. */
export function parseLeadsPaste(text: string): {
  leads: LeadInput[];
  errors: string[];
  format: "json" | "csv";
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { leads: [], errors: ["Paste is empty."], format: "csv" };
  }
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const result = parseLeadsJson(trimmed);
    return { ...result, format: "json" };
  }
  const result = parseLeadsCsv(trimmed);
  return { ...result, format: "csv" };
}

export const LEADS_CSV_FORMAT = `contact_name,email,company,title,phone,upwork_job_url,linkedin_profile_url,linkedin_company_url,company_website,source,status,researched_by,notes
Prabal Mahendra,prabal.mahendra@auscompcomputers.com,Auscomp Computers,,,https://www.upwork.com/jobs/~022084149026699057484,https://www.linkedin.com/in/prabal-mahendra/,https://www.linkedin.com/company/auscomp-computers-pty-ltd/,,,Upwork,new,,Found via Upwork job + LinkedIn people search`;

export const LEADS_JSON_SAMPLE = `[
  {
    "contactName": "Prabal Mahendra",
    "email": "prabal.mahendra@auscompcomputers.com",
    "company": "Auscomp Computers",
    "title": "",
    "phone": "",
    "upworkJobUrl": "https://www.upwork.com/jobs/~022084149026699057484",
    "linkedinProfileUrl": "https://www.linkedin.com/in/prabal-mahendra/",
    "linkedinCompanyUrl": "https://www.linkedin.com/company/auscomp-computers-pty-ltd/",
    "companyWebsite": "",
    "source": "Upwork",
    "status": "new",
    "researchedBy": "",
    "notes": "Found via Upwork job + LinkedIn people search"
  }
]`;

export const LEADS_AI_PROMPT = `You are helping a data research team extract outreach leads into structured data for our CRM.

From the raw notes / links / emails I paste below, output ONLY valid JSON — no markdown fences, no commentary.

Return a JSON array. Each object must use these exact keys (use "" for unknown values):
- contactName (string) — full name
- email (string)
- company (string)
- title (string) — job title / role
- phone (string)
- upworkJobUrl (string) — full Upwork job URL if present
- linkedinProfileUrl (string) — linkedin.com/in/... URL
- linkedinCompanyUrl (string) — linkedin.com/company/... URL
- companyWebsite (string)
- source (string) — one of: Upwork, LinkedIn, Website, Referral, Other
- status (string) — always "new" unless I say otherwise
- researchedBy (string) — leave "" unless I name the researcher
- notes (string) — short context: how found, job summary, next steps

Rules:
- One object per person / lead
- Keep URLs complete and absolute (https://...)
- Do not invent emails or names; leave "" if not in the source
- Prefer source "Upwork" when an Upwork job URL exists

Example shape:
[
  {
    "contactName": "Prabal Mahendra",
    "email": "prabal.mahendra@auscompcomputers.com",
    "company": "Auscomp Computers",
    "title": "",
    "phone": "",
    "upworkJobUrl": "https://www.upwork.com/jobs/~022084149026699057484",
    "linkedinProfileUrl": "https://www.linkedin.com/in/prabal-mahendra/",
    "linkedinCompanyUrl": "https://www.linkedin.com/company/auscomp-computers-pty-ltd/",
    "companyWebsite": "",
    "source": "Upwork",
    "status": "new",
    "researchedBy": "",
    "notes": "Found via Upwork job + LinkedIn people search"
  }
]

--- RAW RESEARCH (paste your links, emails, and notes below this line) ---
`;
