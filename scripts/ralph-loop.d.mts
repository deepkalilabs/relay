export type RalphIncrement = {
  number: number;
  title: string;
  body: string;
  sourceStart: number;
};

export function expectedBranch(planPath: string): string;
export function assertGeneratedBranch(
  currentBranch: string,
  generatedBranch: string,
): void;
export function parseIncrements(content: string): RalphIncrement[];
export function renderIncrementPlan(
  masterContent: string,
  increment: RalphIncrement,
): string;
