"use client";

import { getFirebaseAuth, getFirebaseDb } from "@/firebase/firebaseClient";
import type { UserProfile } from "@/modules/users/types";
import type { User } from "firebase/auth";
import { onAuthStateChanged, type Unsubscribe } from "firebase/auth";
import { doc, onSnapshot, type Unsubscribe as FirestoreUnsub } from "firebase/firestore";
import { useEffect, useState } from "react";

/** Sesión + perfil Firestore en un solo hook (p. ej. pantallas del dashboard). */
export function useAuth(): {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: Error | null;
} {
  const { user, loading: authLoading } = useAuthUser();
  const { profile, loading: profileLoading, error } = useUserProfile(user?.uid);
  const loading = authLoading || (Boolean(user?.uid) && profileLoading);
  return { user, profile, loading, error };
}

export function useAuthUser(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub: Unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { user, loading };
}

export async function getClientIdToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  const u = auth.currentUser;
  if (!u) return null;
  return u.getIdToken(true);
}

export function useUserProfile(uid: string | undefined): {
  profile: UserProfile | null;
  loading: boolean;
  error: Error | null;
} {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const db = getFirebaseDb();
    const ref = doc(db, "users", uid);
    const unsub: FirestoreUnsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists) {
          setProfile(null);
          setLoading(false);
          return;
        }
        setProfile(snap.data() as UserProfile);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [uid]);

  return { profile, loading, error };
}
