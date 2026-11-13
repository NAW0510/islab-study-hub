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
