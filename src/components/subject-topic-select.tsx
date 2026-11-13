"use client";

import { useState } from "react";
import type { SubjectRef, TopicRef } from "@/lib/types";

/** Subject dropdown + a topic dropdown filtered to that subject's syllabus. */
export function SubjectTopicSelect({
  subjects,
  topics,
  defaultSubjectId,
  defaultTopicId,
}: {
  subjects: SubjectRef[];
  topics: TopicRef[];
  defaultSubjectId?: string | null;
  defaultTopicId?: string | null;
}) {
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? "");
  const [topicId, setTopicId] = useState(defaultTopicId ?? "");
  const subjectTopics = topics.filter((t) => t.subject_id === subjectId);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="subject_id">
          Subjek
        </label>
        <select
          id="subject_id"
          name="subject_id"
          className="input"
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setTopicId("");
          }}
        >
          <option value="">— Tanpa subjek —</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="syllabus_item_id">
          Topik silabus
        </label>
        <select
          id="syllabus_item_id"
          name="syllabus_item_id"
          className="input"
          value={topicId}
          disabled={!subjectId || subjectTopics.length === 0}
          onChange={(e) => setTopicId(e.target.value)}
        >
          <option value="">
            {!subjectId ? "Pilih subjek dulu" : subjectTopics.length ? "— Tanpa topik —" : "Silabus masih kosong"}
          </option>
          {subjectTopics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
