import type { Metadata } from "next";
import { BrainMap3DLoader } from "@/components/vocab/map/brain-map-3d-loader";
import { MapHead } from "@/components/vocab/map/map-head";
import { MapStage } from "@/components/vocab/map/map-stage";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/queries";
import { DEFAULT_PROGRAM_START } from "@/lib/report-template";
import type { VocabDomain } from "@/lib/types";
import type { MapPoint } from "@/lib/vocab/map-model";

export const metadata: Metadata = { title: "Peta Otak 3D" };

export default async function VocabMap3DPage() {
  const { supabase } = await requireUser();

  // Light payload only; the browser fetches vectors itself when its cached 3D layout is out of date.
  const [pointsRes, domainsRes, profile] = await Promise.all([
    supabase.rpc("vocab_map_points"),
    supabase.from("vocab_domains").select("*").is("deleted_at", null).order("name"),
    getProfile(supabase),
  ]);

  return (
    <MapStage>
      <MapHead description="Tiap istilah satu titik di ruang tiga dimensi. Putar ruangnya untuk melihat kelompok istilah dari sisi lain." />
      {pointsRes.error ? (
        <p className="card px-4 py-3 text-sm text-danger">Peta gagal dimuat: {pointsRes.error.message}</p>
      ) : (
        <BrainMap3DLoader
          points={(pointsRes.data ?? []) as MapPoint[]}
          domains={(domainsRes.data ?? []) as VocabDomain[]}
          programStart={profile?.program_start ?? DEFAULT_PROGRAM_START}
        />
      )}
    </MapStage>
  );
}
