import type { Metadata } from "next";
import { ResourceBrowser } from "@/components/resource-browser";
import { ResourceCard } from "@/components/resource-card";
import { requireUser } from "@/lib/auth";
import { RESOURCE_TYPES, STATUSES } from "@/lib/constants";
import { RESOURCE_SELECT } from "@/lib/queries";
import type { ResourceType, ResourceWithRefs, Status, SubjectRef } from "@/lib/types";

export const metadata: Metadata = { title: "Sumber Belajar" };

const STATUS_ORDER: Record<Status, number> = { in_progress: 0, not_started: 1, completed: 2 };

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireUser();
  const sp = await searchParams;

  // Load everything once; filtering happens instantly in the browser.
  const [resourcesRes, subjectsRes] = await Promise.all([
    supabase.from("resources").select(RESOURCE_SELECT).order("created_at", { ascending: false }).limit(500),
    supabase.from("subjects").select("id, title, color").order("title"),
  ]);

  // In progress first, then not started, finished last (stable, so newest first within each group).
  const resources = ((resourcesRes.data ?? []) as ResourceWithRefs[]).sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  );

  const initial = {
    status: STATUSES.includes(one(sp.status) as Status) ? one(sp.status) : undefined,
    type: RESOURCE_TYPES.includes(one(sp.type) as ResourceType) ? one(sp.type) : undefined,
    subject: one(sp.subject),
    topic: one(sp.topic),
  };

  return (
    <ResourceBrowser
      // Remount when a link navigates here with new filters.
      key={JSON.stringify(initial)}
      subjects={(subjectsRes.data ?? []) as SubjectRef[]}
      initial={initial}
      items={resources.map((r) => ({
        id: r.id,
        status: r.status,
        type: r.type,
        subjectId: r.subject_id,
        topicId: r.syllabus_item_id,
        topicTitle: r.topic?.title ?? null,
        card: <ResourceCard resource={r} />,
      }))}
    />
  );
}
