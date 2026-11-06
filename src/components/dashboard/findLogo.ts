import "server-only";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Logo from /public/brand/ if one exists (prefers names containing "logo"/"dark"), else null → text only. */
export function findLogo(): string | null {
  try {
    const files = readdirSync(join(process.cwd(), "public", "brand")).filter((f) => /\.(svg|png|webp)$/i.test(f));
    const pick =
      files.find((f) => /logo.*dark|dark.*logo/i.test(f)) ?? files.find((f) => /logo/i.test(f)) ?? files[0];
    return pick ? `/brand/${pick}` : null;
  } catch {
    return null;
  }
}
