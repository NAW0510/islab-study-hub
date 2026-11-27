import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev server only: also allow opening the app via the "Network" address that
  // `npm run dev` prints. Without this, Next blocks its dev JavaScript there and
  // the app silently stops working. Production is unaffected.
  allowedDevOrigins: ["192.168.56.1"],
  images: {
    // YouTube video thumbnails
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" }],
  },
  // Kosakata moved into the Ruang Studi (docs/SPEC_RUANG_STUDI.md §1). Old
  // links and bookmarks keep working; their query (?term=, ?bidang=, …)
  // comes along.
  async redirects() {
    return [
      { source: "/vocab/perpustakaan", destination: "/studi?buku=istilah", permanent: false },
      { source: "/vocab/map/3d", destination: "/studi/istilah/peta/3d", permanent: false },
      { source: "/vocab/map", destination: "/studi/istilah/peta", permanent: false },
      { source: "/vocab/domains", destination: "/studi/istilah/domain", permanent: false },
      { source: "/vocab", destination: "/studi/istilah", permanent: false },
    ];
  },
  experimental: {
    // Keep visited pages in the client router cache so going back and forth is
    // instant. Every server action calls revalidatePath(), which clears this
    // cache, so data never goes stale after an edit.
    staleTimes: {
      dynamic: 180,
      static: 300,
    },
  },
};

export default nextConfig;
