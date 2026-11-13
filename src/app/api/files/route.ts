import { NextResponse, type NextRequest } from "next/server";
import { DOCUMENTS_BUCKET } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens an uploaded document: creates a short-lived signed URL and redirects
 * to it. Storage RLS guarantees users can only sign their own files.
 */
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Parameter path wajib diisi." }, { status: 400 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return NextResponse.redirect(new URL("/login", request.url));

  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 60 * 10);
  if (error || !data) {
    return NextResponse.json({ error: "File tidak ditemukan atau tidak bisa diakses." }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
