import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * Host of the Supabase project, taken from the same env var the Supabase
 * clients use so the project ref isn't duplicated here. Without it there are
 * no remote images to allow.
 */
function supabaseHost(): string | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

const host = supabaseHost();

const nextConfig: NextConfig = {
  transpilePackages: [
    "@defindex/sdk",
    "@neko-protocol/defindex-vault",
    "@neko-protocol/reflector",
    "@neko-protocol/stellar-wallet",
  ],
  images: {
    // Vault photos (Neko Pro) are served from a public Storage bucket.
    remotePatterns: host
      ? [
          {
            protocol: "https",
            hostname: host,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
