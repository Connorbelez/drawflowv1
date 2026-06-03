import * as XLSX from "xlsx";
import { z } from "zod";

const currencyLikeSchema = z.union([z.number(), z.string()]);
const MONEY_STRIP_REGEX = /[$,\s]/g;
const PARENTHESIZED_NEGATIVE_REGEX = /^\((.*)\)$/;

const moneySchema = currencyLikeSchema.transform((value, ctx) => {
  const parsed = parseMoney(value);
  if (parsed === null) {
    ctx.addIssue({
      code: "custom",
      message: `Expected a currency amount, received ${String(value)}`,
    });
    return z.NEVER;
  }
  return parsed;
});

const positiveMoneySchema = moneySchema.pipe(z.number().min(0));

export const budgetWorkbookLineSchema = z.object({
  budgetAmount: positiveMoneySchema,
  budgetLineKey: z.string().min(1),
  costPerTotalSqft: positiveMoneySchema,
  drawableAmount: positiveMoneySchema,
  name: z.string().min(1),
  percentageBps: z.number().int().min(0),
});

export const budgetWorkbookMilestoneSchema = z.object({
  budgetAmount: z.number().min(0),
  drawableAmount: z.number().min(0),
  milestoneKey: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int().positive(),
  submilestones: z.array(budgetWorkbookLineSchema).min(1),
});

export const budgetWorkbookProposalDraftSchema = z
  .object({
    buildName: z.string().min(1),
    costPerTotalSqft: z.number().min(0),
    importVersion: z.literal("drawflow-budget-workbook-v1"),
    sourceName: z.string().min(1).optional(),
    totalBudget: z.number().min(0),
    totalDrawableAmount: z.number().min(0),
    totalSqft: z.number().int().positive(),
    milestones: z.array(budgetWorkbookMilestoneSchema).min(1),
  })
  .superRefine((draft, ctx) => {
    const seenMilestones = new Set<string>();
    const seenLines = new Set<string>();
    let budgetTotal = 0;
    let drawableTotal = 0;
    let percentageTotal = 0;

    for (const milestone of draft.milestones) {
      if (seenMilestones.has(milestone.milestoneKey)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate milestone key ${milestone.milestoneKey}`,
          path: ["milestones"],
        });
      }
      seenMilestones.add(milestone.milestoneKey);

      const milestoneBudgetTotal = sum(
        milestone.submilestones.map((line) => line.budgetAmount)
      );
      const milestoneDrawableTotal = sum(
        milestone.submilestones.map((line) => line.drawableAmount)
      );

      if (!sameMoney(milestoneBudgetTotal, milestone.budgetAmount)) {
        ctx.addIssue({
          code: "custom",
          message: `${milestone.name} budget total ${formatMoney(milestoneBudgetTotal)} does not match milestone budget ${formatMoney(milestone.budgetAmount)}`,
          path: ["milestones", milestone.order - 1, "budgetAmount"],
        });
      }

      if (!sameMoney(milestoneDrawableTotal, milestone.drawableAmount)) {
        ctx.addIssue({
          code: "custom",
          message: `${milestone.name} drawable total ${formatMoney(milestoneDrawableTotal)} does not match milestone drawable amount ${formatMoney(milestone.drawableAmount)}`,
          path: ["milestones", milestone.order - 1, "drawableAmount"],
        });
      }

      for (const line of milestone.submilestones) {
        if (seenLines.has(line.budgetLineKey)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate budget line key ${line.budgetLineKey}`,
            path: ["milestones", milestone.order - 1, "submilestones"],
          });
        }
        seenLines.add(line.budgetLineKey);
        budgetTotal += line.budgetAmount;
        drawableTotal += line.drawableAmount;
        percentageTotal += line.percentageBps;
      }
    }

    if (!sameMoney(budgetTotal, draft.totalBudget)) {
      ctx.addIssue({
        code: "custom",
        message: `Budget lines total ${formatMoney(budgetTotal)} does not match workbook total budget ${formatMoney(draft.totalBudget)}`,
        path: ["totalBudget"],
      });
    }

    if (!sameMoney(drawableTotal, draft.totalDrawableAmount)) {
      ctx.addIssue({
        code: "custom",
        message: `Budget lines drawable total ${formatMoney(drawableTotal)} does not match workbook total drawable amount ${formatMoney(draft.totalDrawableAmount)}`,
        path: ["totalDrawableAmount"],
      });
    }

    if (Math.abs(percentageTotal - 10_000) > 5) {
      ctx.addIssue({
        code: "custom",
        message: `Budget line percentages total ${percentageTotal} bps; expected 10000 bps`,
        path: ["milestones"],
      });
    }
  });

