import type { Metadata } from "next";
import { BrainMapLoader } from "@/components/vocab/map/brain-map-loader";
import { MapHead } from "@/components/vocab/map/map-head";
import { MapStage } from "@/components/vocab/map/map-stage";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/queries";
import { DEFAULT_PROGRAM_START } from "@/lib/report-template";
import type { VocabDomain } from "@/lib/types";
import type { LayoutParams } from "@/lib/vocab/layout/config";
import type { MapPoint } from "@/lib/vocab/map-model";

export const metadata: Metadata = { title: "Peta Otak" };

export default async function VocabMapPage() {
  const { supabase } = await requireUser();

  // Light payload only (no vectors): the embeddings are fetched in the browser when "Susun ulang" is pressed.
  const [pointsRes, domainsRes, profile] = await Promise.all([
    supabase.rpc("vocab_map_points"),
    supabase.from("vocab_domains").select("*").is("deleted_at", null).order("name"),
    getProfile(supabase),
  ]);

  const points = (pointsRes.data ?? []) as MapPoint[];
  const domains = (domainsRes.data ?? []) as VocabDomain[];

  return (
    <MapStage>
      <MapHead active="2d" description="Tiap istilah satu titik. Istilah yang maknanya dekat letaknya berdekatan." />
      {pointsRes.error ? (
        <p className="card px-4 py-3 text-sm text-danger">Peta gagal dimuat: {pointsRes.error.message}</p>
      ) : (
        <BrainMapLoader
          points={points}
          domains={domains}
          programStart={profile?.program_start ?? DEFAULT_PROGRAM_START}
          layoutParams={(profile?.vocab_layout_params ?? null) as LayoutParams | null}
        />
      )}
    </MapStage>
  );
}
