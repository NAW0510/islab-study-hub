import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A topic always belongs to one subject, so when a topic is chosen we take
 * its subject from the database rather than trusting the form.
 */
export async function resolveSubjectAndTopic(
  supabase: SupabaseClient,
  subjectId: string | null,
  topicId: string | null,
): Promise<{ subject_id: string | null; syllabus_item_id: string | null }> {
  if (topicId) {
    const { data } = await supabase
      .from("syllabus_items")
      .select("subject_id")
      .eq("id", topicId)
      .maybeSingle();
    if (data) return { subject_id: data.subject_id, syllabus_item_id: topicId };
  }
  return { subject_id: subjectId, syllabus_item_id: null };
}
