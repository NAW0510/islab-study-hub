import type { Metadata } from "next";
import { ResourceForm } from "@/components/resource-form";
import { PageHeader } from "@/components/ui";
import { saveResource } from "@/lib/actions/resources";
import { requireUser } from "@/lib/auth";
import { getSubjectsAndTopics } from "@/lib/queries";
import { safeNextPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Tambah sumber" };

export default async function NewResourcePage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; topic?: string; return_to?: string }>;
}) {
  const { supabase, userId } = await requireUser();
  const { subject, topic, return_to } = await searchParams;
  const { subjects, topics } = await getSubjectsAndTopics(supabase);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Tambah sumber belajar" />
      <ResourceForm
        subjects={subjects}
        topics={topics}
        defaultSubjectId={subject}
        defaultTopicId={topic}
        userId={userId}
        action={saveResource.bind(null, null)}
        returnTo={return_to ? safeNextPath(return_to) : "/resources"}
      />
    </div>
  );
}
