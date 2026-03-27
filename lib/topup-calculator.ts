export function calculateCustomTopup(euroAmount: number): {
  credits: number;
  bonusRate: number;
} {
  const bonusRate =
    euroAmount >= 100 ? 0.13 :
    euroAmount >= 50 ? 0.10 :
    euroAmount >= 20 ? 0.06 :
    euroAmount >= 10 ? 0.03 : 0;

  const netAmount = euroAmount / 1.19;
  const credits = Math.floor((netAmount * 0.70 * (1 + bonusRate)) / 0.01);
  return { credits, bonusRate };
}
