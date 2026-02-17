import { classifyMove } from "./classifyMove";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`classifyMove harness failed: ${message}`);
}

export function runClassifyMoveHarness(): void {
  const best = classifyMove({
    evalBefore: 20,
    bestEvalAfter: 60,
    playedEvalAfter: 55,
    sideToMove: "w",
  });
  assert(best.classification === "BEST", "expected BEST for tiny delta");

  const mistake = classifyMove({
    evalBefore: 10,
    bestEvalAfter: 120,
    playedEvalAfter: -40,
    sideToMove: "w",
  });
  assert(mistake.classification === "MISTAKE", "expected MISTAKE around delta 160");

  const blunderByMate = classifyMove({
    evalBefore: 30,
    bestEvalAfter: 40,
    playedEvalAfter: { type: "mate", value: 3 },
    sideToMove: "w",
    allowsMate: true,
  });
  assert(blunderByMate.classification === "BLUNDER", "expected BLUNDER when allowing mate");

  const brilliant = classifyMove({
    evalBefore: 30,
    bestEvalAfter: 140,
    playedEvalAfter: 130,
    sideToMove: "w",
    isSacrifice: true,
    materialChangeCp: -100,
  });
  assert(brilliant.classification === "BRILLIANT", "expected BRILLIANT for strong sacrifice");
}
