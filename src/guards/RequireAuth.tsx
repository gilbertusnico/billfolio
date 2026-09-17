import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useInvoiceData } from "../context/InvoiceDataContext";

/**
 * Gate for every private route:
 * - not signed in             → /login (remembers where you were headed)
 * - signed in, no companies   → /onboarding (first-time setup)
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, needsOnboarding } = useInvoiceData();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}