import type { Timestamp } from "firebase/firestore";

export type UserRole = "tecnico" | "supervisor" | "admin";

/** Perfil extendido en Firestore: users/{uid} */
export type UserProfile = {
  email: string;
  display_name: string;
  rol: UserRole;
  centro: string;
  planta_codigo?: string;
  especialidades?: Array<"AA" | "ELECTRICO" | "GG">;
  activo: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type UserProfileInput = Omit<UserProfile, "created_at" | "updated_at">;
