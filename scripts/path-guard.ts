export function assertSafeReflectDbPath(path: string): void {
  const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (/reflect\/data\//.test(normalized)) {
    throw new Error(
      `Refusing to open ${path} — path contains reflect/data/. Copy the DB to /tmp first.`,
    );
  }
}
