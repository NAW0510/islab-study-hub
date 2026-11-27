#!/usr/bin/env node
/**
 * Test data for the Ruang Studi's Bahasa on the LOCAL stack only (the dev
 * account from local-stack.mjs; the real project is never touched):
 *
 *   node scripts/seed-local-study.mjs           add the languages and words below (skips what exists)
 *   node scripts/seed-local-study.mjs --reset   remove the dev account's languages and words first
 *
 * Needs `npx supabase start` (and the study_languages migration applied).
 */
import { localStack, signInDev } from "./local-stack.mjs";

const LANGUAGES = [
  { name: "Jepang", code: "ja", countries: ["JP"], color: "domain-8" },
  { name: "Inggris", code: "en", countries: ["US", "GB", "CA", "AU", "NZ", "IE"], color: "domain-1" },
  { name: "Spanyol", code: "es", countries: ["ES", "MX", "AR", "CO", "CL", "PE"], color: "domain-4" },
  { name: "Korea", code: "ko", countries: ["KR"], color: "domain-5" },
  { name: "Prancis", code: "fr", countries: ["FR", "BE", "CH", "CA"], color: "domain-7" },
  { name: "Bali", code: "ban", countries: ["ID"], color: "domain-3" },
];

const day = (offset) => new Date(Date.UTC(2026, 10, 27 - offset)).toISOString().slice(0, 10);
const WORDS = [
  ["Jepang", "勉強", "benkyou", "belajar; usaha menekuni sesuatu", "毎日日本語を勉強しています。", null, 0],
  ["Jepang", "研究室", "kenkyuushitsu", "laboratorium riset (ruang dan kelompoknya)", "研究室のミーティングは月曜日です。", null, 2],
  ["Jepang", "締め切り", "shimekiri", "tenggat waktu", "締め切りは金曜日です。", null, 5],
  ["Jepang", "先輩", "senpai", "senior di sekolah, kampus, atau kantor", null, null, 9],
  ["Jepang", "よろしくお願いします", "yoroshiku onegaishimasu", "mohon bantuannya; salam saat berkenalan atau meminta tolong", null, null, 20],
  ["Jepang", "お疲れ様です", "otsukaresama desu", "terima kasih atas kerja kerasnya; sapaan antar rekan kerja", null, null, 31],
  ["Inggris", "serendipity", "/ˌser.ənˈdɪp.ə.ti/", "menemukan hal baik secara kebetulan", "Finding that paper was pure serendipity.", null, 1],
  ["Inggris", "deadline", null, "batas waktu", null, null, 6],
  ["Inggris", "lorry", null, "truk (Inggris Britania)", null, "GB", 12],
  ["Spanyol", "coche", null, "mobil", "Mi coche es rojo.", null, 3],
  ["Spanyol", "carro", null, "mobil (di Meksiko dan Amerika Latin)", null, "MX", 4],
  ["Spanyol", "aprender", null, "belajar", null, null, 15],
  ["Korea", "공부", "gongbu", "belajar", "매일 한국어를 공부해요.", null, 7],
  ["Korea", "감사합니다", "gamsahamnida", "terima kasih (sopan)", null, null, 25],
  ["Prancis", "bibliothèque", null, "perpustakaan", null, null, 8],
  ["Bali", "suksma", null, "terima kasih", null, null, 2],
  ["Bali", "rahajeng semeng", null, "selamat pagi", null, null, 10],
];

const { url, key } = localStack();
const token = await signInDev({ url, key });
const headers = { apikey: key, authorization: `Bearer ${token}`, "content-type": "application/json", prefer: "return=representation" };
const rest = async (path, init = {}) => {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

if (process.argv.includes("--reset")) {
  await rest("study_words?id=not.is.null", { method: "DELETE" });
  await rest("study_languages?id=not.is.null", { method: "DELETE" });
  console.log("Bahasa dan diksi akun dev dihapus.");
}

const existing = await rest("study_languages?select=id,name&deleted_at=is.null");
const ids = new Map(existing.map((l) => [l.name, l.id]));
for (const language of LANGUAGES) {
  if (ids.has(language.name)) continue;
  const [row] = await rest("study_languages", { method: "POST", body: JSON.stringify(language) });
  ids.set(language.name, row.id);
}

let added = 0;
for (const [language, word, reading, meaning, example, region, ago] of WORDS) {
  const body = { language_id: ids.get(language), word, reading, meaning, example, region, learned_on: day(ago) };
  const res = await fetch(`${url}/rest/v1/study_words`, { method: "POST", headers, body: JSON.stringify(body) });
  if (res.ok) added += 1;
  else if (res.status !== 409) throw new Error(`study_words: ${res.status} ${await res.text()}`);
}
console.log(`${ids.size} bahasa, ${added} diksi baru di akun dev lokal.`);
