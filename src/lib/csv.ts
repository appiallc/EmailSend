import Papa from "papaparse";

export interface ParsedContact {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  phone: string;
  notes: string;
}

const COLUMN_MAP: Record<string, keyof ParsedContact> = {
  email: "email",
  "e-mail": "email",
  mail: "email",
  first_name: "firstName",
  firstname: "firstName",
  first: "firstName",
  fname: "firstName",
  last_name: "lastName",
  lastname: "lastName",
  last: "lastName",
  lname: "lastName",
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
  tel: "phone",
  notes: "notes",
  note: "notes",
  comments: "notes",
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

function mapRow(row: Record<string, string>): ParsedContact | null {
  const contact: ParsedContact = {
    email: "",
    firstName: "",
    lastName: "",
    company: "",
    title: "",
    phone: "",
    notes: "",
  };

  for (const [rawKey, value] of Object.entries(row)) {
    const key = normalizeHeader(rawKey);
    const field = COLUMN_MAP[key];
    if (field) {
      contact[field] = (value ?? "").trim();
    }
  }

  if (!contact.email || !contact.email.includes("@")) return null;
  return contact;
}

export function parseContactsCsv(csvText: string): {
  contacts: ParsedContact[];
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

  const contacts: ParsedContact[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < (parsed.data?.length ?? 0); i++) {
    const row = parsed.data[i];
    const contact = mapRow(row);
    if (!contact) {
      errors.push(`Row ${i + 2}: missing or invalid email`);
      continue;
    }
    const lower = contact.email.toLowerCase();
    if (seen.has(lower)) {
      errors.push(`Row ${i + 2}: duplicate email ${contact.email}`);
      continue;
    }
    seen.add(lower);
    contacts.push(contact);
  }

  return { contacts, errors };
}

export const CSV_FORMAT = `email,first_name,last_name,company,title,phone,notes
john.doe@acme.com,John,Doe,Acme Corp,CTO,+1-555-0100,Met at conference
jane.smith@techco.io,Jane,Smith,TechCo,IT Director,+1-555-0101,Referred by partner`;
