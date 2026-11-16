"use client";

import { useId, useState } from "react";
import type { SubjectRef, TopicRef } from "@/lib/types";

/** Linked subject + topic selects (the topic list follows the chosen subject). */
export function SubjectTopicFields({
  subjects,
  topics,
  initialSubjectId = "",
  initialTopicId = "",
}: {
  subjects: SubjectRef[];
  topics: TopicRef[];
  initialSubjectId?: string;
  initialTopicId?: string;
}) {
  const id = useId();
  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const [topicId, setTopicId] = useState(initialTopicId);
  const topicChoices = subjectId ? topics.filter((t) => t.subject_id === subjectId) : topics;

  return (
    <>
      <div>
        <label className="label" htmlFor={`${id}-subject`}>
          Subjek
        </label>
        <select
          id={`${id}-subject`}
          name="subject_id"
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setTopicId("");
          }}
          className="input"
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
        <label className="label" htmlFor={`${id}-topic`}>
          Topik silabus
        </label>
        <select
          id={`${id}-topic`}
          name="syllabus_item_id"
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
          className="input"
        >
          <option value="">— Tanpa topik —</option>
          {topicChoices.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
