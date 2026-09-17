import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useInvoiceData } from "../context/InvoiceDataContext";
import CompanyModal from "../components/CompanyModal";
import type { CompanyInput } from "../components/CompanyModal";
import { useToast } from "../components/Toast";
import { friendlyError } from "../lib/api";

/**
 * Gate for every private route:
 * - not signed in             → /login (remembers where you were headed)
 * - signed in, no companies   → /onboarding (first-time setup)
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, needsOnboarding, addCompany } = useInvoiceData();
  const { showToast } = useToast();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  const handleAddCompany = async (input: CompanyInput) => {
    try {
      const company = await addCompany(input);
      showToast(`${company.companyName || "Company"} created — it's now active`);
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };

  return (
    <>
      {children}
      <CompanyModal open={needsOnboarding} onClose={() => undefined} onSave={handleAddCompany} />
    </>
  );
}