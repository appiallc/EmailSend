import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isLikelyBounce, parseBounceEmail } from "./bounces.ts";

function bounceMail(overrides: {
  fromAddress?: string;
  fromName?: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
}) {
  return {
    fromAddress: overrides.fromAddress ?? "mailer-daemon@googlemail.com",
    fromName: overrides.fromName ?? "Mail Delivery Subsystem",
    subject: overrides.subject ?? "Delivery Status Notification (Failure)",
    text: overrides.text ?? "",
    html: overrides.html,
    headers: overrides.headers ?? {},
  };
}

describe("parseBounceEmail", () => {
  it("detects recipient inbox full as SOFT_BOUNCE", () => {
    const result = parseBounceEmail(
      bounceMail({
        text: `Final-Recipient: rfc822; john@example.com
Diagnostic-Code: smtp; 452 4.2.2 Recipient inbox full`,
      })
    );
    assert.equal(result.isBounce, true);
    assert.equal(result.recipient, "john@example.com");
    assert.equal(result.bounceType, "SOFT_BOUNCE");
    assert.match(result.reason ?? "", /inbox full/i);
  });

  it("detects user not found as HARD_BOUNCE", () => {
    const result = parseBounceEmail(
      bounceMail({
        subject: "Mail delivery failed: returning message to sender",
        text: `Your message wasn't delivered to jane@example.com because the address couldn't be found.
Diagnostic-Code: smtp; 550 5.1.1 User unknown`,
      })
    );
    assert.equal(result.isBounce, true);
    assert.equal(result.recipient, "jane@example.com");
    assert.equal(result.bounceType, "HARD_BOUNCE");
  });

  it("detects domain not found as HARD_BOUNCE", () => {
    const result = parseBounceEmail(
      bounceMail({
        text: `Final-Recipient: rfc822; user@missing-domain.test
Diagnostic-Code: smtp; 550 5.4.1 Host not found`,
      })
    );
    assert.equal(result.isBounce, true);
    assert.equal(result.recipient, "user@missing-domain.test");
    assert.equal(result.bounceType, "HARD_BOUNCE");
    assert.match(result.reason ?? "", /host not found/i);
  });

  it("detects mailbox unavailable as HARD_BOUNCE", () => {
    const result = parseBounceEmail(
      bounceMail({
        text: `Final-Recipient: rfc822; bob@corp.com
Diagnostic-Code: smtp; 550 5.0.0 Mailbox unavailable`,
      })
    );
    assert.equal(result.isBounce, true);
    assert.equal(result.recipient, "bob@corp.com");
    assert.equal(result.bounceType, "HARD_BOUNCE");
  });

  it("does not classify a normal reply as bounce", () => {
    const result = parseBounceEmail({
      fromAddress: "prospect@company.com",
      fromName: "Jane Prospect",
      subject: "Re: Quick question for Acme",
      text: "Thanks for reaching out. Let's talk next week.",
      headers: {
        "in-reply-to": "<tracking123@myapp.com>",
      },
    });
    assert.equal(result.isBounce, false);
  });

  it("ignores newsletter emails", () => {
    const result = parseBounceEmail({
      fromAddress: "news@marketing.io",
      fromName: "Marketing Weekly",
      subject: "Your weekly digest",
      text: "Top stories this week...",
      headers: {},
    });
    assert.equal(result.isBounce, false);
  });

  it("does not treat forwarded email as bounce without DSN markers", () => {
    const result = parseBounceEmail({
      fromAddress: "colleague@company.com",
      fromName: "Colleague",
      subject: "Fwd: Project update",
      text: `---------- Forwarded message ----------
From: someone@external.com
Subject: Project update

Here is the update.`,
      headers: {},
    });
    assert.equal(result.isBounce, false);
  });

  it("detects bounce via X-Failed-Recipients header", () => {
    const result = parseBounceEmail(
      bounceMail({
        text: "Delivery failed permanently.",
        headers: { "x-failed-recipients": "failed@example.org" },
      })
    );
    assert.equal(result.isBounce, true);
    assert.equal(result.recipient, "failed@example.org");
  });
});

describe("isLikelyBounce", () => {
  it("returns true for mailer-daemon sender", () => {
    assert.equal(
      isLikelyBounce(
        bounceMail({ subject: "Hello", text: "Random body without DSN markers" })
      ),
      true
    );
  });
});
