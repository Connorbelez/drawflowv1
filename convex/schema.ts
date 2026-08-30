import { defineSchema } from "convex/server";

import { schemaTables as schemaTables1 } from "./schema/demo_01";
import { schemaTables as schemaTables2 } from "./schema/demo_02";
import { schemaTables as schemaTables3 } from "./schema/identity_01";
import { schemaTables as schemaTables4 } from "./schema/build_workspace_01";
import { schemaTables as schemaTables5 } from "./schema/build_workspace_02";
import { schemaTables as schemaTables6 } from "./schema/build_workspace_03";
import { schemaTables as schemaTables7 } from "./schema/quoting_01";
import { schemaTables as schemaTables8 } from "./schema/quoting_02";
import { schemaTables as schemaTables9 } from "./schema/core_01";
import { schemaTables as schemaTables10 } from "./schema/proposal_lifecycle_01";
import { schemaTables as schemaTables11 } from "./schema/proposal_lifecycle_02";
import { schemaTables as schemaTables12 } from "./schema/communications_01";
import { schemaTables as schemaTables13 } from "./schema/build_collaboration_01";
import { schemaTables as schemaTables14 } from "./schema/build_collaboration_02";
import { schemaTables as schemaTables15 } from "./schema/build_collaboration_03";
import { schemaTables as schemaTables16 } from "./schema/build_collaboration_04";
import { schemaTables as schemaTables17 } from "./schema/scheduling_01";
import { schemaTables as schemaTables18 } from "./schema/retention_01";
import { schemaTables as schemaTables19 } from "./schema/review_policy_defaults_01";

export default defineSchema({
  ...schemaTables1,
  ...schemaTables2,
  ...schemaTables3,
  ...schemaTables4,
  ...schemaTables5,
  ...schemaTables6,
  ...schemaTables7,
  ...schemaTables8,
  ...schemaTables9,
  ...schemaTables10,
  ...schemaTables11,
  ...schemaTables12,
  ...schemaTables13,
  ...schemaTables14,
  ...schemaTables15,
  ...schemaTables16,
  ...schemaTables17,
  ...schemaTables18,
  ...schemaTables19,
});
