import { getAdminDb } from "@/firebase/firebaseAdmin";
import { DEFAULT_CENTRO } from "@/lib/config/app-config";
import { roleForEmail } from "@/lib/config/superadmin";
import type { UserProfile, UserRole } from "@/modules/users/types";
import { FieldValue } from "firebase-admin/firestore";

export const USERS_COLLECTION = "users";

export async function getUserProfileByUid(uid: string): Promise<UserProfile | null> {
  const snap = await getAdminDb().collection(USERS_COLLECTION).doc(uid).get();
  if (!snap.exists) return null;
  return snap.data() as UserProfile;
}

/**
 * Crea el documento `users/{uid}` si no existe (solo Admin SDK; reglas cliente: write false).
 */
export async function ensureUserProfileCreated(input: {
  uid: string;
  email: string;
  displayName: string;
  centro?: string;
  defaultRole?: UserRole;
}): Promise<UserProfile> {
  const ref = getAdminDb().collection(USERS_COLLECTION).doc(input.uid);
  const snap = await ref.get();
  const centro = input.centro ?? DEFAULT_CENTRO;
  const resolvedRol = roleForEmail(input.email, input.defaultRole ?? "tecnico");

  if (snap.exists) {
    const data = snap.data() as UserProfile;
    if (resolvedRol === "admin" && data.rol !== "admin") {
      await ref.update({
        rol: "admin",
        updated_at: FieldValue.serverTimestamp(),
      });
      const again = await ref.get();
      return again.data() as UserProfile;
    }
    return data;
  }

  const rol = resolvedRol;

  await ref.set({
    email: input.email,
    display_name: input.displayName || input.email,
    rol,
    centro,
    activo: true,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  const created = await ref.get();
  return created.data() as UserProfile;
}
