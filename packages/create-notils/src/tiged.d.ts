// Minimal type declaration for `tiged` (it ships no types). We use only the
// clone workflow: construct an emitter for a repo ref, then clone into a dir.
declare module "tiged" {
  interface TigedOptions {
    cache?: boolean;
    force?: boolean;
    verbose?: boolean;
  }
  interface TigedEmitter {
    clone(destination: string): Promise<void>;
  }
  export default function tiged(source: string, options?: TigedOptions): TigedEmitter;
}
