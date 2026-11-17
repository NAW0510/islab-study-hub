import Image from "next/image";
import { Paperclip, FileText, GraduationCap, Globe, Link2, Pencil, PlayCircle } from "lucide-react";
import { deleteResource, setResourceStatus } from "@/lib/actions/resources";
import { RESOURCE_TYPE_LABELS } from "@/lib/constants";
import type { ResourceType, ResourceWithRefs } from "@/lib/types";
import { getYouTubeId, hostnameOf } from "@/lib/utils";
import { DeleteButton, StatusSelect } from "./action-buttons";
import { ReturnToLink } from "./return-to-link";
import { SubjectChip } from "./ui";

const TYPE_ICONS: Record<ResourceType, typeof Globe> = {
  youtube: PlayCircle,
  document: FileText,
  article: Globe,
  course: GraduationCap,
  other: Link2,
};

export function resourceHref(resource: Pick<ResourceWithRefs, "url" | "storage_path">) {
  return resource.storage_path
    ? `/api/files?path=${encodeURIComponent(resource.storage_path)}`
    : (resource.url ?? "#");
}

export function ResourceCard({ resource }: { resource: ResourceWithRefs }) {
  const youTubeId = getYouTubeId(resource.url);
  const Icon = TYPE_ICONS[resource.type];
  const href = resourceHref(resource);

  return (
    <article className="card lift flex gap-4 p-3.5 sm:p-4">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="relative hidden aspect-video w-36 shrink-0 overflow-hidden rounded-control bg-surface-2 sm:block"
        aria-hidden
        tabIndex={-1}
      >
        {youTubeId ? (
          <Image
            src={`https://i.ytimg.com/vi/${youTubeId}/mqdefault.jpg`}
            alt=""
            fill
            sizes="144px"
            className="object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-muted">
            <Icon className="size-7" strokeWidth={1.5} />
          </span>
        )}
      </a>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted sm:hidden" />
          <h3 className="min-w-0 flex-1 font-display text-[1.0625rem] font-semibold tracking-tight">
            <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
              {resource.title}
            </a>
          </h3>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{RESOURCE_TYPE_LABELS[resource.type]}</span>
          <span aria-hidden>·</span>
          {resource.storage_path ? (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3" /> File
            </span>
          ) : (
            <span className="truncate">{hostnameOf(resource.url)}</span>
          )}
          {resource.topic && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{resource.topic.title}</span>
            </>
          )}
        </div>
        {resource.notes && <p className="mt-2 line-clamp-2 text-sm text-muted">{resource.notes}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusSelect value={resource.status} action={setResourceStatus.bind(null, resource.id)} />
          {resource.subject && <SubjectChip subject={resource.subject} />}
          <div className="ml-auto flex items-center">
            <ReturnToLink href={`/resources/${resource.id}/edit`} className="icon-btn" title="Edit" aria-label="Edit">
              <Pencil className="size-4" />
            </ReturnToLink>
            <DeleteButton
              iconOnly
              action={deleteResource.bind(null, resource.id)}
              confirmText={`Hapus "${resource.title}"?${resource.storage_path ? " File yang di-upload juga akan dihapus." : ""}`}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
