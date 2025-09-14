
// src/lib/route-utils.ts

interface CalculationInput {
  pricingMethod: 'perRoute' | 'perBox';
  distanceKm?: number | null;
  pricePerKm?: number | null;
  arterisTolls?: number | null;
  ccrTolls?: number | null;
  boxCount?: number | null;
  pricePerBox?: number | null;
}

interface CostParameters {
  arteris: number;
  ccr: number;
  fuelPrice: number;
  averageFuelConsumption: number;
}

export function getTollCost(arterisTolls: number | null | undefined, ccrTolls: number | null | undefined, tollPrices: { arteris: number, ccr: number }): number {
  const arterisCost = (arterisTolls || 0) * tollPrices.arteris;
  const ccrCost = (ccrTolls || 0) * tollPrices.ccr;
  return parseFloat((arterisCost + ccrCost).toFixed(2));
}

export function calculateTotalValue(
  input: CalculationInput,
  params: CostParameters
) {
  if (input.pricingMethod === 'perBox') {
    const totalValue = (Number(input.boxCount) || 0) * (Number(input.pricePerBox) || 0);
    return {
      totalValue,
      fuelCost: 0,
      transportServiceCost: totalValue,
      totalTollCost: 0
    };
  }
  
  // Assumes 'perRoute'
  const transportServiceCost = (input.distanceKm || 0) * (input.pricePerKm || 0);
  const totalTollCost = getTollCost(input.arterisTolls, input.ccrTolls, { arteris: params.arteris, ccr: params.ccr });
  const fuelCost = (input.distanceKm || 0) > 0 && params.averageFuelConsumption > 0
      ? ((input.distanceKm || 0) / params.averageFuelConsumption) * params.fuelPrice
      : 0;

  return {
    totalValue: transportServiceCost + fuelCost + totalTollCost,
    fuelCost: parseFloat(fuelCost.toFixed(2)),
    transportServiceCost: parseFloat(transportServiceCost.toFixed(2)),
    totalTollCost: totalTollCost
  };
}
