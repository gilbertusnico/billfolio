import type { ReactNode } from "react";
import { useInvoiceData } from "../context/InvoiceDataContext";
import CompanyModal from "../components/CompanyModal";
import type { CompanyInput } from "../components/CompanyModal";
import { useToast } from "../components/Toast";
import { friendlyError } from "../lib/api";

/**
 * Locks a signed-in, non-admin user who has no company into a NON-dismissible
 * "Add New Company" modal. They must create a company before any feature can
 * be used — no Escape, no backdrop click, no Cancel. The app renders behind
 * the overlay but nothing behind it is reachable.
 */
export default function OnboardingGate({ children }: { children: ReactNode }) {
  const { needsOnboarding, addCompany } = useInvoiceData();
  const { showToast } = useToast();

  if (!needsOnboarding) return <>{children}</>;

  const handleSave = async (input: CompanyInput) => {
    try {
      const company = await addCompany(input);
      showToast(`${company.companyName || "Company"} created — welcome aboard!`);
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
    // On success `needsOnboarding` flips to false and this gate unmounts the
    // modal. On failure the modal simply stays open — it cannot be dismissed.
  };

  return (
    <>
      {children}
      <CompanyModal open dismissible={false} onClose={() => {}} onSave={handleSave} />
    </>
  );
}