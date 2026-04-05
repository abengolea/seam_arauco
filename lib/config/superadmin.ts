import type { UserRole } from "@/modules/users/types";

/**
 * Correo que recibe `rol: admin` al hacer bootstrap (variable solo servidor).
 * Definí `SUPERADMIN_EMAIL` en `.env.local`, sin `NEXT_PUBLIC_`.
 */
export function roleForEmail(email: string, fallback: UserRole = "tecnico"): UserRole {
  const superEmail = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  if (superEmail && email.trim().toLowerCase() === superEmail) {
    return "admin";
  }
  return fallback;
}
