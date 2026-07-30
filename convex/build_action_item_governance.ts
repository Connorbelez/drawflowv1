import type { Doc } from "./types";

export function actionItemRequiresAcceptance(
  item: Pick<Doc<"buildActionItems">, "requiresAcceptance" | "workKind">
) {
  return (
    item.requiresAcceptance || (item.workKind ?? "ordinary") !== "ordinary"
  );
}
