declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function mkdtempSync(prefix: string): string;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(path: string, options: { withFileTypes: true }): Array<{
    name: string;
    isDirectory(): boolean;
  }>;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function renameSync(oldPath: string, newPath: string): void;
  export function statSync(path: string): { mtimeMs: number };
  export function writeFileSync(path: string, data: string, options?: { flag?: string; encoding?: string }): void;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

declare module "node:child_process" {
  export function spawnSync(command: string, args: string[], options?: {
    cwd?: string;
    encoding?: "utf8";
    env?: Record<string, string | undefined>;
  }): {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
  };
}

declare module "node:process" {
  export const env: Record<string, string | undefined>;
  export const execPath: string;
  export function cwd(): string;
}
