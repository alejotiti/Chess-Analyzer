export type MoveClassification =
  | "BLUNDER"
  | "MISTAKE"
  | "INACCURACY"
  | "GOOD"
  | "EXCELLENT"
  | "BEST"
  | "BRILLIANT";

export type MateScore = { type: "mate"; value: number };
export type EvalInput = number | MateScore;

export type ClassifyMoveInput = {
  evalBefore: EvalInput;
  bestEvalAfter: EvalInput;
  playedEvalAfter: EvalInput;
  sideToMove: "w" | "b";
  allowsMate?: boolean;
  isSacrifice?: boolean;
  materialChangeCp?: number;
};

export type ClassifyMoveOutput = {
  classification: MoveClassification;
  deltaCp: number;
};

const LARGE_MATE_CP = 100_000;

function evalToWhiteCp(evalInput: EvalInput, sideToMove: "w" | "b"): number {
  const cpFromSideToMove =
    typeof evalInput === "number" ? evalInput : evalInput.value >= 0 ? LARGE_MATE_CP : -LARGE_MATE_CP;
  return sideToMove === "w" ? cpFromSideToMove : -cpFromSideToMove;
}

function toMoverPerspective(whiteCp: number, sideToMove: "w" | "b"): number {
  return sideToMove === "w" ? whiteCp : -whiteCp;
}

function thresholdClassification(deltaCp: number): MoveClassification {
  if (deltaCp <= 10) return "BEST";
  if (deltaCp <= 25) return "EXCELLENT";
  if (deltaCp <= 60) return "GOOD";
  if (deltaCp <= 120) return "INACCURACY";
  if (deltaCp <= 300) return "MISTAKE";
  return "BLUNDER";
}

function severityRank(classification: MoveClassification): number {
  switch (classification) {
    case "BLUNDER":
      return 0;
    case "MISTAKE":
      return 1;
    case "INACCURACY":
      return 2;
    case "GOOD":
      return 3;
    case "EXCELLENT":
      return 4;
    case "BEST":
      return 5;
    case "BRILLIANT":
      return 6;
    default:
      return 0;
  }
}

function minSeverity(current: MoveClassification, target: MoveClassification): MoveClassification {
  return severityRank(current) > severityRank(target) ? target : current;
}

export function classifyMove(input: ClassifyMoveInput): ClassifyMoveOutput {
  const bestWhiteCp = evalToWhiteCp(input.bestEvalAfter, input.sideToMove === "w" ? "b" : "w");
  const playedWhiteCp = evalToWhiteCp(input.playedEvalAfter, input.sideToMove === "w" ? "b" : "w");
  const beforeWhiteCp = evalToWhiteCp(input.evalBefore, input.sideToMove);

  const bestMoverCp = toMoverPerspective(bestWhiteCp, input.sideToMove);
  const playedMoverCp = toMoverPerspective(playedWhiteCp, input.sideToMove);
  const beforeMoverCp = toMoverPerspective(beforeWhiteCp, input.sideToMove);

  const deltaCp = Math.max(0, Math.round(bestMoverCp - playedMoverCp));
  let classification = thresholdClassification(deltaCp);

  if (input.allowsMate) {
    return { classification: "BLUNDER", deltaCp };
  }

  const materialChangeCp = input.materialChangeCp ?? 0;
  const immediateMaterialDrop = materialChangeCp <= -100;

  if (immediateMaterialDrop && deltaCp >= 120) {
    classification = minSeverity(classification, "MISTAKE");
  }

  if (immediateMaterialDrop && deltaCp > 300) {
    classification = "BLUNDER";
  }

  const candidateBrilliant = classification === "BEST" || classification === "EXCELLENT";
  const improvesAdvantage = playedMoverCp - beforeMoverCp >= 80;
  const clearlyGoodAfter = playedMoverCp >= 120;

  if (candidateBrilliant && (input.isSacrifice ?? false) && (clearlyGoodAfter || improvesAdvantage)) {
    classification = "BRILLIANT";
  }

  return { classification, deltaCp };
}
