import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT = path.resolve(here, "..");
export const DEFAULT_FIXTURE = path.join(PACKAGE_ROOT, "fixtures", "api-results.json");
export const DEFAULT_OUT_DIR = path.join(PACKAGE_ROOT, "out");
