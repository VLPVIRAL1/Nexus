export interface VersionedRecord<T> { value: T; version: number; }
export interface Conflict<T> { kind: "conflict"; baseVersion: number; current: VersionedRecord<T>; proposed: T; }

export function applyVersionedUpdate<T>(current: VersionedRecord<T>, baseVersion: number, proposed: T): VersionedRecord<T> | Conflict<T> {
  if (current.version !== baseVersion) return { kind: "conflict", baseVersion, current, proposed };
  return { value: proposed, version: current.version + 1 };
}
