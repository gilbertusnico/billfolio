import { supabase } from "./api";

export type ProposalStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "PAID" | "EXPIRED";

export interface ProposalAddon {
  id: string;
  proposal_id: string;
  title: string;
  description: string | null;
  price: number;
  is_required: boolean;
  is_selected: boolean;
}

export interface ProposalMilestone {
  id: string;
  proposal_id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

export interface Proposal {
  id: string;
  agency_id: string;
  company_id: string;
  client_id: string | null;
  payment_bank_account_id: string | null;
  dp_invoice_id: string | null;
  client_signature_path?: string | null;
  token: string;
  title: string;
  client_name: string;
  client_company: string | null;
  client_email: string;
  project_summary: string | null;
  base_price: number;
  dp_percentage: number;
  status: ProposalStatus;
  total_amount: number;
  dp_amount: number;
  approved_at: string | null;
  client_signature_url: string | null;
  created_at: string;
  payment_bank_name: string | null;
  payment_account_number: string | null;
  payment_account_holder: string | null;
  agency_whatsapp_number: string | null;
  addons?: ProposalAddon[];
  milestones?: ProposalMilestone[];
}

export interface NewProposal {
  agencyId: string;
  workspaceId: string;
  clientId: string;
  title: string;
  clientName: string;
  clientCompany: string;
  clientEmail: string;
  projectSummary: string;
  basePrice: number;
  dpPercentage: number;
  paymentBank: { id: string; name: string; accountNumber: string; holder: string };
  agencyWhatsappNumber: string;
  addons: { title: string; description: string; price: number; isRequired: boolean }[];
  milestones: { title: string; description: string }[];
}

export async function fetchAgencyProposals(agencyId: string, workspaceId: string): Promise<Proposal[]> {
  const { data, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("company_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Proposal[];
}

export async function fetchAgencyProposal(
  proposalId: string,
  agencyId: string,
  workspaceId: string
): Promise<Proposal | null> {
  const { data, error } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", proposalId)
    .eq("agency_id", agencyId)
    .eq("company_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [addonsResult, milestonesResult] = await Promise.all([
    supabase.from("proposal_addons").select("*").eq("proposal_id", proposalId).order("created_at"),
    supabase
      .from("proposal_milestones")
      .select("*")
      .eq("proposal_id", proposalId)
      .order("sort_order"),
  ]);
  if (addonsResult.error) throw addonsResult.error;
  if (milestonesResult.error) throw milestonesResult.error;

  return {
    ...(data as Proposal),
    addons: (addonsResult.data ?? []) as ProposalAddon[],
    milestones: (milestonesResult.data ?? []) as ProposalMilestone[],
  };
}

export async function fetchPublicProposal(token: string): Promise<Proposal | null> {
  const { data, error } = await supabase.rpc("get_public_proposal", { p_token: token });
  if (error) throw error;
  if (!data) return null;

  const result = data as { proposal: Proposal; addons: ProposalAddon[]; milestones: ProposalMilestone[] };
  return {
    ...result.proposal,
    addons: result.addons,
    milestones: result.milestones,
  };
}

export interface ProposalValidationIssue {
  message: string;
  value?: unknown;
}

/**
 * Server-grade validation shared by the builder UI and the DB layer so a
 * proposal can never be persisted with an invalid amount, percentage, or email.
 */
export function validateProposalInput(input: Pick<
  NewProposal,
  "title" | "clientName" | "clientEmail" | "basePrice" | "dpPercentage" | "addons" | "milestones"
>): ProposalValidationIssue[] {
  const issues: ProposalValidationIssue[] = [];
  if (!String(input.title ?? "").trim()) {
    issues.push({ message: "Project title is required." });
  }
  if (!String(input.clientName ?? "").trim()) {
    issues.push({ message: "Client name is required." });
  }
  const email = String(input.clientEmail ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    issues.push({ message: "Enter a valid client email address.", value: email });
  }
  if (!Number.isFinite(input.basePrice) || input.basePrice < 0) {
    issues.push({ message: "Base price must be a valid non-negative amount.", value: input.basePrice });
  }
  if (!Number.isInteger(input.dpPercentage) || input.dpPercentage < 1 || input.dpPercentage > 100) {
    issues.push({ message: "DP percentage must be a whole number from 1 to 100.", value: input.dpPercentage });
  }
  for (const addon of input.addons) {
    if (!String(addon.title ?? "").trim()) {
      issues.push({ message: "Add-on title is required." });
    }
    if (!Number.isFinite(addon.price) || addon.price < 0) {
      issues.push({ message: `Add-on "${addon.title}" needs a valid non-negative price.`, value: addon.price });
    }
  }
  for (const milestone of input.milestones) {
    if (!String(milestone.title ?? "").trim()) {
      issues.push({ message: "Milestone title is required." });
    }
  }
  return issues;
}

export async function createProposal(input: NewProposal): Promise<Proposal> {
  const issues = validateProposalInput(input);
  if (issues.length) throw new Error(issues[0].message);

  const token = crypto.randomUUID();
  const initialTotal =
    input.basePrice +
    input.addons
      .filter((addon) => addon.isRequired)
      .reduce((total, addon) => total + addon.price, 0);
  const { data, error } = await supabase
    .from("proposals")
    .insert({
      agency_id: input.agencyId,
      company_id: input.workspaceId,
      client_id: input.clientId,
      token,
      title: input.title.trim(),
      client_name: input.clientName.trim(),
      client_company: input.clientCompany?.trim() || null,
      client_email: input.clientEmail.trim().toLowerCase(),
      project_summary: input.projectSummary || null,
      base_price: input.basePrice,
      dp_percentage: input.dpPercentage,
      payment_bank_name: input.paymentBank.name,
      payment_bank_account_id: input.paymentBank.id,
      payment_account_number: input.paymentBank.accountNumber,
      payment_account_holder: input.paymentBank.holder,
      agency_whatsapp_number: input.agencyWhatsappNumber,
      status: "DRAFT",
      total_amount: initialTotal,
      dp_amount: Math.round(initialTotal * (input.dpPercentage / 100)),
    })
    .select("*")
    .single();
  if (error) throw error;

  const proposal = data as Proposal;
  try {
    const addons = input.addons.map((addon) => ({
      proposal_id: proposal.id,
      title: addon.title,
      description: addon.description || null,
      price: addon.price,
      is_required: addon.isRequired,
      is_selected: addon.isRequired,
    }));
    const milestones = input.milestones.map((milestone, index) => ({
      proposal_id: proposal.id,
      title: milestone.title,
      description: milestone.description || null,
      sort_order: index,
    }));
    const writes = await Promise.all([
      addons.length ? supabase.from("proposal_addons").insert(addons) : Promise.resolve({ error: null }),
      milestones.length
        ? supabase.from("proposal_milestones").insert(milestones)
        : Promise.resolve({ error: null }),
    ]);
    const writeError = writes.find((result) => result.error)?.error;
    if (writeError) throw writeError;
  } catch (writeError) {
    const { error: rollbackError } = await supabase
      .from("proposals")
      .delete()
      .eq("id", proposal.id)
      .eq("agency_id", input.agencyId);
    if (rollbackError) {
      console.error("Could not roll back incomplete proposal creation:", rollbackError);
      throw new Error(
        `Proposal was created, but its add-ons or milestones could not be saved. Cleanup also failed: ${rollbackError.message}`
      );
    }
    throw writeError;
  }

  return proposal;
}

export async function updateProposal(
  proposalId: string,
  agencyId: string,
  workspaceId: string,
  input: NewProposal
): Promise<void> {
  const issues = validateProposalInput(input);
  if (issues.length) throw new Error(issues[0].message);

  const { error } = await supabase.rpc("update_proposal", {
    p_proposal_id: proposalId,
    p_agency_id: agencyId,
    p_workspace_id: workspaceId,
    p_payload: {
      client_id: input.clientId,
      title: input.title.trim(),
      client_name: input.clientName.trim(),
      client_company: input.clientCompany?.trim() || null,
      client_email: input.clientEmail.trim().toLowerCase(),
      project_summary: input.projectSummary || null,
      base_price: input.basePrice,
      dp_percentage: input.dpPercentage,
      payment_bank_account_id: input.paymentBank.id,
      payment_bank_name: input.paymentBank.name,
      payment_account_number: input.paymentBank.accountNumber,
      payment_account_holder: input.paymentBank.holder,
      agency_whatsapp_number: input.agencyWhatsappNumber,
    },
    p_addons: input.addons.map((addon) => ({
      title: addon.title.trim(),
      description: addon.description || null,
      price: addon.price,
      is_required: addon.isRequired,
      is_selected: addon.isRequired,
    })),
    p_milestones: input.milestones.map((milestone) => ({
      title: milestone.title.trim(),
      description: milestone.description || null,
    })),
  });
  if (error) throw error;
}

export async function markProposalSent(
  proposalId: string,
  agencyId: string,
  workspaceId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("proposals")
    .update({ status: "SENT" })
    .eq("id", proposalId)
    .eq("agency_id", agencyId)
    .eq("company_id", workspaceId)
    .eq("status", "DRAFT")
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This proposal is no longer a draft, so it could not be marked as sent.");
  }
}

export async function respondToProposal(
  token: string,
  response: "APPROVED" | "REJECTED",
  selectedAddonIds: string[],
  signatureUrl: string | null = null
): Promise<{ invoiceId: string | null }> {
  const { data, error } = await supabase.rpc("respond_to_proposal", {
    p_token: token,
    p_response: response,
    p_selected_addon_ids: selectedAddonIds,
    p_signature_url: signatureUrl,
  });
  if (error) throw error;
  const result = data as { ok?: boolean; invoice_id?: string | null } | null;
  if (!result?.ok) throw new Error("This proposal is no longer accepting a response.");
  return { invoiceId: result.invoice_id ?? null };
}

export async function ensureApprovedProposalInvoice(token: string): Promise<string> {
  const { data, error } = await supabase.rpc("ensure_proposal_dp_invoice", { p_token: token });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("The DP invoice could not be prepared.");
  return data;
}

export function isProposalToken(token: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
}
