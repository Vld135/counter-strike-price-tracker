function filterOutliersByIQR(dataPoints) {
  if (dataPoints.length < 4) return dataPoints;

  const sortedValues = dataPoints.map((d) => d.value).sort((a, b) => a - b);

  const percentile = (arr, p) => {
    const idx = (arr.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return arr[lower];
    return arr[lower] + (arr[upper] - arr[lower]) * (idx - lower);
  };

  const q1 = percentile(sortedValues, 0.25);
  const q3 = percentile(sortedValues, 0.75);
  const iqr = q3 - q1;

  if (iqr === 0) return dataPoints;

  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const filtered = dataPoints.filter(
    (d) => d.value >= lowerBound && d.value <= upperBound
  );

  return filtered.length > 0 ? filtered : dataPoints;
}

function getWeightedAveragePrice(data, lastEver) {
  const now = Date.now();

  const calculateWAP = (days) => {
    const limit = now - days * 24 * 60 * 60 * 1000;
    const windowData = data.filter(({ time }) => time >= limit);

    if (windowData.length === 0) return null;

    if (windowData.length < 4) {
      const sorted = windowData.map((d) => d.value).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    const filtered = filterOutliersByIQR(windowData);

    let totalVolume = 0;
    let totalPriceVolumeProduct = 0;
    filtered.forEach(({ value, volume }) => {
      totalPriceVolumeProduct += value * volume;
      totalVolume += volume;
    });

    return totalVolume > 0 ? totalPriceVolumeProduct / totalVolume : null;
  };

  return {
    last_24h: calculateWAP(1),
    last_7d: calculateWAP(7),
    last_30d: calculateWAP(30),
    last_90d: calculateWAP(90),
    last_ever: lastEver,
  };
}

module.exports = { filterOutliersByIQR, getWeightedAveragePrice };
