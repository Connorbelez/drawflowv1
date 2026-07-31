import { describe, expect, test } from "vitest";

import {
  isMandatoryBuildCollaborationNotification,
  notificationKindForActionItemWorkflowEvent,
  notificationKindForDeadlineStage,
  notificationKindsForPublicationRecipient,
} from "./build_collaboration_notifications";

describe("Build collaboration notification classification", () => {
  test("classifies every publication awareness path without collapsing overlapping duties", () => {
    expect(
      notificationKindsForPublicationRecipient({
        acknowledgementRequired: true,
        assigned: true,
        mentioned: true,
        postType: "issue",
      })
    ).toEqual([
      "acknowledgement_required",
      "assignment",
      "direct_mention",
      "blocker",
    ]);
    expect(
      notificationKindsForPublicationRecipient({
        acknowledgementRequired: false,
        assigned: true,
        mentioned: true,
        postType: "update",
      })
    ).toEqual(["assignment", "direct_mention"]);
    expect(
      notificationKindsForPublicationRecipient({
        acknowledgementRequired: false,
        assigned: false,
        mentioned: true,
        postType: "update",
      })
    ).toEqual(["direct_mention"]);
    expect(
      notificationKindsForPublicationRecipient({
        acknowledgementRequired: false,
        assigned: false,
        mentioned: false,
        postType: "issue",
      })
    ).toEqual(["blocker"]);
    expect(
      notificationKindsForPublicationRecipient({
        acknowledgementRequired: false,
        assigned: false,
        mentioned: false,
        postType: "update",
      })
    ).toEqual([]);
  });

  test("classifies assignments, approval requests, blockers, reminders, and escalation", () => {
    expect(notificationKindForActionItemWorkflowEvent("assigned")).toBe(
      "assignment"
    );
    expect(
      notificationKindForActionItemWorkflowEvent("assignment_requested")
    ).toBe("assignment_request");
    expect(
      notificationKindForActionItemWorkflowEvent("completion_requested")
    ).toBe("required_approval");
    expect(notificationKindForActionItemWorkflowEvent("blocked")).toBe(
      "blocker"
    );
    expect(
      notificationKindForActionItemWorkflowEvent("completion_accepted")
    ).toBe("acknowledgement_received");
    expect(notificationKindForDeadlineStage("before")).toBe("reminder");
    expect(notificationKindForDeadlineStage("due")).toBe("reminder");
    expect(notificationKindForDeadlineStage("overdue")).toBe("reminder");
    expect(notificationKindForDeadlineStage("escalated")).toBe("escalation");
  });

  test("only ordinary activity, followed replies, and acknowledgement receipts are suppressible", () => {
    expect(isMandatoryBuildCollaborationNotification("direct_mention")).toBe(
      true
    );
    expect(isMandatoryBuildCollaborationNotification("assignment")).toBe(true);
    expect(isMandatoryBuildCollaborationNotification("assignment_request")).toBe(
      true
    );
    expect(isMandatoryBuildCollaborationNotification("required_approval")).toBe(
      true
    );
    expect(isMandatoryBuildCollaborationNotification("blocker")).toBe(true);
    expect(isMandatoryBuildCollaborationNotification("build_wide_pin")).toBe(
      true
    );
    expect(
      isMandatoryBuildCollaborationNotification("acknowledgement_required")
    ).toBe(true);
    expect(isMandatoryBuildCollaborationNotification("reminder")).toBe(true);
    expect(isMandatoryBuildCollaborationNotification("escalation")).toBe(true);
    expect(isMandatoryBuildCollaborationNotification("ordinary_activity")).toBe(
      false
    );
    expect(isMandatoryBuildCollaborationNotification("followed_reply")).toBe(
      false
    );
    expect(
      isMandatoryBuildCollaborationNotification("acknowledgement_received")
    ).toBe(false);
  });
});
