import { hostname } from "node:os";
import { processNextArtifactJob } from "../src/server/artifact-job-service";

const workerId = `${hostname()}:${process.pid}`;
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

process.stdout.write(`Artifact worker ${workerId} started\n`);
while (!stopping) {
  const result = await processNextArtifactJob(workerId);
  if (result) process.stdout.write(`Artifact job ${result.jobId} ${result.status} after attempt ${result.attemptCount}\n`);
  else await new Promise((resolve) => setTimeout(resolve, 1_000));
}
process.stdout.write(`Artifact worker ${workerId} stopped\n`);
