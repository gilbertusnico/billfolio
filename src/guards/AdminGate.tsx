import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useInvoiceData } from "../context/InvoiceDataContext";

/** Restricts a route to Super Admins — everyone else is sent home. */
export function AdminGate({ children }: { children: ReactNode }) {
  const { isSuperAdmin } = useInvoiceData();
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}