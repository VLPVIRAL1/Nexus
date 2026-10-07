export type Role = "admin" | "preparer" | "reviewer" | "read_only";
export type Action = "client.view" | "client.create" | "tax_year.create" | "person.modify" | "intake.modify" | "mapping.modify" | "calculation.run" | "output.generate" | "output.download" | "assignment.manage" | "source.import" | "source.modify" | "review.create" | "review.resolve" | "identifier.reveal" | "return.approve" | "integration.configure";

const grants: Record<Role, ReadonlySet<Action>> = {
  admin: new Set(["client.view", "client.create", "tax_year.create", "person.modify", "intake.modify", "mapping.modify", "calculation.run", "output.generate", "output.download", "assignment.manage", "source.import", "source.modify", "review.create", "review.resolve", "identifier.reveal", "integration.configure"]),
  preparer: new Set(["client.view", "client.create", "tax_year.create", "person.modify", "intake.modify", "mapping.modify", "calculation.run", "output.generate", "output.download", "source.import", "source.modify", "review.create"]),
  reviewer: new Set(["client.view", "person.modify", "intake.modify", "mapping.modify", "calculation.run", "output.generate", "output.download", "source.import", "source.modify", "review.create", "review.resolve", "identifier.reveal", "return.approve"]),
  read_only: new Set(["client.view"]),
};

export interface AuthorizationContext { userId: string; firmId: string; role: Role; assignedClientIds: ReadonlySet<string>; }

export function authorize(context: AuthorizationContext, action: Action, resource: { firmId: string; clientId?: string }) {
  if (context.firmId !== resource.firmId) return false;
  if (resource.clientId && !context.assignedClientIds.has(resource.clientId) && context.role !== "admin") return false;
  return grants[context.role].has(action);
}
