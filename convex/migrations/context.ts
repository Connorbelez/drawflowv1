import { Migrations } from "@convex-dev/migrations";

import { components } from "../_generated/api.js";
import schema from "../schema.js";

export const migrations = new Migrations(components.migrations, { schema });
