import { describe, it, expect } from "vitest";
import { isProposalToken } from "../src/lib/proposal";

/**
 * SIT Unit Checks — Proposal token validation (ClientProposal.tsx gate)
 * Run: npx vitest run tests/proposal
 */

const V4 = "3f2504e0-4f89-11d3-9a0c-0305e82b63bf"; // valid UUID v1 digit -> rejected by [1-8]? actually v1 allowed by regex
describe("isProposalToken — format gate for /p/:token", () => {
  it("accepts a canonical UUIDv4", () => {
    expect(isProposalToken("3f2504e0-4f89-41d3-9a0c-0305e82b63bf")).toBe(true);
  });

  it("accepts uppercase (regex has /i flag)", () => {
    expect(isProposalToken("3F2504E0-4F89-41D3-9A0C-0305E82B63BF")).toBe(true);
  });

  it("rejects non-UUID strings without hitting the RPC", () => {
    expect(isProposalToken("not-a-uuid")).toBe(false);
    expect(isProposalToken("")).toBe(false);
    expect(isProposalToken(V4.slice(0, -1))).toBe(false); // truncated
  });

  it("rejects wrong version nibble (version 9 is invalid per [1-8])", () => {
    expect(isProposalToken("3f2504e0-4f89-91d3-9a0c-0305e82b63bf")).toBe(false);
  });

  it("rejects bad variant nibble (variant must be 8/9/a/b)", () => {
    expect(isProposalToken("3f2504e0-4f89-41d3-ca0c-0305e82b63bf")).toBe(false);
  });

  it("rejects injection-ish payloads (path traversal, quotes)", () => {
    expect(isProposalToken("../../etc/passwd")).toBe(false);
    expect(isProposalToken("3f2504e0' OR '1'='1")).toBe(false);
  });

  it("note: UUIDv1 passes the gate — document as accepted behavior", () => {
    // [1-8] allows v1; get_public_proposal will simply return null if unknown.
    expect(isProposalToken("3f2504e0-4f89-11d3-9a0c-0305e82b63bf")).toBe(true);
  });
});
