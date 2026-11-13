import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResourceForm } from "@/components/resource-form";
import { PageHeader } from "@/components/ui";
import { saveResource } from "@/lib/actions/resources";
import { requireUser } from "@/lib/auth";
import { getSubjectsAndTopics } from "@/lib/queries";
import type { Resource } from "@/lib/types";
import { safeNextPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit sumber" };

export default async function EditResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return_to?: string }>;
}) {
  const { supabase, userId } = await requireUser();
  const { id } = await params;
  const { return_to } = await searchParams;

  const [{ data: resource }, { subjects, topics }] = await Promise.all([
    supabase.from("resources").select("*").eq("id", id).maybeSingle<Resource>(),
    getSubjectsAndTopics(supabase),
  ]);
  if (!resource) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit sumber belajar" />
      <ResourceForm
        resource={resource}
        subjects={subjects}
        topics={topics}
        userId={userId}
        action={saveResource.bind(null, resource.id)}
        returnTo={return_to ? safeNextPath(return_to) : "/resources"}
      />
    </div>
  );
}