export type BudgetWorkbookProposalDraft = z.infer<
  typeof budgetWorkbookProposalDraftSchema
>;

interface RawImportRow {
  budgetAmount: number;
  category: string;
  costPerTotalSqft: number;
  drawableAmount: number;
  milestoneDrawableAmount: number;
  milestoneName: string;
  milestoneOrder: number;
  percentageBps: number;
}

export function parseBudgetWorkbookArrayBuffer(
  buffer: ArrayBuffer,
  sourceName?: string
): BudgetWorkbookProposalDraft {
  const workbook = XLSX.read(buffer, { type: "array" });
  return parseBudgetWorkbook(workbook, sourceName);
}

export async function parseBudgetWorkbookFile(
  file: File
): Promise<BudgetWorkbookProposalDraft> {
  if (isCsvFile(file)) {
    const workbook = XLSX.read(await file.text(), { type: "string" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error("CSV budget import is empty.");
    }
    return parseBudgetWorksheet(workbook.Sheets[sheetName], file.name);
  }

  return parseBudgetWorkbookArrayBuffer(await file.arrayBuffer(), file.name);
}

export function parseBudgetWorkbook(
  workbook: XLSX.WorkBook,
  sourceName?: string
): BudgetWorkbookProposalDraft {
  const importSheet = workbook.Sheets["Budget Import"];
  if (!importSheet) {
    throw new Error('Workbook must include a "Budget Import" sheet.');
  }

  return parseBudgetWorksheet(importSheet, sourceName);
}

function parseBudgetWorksheet(
  importSheet: XLSX.WorkSheet,
  sourceName?: string
): BudgetWorkbookProposalDraft {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(importSheet, {
    blankrows: false,
    defval: "",
    header: 1,
    raw: true,
  });

  const metadata = readMetadata(rows);
  const headerIndex = rows.findIndex(
    (row) => normalizeHeader(row[0]) === "milestoneorder"
  );
  if (headerIndex < 0) {
    throw new Error(
      'Budget Import sheet must include a "Milestone Order" header row.'
    );
  }

  const rawRows = readImportRows(rows.slice(headerIndex + 1));
  const draft = buildProposalDraft(metadata, rawRows, sourceName);
  return budgetWorkbookProposalDraftSchema.parse(draft);
}

function isCsvFile(file: File) {
  return file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");
}

function readMetadata(rows: unknown[][]) {
  const pairs = new Map<string, unknown>();
  for (const row of rows) {
    const key = normalizeHeader(row[0]);
    if (key) {
      pairs.set(key, row[1]);
    }
  }

  const buildName = stringValue(pairs.get("buildname")) ?? "Imported build";
  const totalDrawableAmount = requiredMoney(
    pairs.get("totaldrawableamount"),
    "Total Drawable Amount"
  );
  const totalBudget = requiredMoney(pairs.get("totalbudget"), "Total Budget");
  const totalSqft = requiredInteger(pairs.get("totalsqft"), "Total Sqft");
  const costPerTotalSqft = requiredMoney(
    pairs.get("costpertotalsqft"),
    "Cost per Total Sqft"
  );

  return {
    buildName,
    costPerTotalSqft,
    totalBudget,
    totalDrawableAmount,
    totalSqft,
  };
}

function readImportRows(rows: unknown[][]): RawImportRow[] {
  const parsed: RawImportRow[] = [];
  let lastMilestoneOrder: number | null = null;
  let lastMilestoneName: string | null = null;
  let lastMilestoneDrawableAmount: number | null = null;

  for (const row of rows) {
    const category = stringValue(row[3]);
    if (!category) {
      continue;
    }

    const milestoneOrder =
      optionalInteger(row[0]) ?? lastMilestoneOrder ?? undefined;
    const milestoneName = stringValue(row[1]) ?? lastMilestoneName ?? undefined;
    const milestoneDrawableAmount =
      optionalMoney(row[2]) ?? lastMilestoneDrawableAmount ?? undefined;

    if (
      milestoneOrder === undefined ||
      milestoneName === undefined ||
      milestoneDrawableAmount === undefined
    ) {
      throw new Error(
        `Budget line "${category}" is missing milestone grouping data.`
      );
    }

    lastMilestoneOrder = milestoneOrder;
    lastMilestoneName = milestoneName;
    lastMilestoneDrawableAmount = milestoneDrawableAmount;

    parsed.push({
      budgetAmount: requiredMoney(row[4], `${category} Budget`),
      category,
      costPerTotalSqft: requiredMoney(row[6], `${category} $ / Total Sqft`),
      drawableAmount: requiredMoney(row[7], `${category} Drawable Amount`),
      milestoneDrawableAmount,
      milestoneName,
      milestoneOrder,
      percentageBps: Math.round(
        requiredPercent(row[5], `${category} % of Total`) * 10_000
      ),
    });
  }

  return parsed;
}

function buildProposalDraft(
  metadata: ReturnType<typeof readMetadata>,
  rows: RawImportRow[],
  sourceName?: string
) {
  const milestoneRows = new Map<number, RawImportRow[]>();
  for (const row of rows) {
    const current = milestoneRows.get(row.milestoneOrder) ?? [];
    current.push(row);
    milestoneRows.set(row.milestoneOrder, current);
  }

  const milestones = [...milestoneRows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([order, group]) => {
      const first = group[0];
      const milestoneKey = slugify(first.milestoneName);
      const submilestones = group.map((row) => ({
        budgetAmount: row.budgetAmount,
        budgetLineKey: `${milestoneKey}:${slugify(row.category)}`,
        costPerTotalSqft: row.costPerTotalSqft,
        drawableAmount: row.drawableAmount,
        name: row.category,
        percentageBps: row.percentageBps,
      }));

      return {
        budgetAmount: sum(group.map((row) => row.budgetAmount)),
        drawableAmount: first.milestoneDrawableAmount,
        milestoneKey,
        name: first.milestoneName,
        order,
        submilestones,
      };
    });

  return {
    ...metadata,
    importVersion: "drawflow-budget-workbook-v1" as const,
    sourceName,
    milestones,
  };
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function stringValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function parseMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return roundMoney(value);
  }
  const text = String(value ?? "").trim();
  if (!text || text === "-") {
    return 0;
  }
  const normalized = text
    .replace(MONEY_STRIP_REGEX, "")
    .replace(PARENTHESIZED_NEGATIVE_REGEX, "-$1");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? roundMoney(parsed) : null;
}

