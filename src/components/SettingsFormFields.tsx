"use client";

import { useState } from "react";
import { PASSWORD_MASK } from "@/lib/password-mask";

export { PASSWORD_MASK };

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M1 1l22 22" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  );
}

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  error,
  autoComplete = "off",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const isMasked = value === PASSWORD_MASK;
  // Don't put the API mask in the input — it looks like a password and breaks show/hide.
  const displayValue = isMasked ? "" : value;
  const canToggle = displayValue.length > 0;

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          type={visible && canToggle ? "text" : "password"}
          autoComplete={autoComplete}
          className={`w-full border rounded-lg px-3 py-2 pr-10 text-sm ${
            error ? "border-red-300 focus:outline-none focus:ring-2 focus:ring-red-200" : ""
          }`}
          value={displayValue}
          placeholder={
            isMasked
              ? "Password saved — type to change"
              : placeholder
          }
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error && id ? `${id}-error` : undefined}
        />
        <button
          type="button"
          onClick={() => {
            if (!canToggle) return;
            setVisible((v) => !v);
          }}
          disabled={!canToggle}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-800 rounded disabled:opacity-40 disabled:hover:text-slate-500"
          aria-label={visible ? "Hide password" : "Show password"}
          title={
            canToggle
              ? visible
                ? "Hide password"
                : "Show password"
              : isMasked
                ? "Type a new password to show/hide"
                : "Enter a password first"
          }
        >
          {visible && canToggle ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {error && (
        <p id={id ? `${id}-error` : undefined} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormField({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
}: {
  id?: string;
  label: string;
  type?: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1">
        {label}
      </label>
      <input
        id={id}
        type={type}
        className={`w-full border rounded-lg px-3 py-2 text-sm ${
          error ? "border-red-300 focus:outline-none focus:ring-2 focus:ring-red-200" : ""
        }`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error && id ? `${id}-error` : undefined}
      />
      {error && (
        <p id={id ? `${id}-error` : undefined} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
      {!error && hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
