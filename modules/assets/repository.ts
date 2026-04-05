import { getAdminDb } from "@/firebase/firebaseAdmin";
import type { Asset } from "@/modules/assets/types";

export const ASSETS_COLLECTION = "assets";

export async function getAssetById(assetId: string): Promise<Asset | null> {
  const snap = await getAdminDb().collection(ASSETS_COLLECTION).doc(assetId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Omit<Asset, "id">;
  return { id: snap.id, ...data };
}
