/**
 * lucide-react ships its TypeScript declarations at `dist/*.d.ts` but has no
 * `types`/`exports` entry in package.json (as of v1.46.0), so TypeScript's
 * "bundler" moduleResolution can't associate them and reports TS7016.
 *
 * Re-export the real declarations so `import { X } from "lucide-react"` stays
 * fully typed instead of falling back to `any`.
 */
declare module "lucide-react" {
  export * from "lucide-react/dist/lucide-react";
}