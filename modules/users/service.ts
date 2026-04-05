import { AppError } from "@/lib/errors/app-error";
import { getUserProfileByUid } from "@/modules/users/repository";
import type { UserProfile, UserRole } from "@/modules/users/types";

export async function assertUserCanAct(
  uid: string,
  roles: readonly UserRole[],
): Promise<UserProfile> {
  const profile = await getUserProfileByUid(uid);
  if (!profile || !profile.activo) {
    throw new AppError("FORBIDDEN", "Usuario inactivo o sin perfil");
  }
  if (!roles.includes(profile.rol)) {
    throw new AppError("FORBIDDEN", "Rol no autorizado para esta acción");
  }
  return profile;
}
