export interface EvilChartMilestone {
  budget: number;
  completionWeek: number;
  name: string;
}

export interface EvilChartDatum extends EvilChartMilestone {
  cashOnHand: number;
  drawAmount: number;
  drawPool: number;
  invertedDrawPool: number;
  [key: string]: unknown;
}

export const evilChartStartingCash = 400_000;
export const evilChartDrawReviewLagWeeks = 1;
export const evilChartDrawCashBuffer = 8000;

export const evilChartMilestones: EvilChartMilestone[] = [
  { budget: 72_000, completionWeek: 3, name: "Sitework" },
  { budget: 118_000, completionWeek: 8, name: "Foundation" },
  { budget: 164_000, completionWeek: 14, name: "Framing" },
  { budget: 96_000, completionWeek: 18, name: "Dry-in" },
  { budget: 142_000, completionWeek: 25, name: "MEP rough-in" },
  { budget: 186_000, completionWeek: 34, name: "Interior" },
  { budget: 54_000, completionWeek: 39, name: "Final punch" },
];

export function buildEvilChartDrawSchedule(
  items: EvilChartMilestone[],
  initialCash: number
): EvilChartDatum[] {
  let cashOnHand = initialCash;
  let drawPool = 0;

  const schedule = items.flatMap((item, index): EvilChartDatum[] => {
    cashOnHand -= item.budget;
    drawPool += item.budget;

    const nextBudget = items[index + 1]?.budget ?? 0;
    const drawAmount =
      cashOnHand < nextBudget
        ? Math.min(drawPool, nextBudget - cashOnHand + evilChartDrawCashBuffer)
        : 0;

    const milestonePoint: EvilChartDatum = {
      ...item,
      cashOnHand,
      drawAmount: 0,
      drawPool,
      invertedDrawPool: -drawPool,
    };

    if (drawAmount === 0) {
      return [milestonePoint];
    }

    cashOnHand += drawAmount;
    drawPool -= drawAmount;

    return [
      milestonePoint,
      {
        budget: 0,
        cashOnHand,
        completionWeek: item.completionWeek + evilChartDrawReviewLagWeeks,
        drawAmount,
        drawPool,
        invertedDrawPool: -drawPool,
        name: `Draw after ${item.name}`,
      },
    ];
  });

  return [
    {
      budget: 0,
      cashOnHand: initialCash,
      completionWeek: 0,
      drawAmount: 0,
      drawPool: 0,
      invertedDrawPool: 0,
      name: "Start",
    },
    ...schedule,
  ];
}
