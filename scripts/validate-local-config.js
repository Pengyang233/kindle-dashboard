import { getClientManifest } from "../src/client-distribution.js";
import { loadLocalConfig, validateServerConfig } from "../src/config.js";
try {
  const config = validateServerConfig(loadLocalConfig());
  await getClientManifest(config.clientDistributionDirectory);
  console.log("Local service configuration is valid; no credentials printed.");
} catch {
  console.error("Invalid service configuration. Run npm run setup-local and edit .env.local and npm run stage-client-release before installing.");
  process.exitCode = 1;
}
