// Minimal type declaration for `tiged` (it ships no types). We use only the
// clone workflow: construct an emitter for a repo ref (optionally a
// subdirectory), then clone into a dir.
declare module "tiged" {
  interface TigedOptions {
    cache?: boolean;
    force?: boolean;
    verbose?: boolean;
    /**
     * "tar" fetches a tarball rather than shelling out to git. Required here:
     * subdirectory fetches (`user/repo/packages/x#ref`) need it, and it avoids
     * depending on a git binary being present.
     */
    mode?: "tar" | "git";
  }
  interface TigedEmitter {
    clone(destination: string): Promise<void>;
  }
  export default function tiged(source: string, options?: TigedOptions): TigedEmitter;
}
