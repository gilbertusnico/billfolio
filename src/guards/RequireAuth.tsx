import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useInvoiceData } from "../context/InvoiceDataContext";
import OnboardingGate from "./OnboardingGate";

/**
 * Gate for every private route:
 * - not signed in                     → /login (remembers where you were headed)
 * - signed in, no companies           → rendered behind a locked "Add New
 *   Company" modal (OnboardingGate) until the user creates one
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useInvoiceData();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <OnboardingGate>{children}</OnboardingGate>;
}