function parsePercent(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1 ? value / 100 : value;
  }
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const hasPercentSign = text.includes("%");
  const parsed = Number(text.replace(/[%\s]/g, ""));
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (hasPercentSign) {
    return parsed / 100;
  }
  return parsed > 1 ? parsed / 100 : parsed;
}

function optionalMoney(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  return parseMoney(value);
}

function requiredMoney(value: unknown, label: string) {
  const parsed = parseMoney(value);
  if (parsed === null) {
    throw new Error(`${label} must be a currency amount.`);
  }
  return parsed;
}

function requiredPercent(value: unknown, label: string) {
  const parsed = parsePercent(value);
  if (parsed === null) {
    throw new Error(`${label} must be a percent.`);
  }
  return parsed;
}

function optionalInteger(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const parsed = Number(text.replace(/,/g, ""));
  return Number.isInteger(parsed) ? parsed : null;
}

function requiredInteger(value: unknown, label: string) {
  const parsed = optionalInteger(value);
  if (parsed === null) {
    throw new Error(`${label} must be an integer.`);
  }
  return parsed;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function sameMoney(left: number, right: number) {
  return Math.abs(roundMoney(left) - roundMoney(right)) <= 0.05;
}

function sum(values: number[]) {
  return roundMoney(values.reduce((total, value) => total + value, 0));
}

function formatMoney(value: number) {
  return `$${roundMoney(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
