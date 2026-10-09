import { AppShell } from "@/components/app-shell";
import { ReleaseClosure } from "@/components/release-closure";
import { getReleaseClosureState } from "@/server/release-closure-service";
import { requestAuthorizationContext } from "@/server/request-auth";

export const dynamic = "force-dynamic";

export default async function ReleaseClosurePage() {
  const state = await getReleaseClosureState(await requestAuthorizationContext());
  return <AppShell><ReleaseClosure initial={JSON.parse(JSON.stringify(state))} /></AppShell>;
}
