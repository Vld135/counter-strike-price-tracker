const { filterOutliersByIQR, getWeightedAveragePrice } = require("./pricing");

describe("filterOutliersByIQR", () => {
  test("returns original when fewer than 4 data points", () => {
    const data = [
      { value: 10 },
      { value: 100 },
      { value: 1000 },
    ];
    expect(filterOutliersByIQR(data)).toBe(data);
  });

  test("returns original when IQR is 0 (all same price)", () => {
    const data = [
      { value: 5 },
      { value: 5 },
      { value: 5 },
      { value: 5 },
    ];
    expect(filterOutliersByIQR(data)).toBe(data);
  });

  test("removes upper outlier", () => {
    const data = [
      { value: 50 },
      { value: 55 },
      { value: 60 },
      { value: 58 },
      { value: 52 },
      { value: 700 },
    ];
    const result = filterOutliersByIQR(data);
    expect(result).not.toContainEqual({ value: 700 });
    expect(result.length).toBe(5);
  });

  test("removes lower outlier", () => {
    const data = [
      { value: 50 },
      { value: 55 },
      { value: 60 },
      { value: 58 },
      { value: 52 },
      { value: 1 },
    ];
    const result = filterOutliersByIQR(data);
    expect(result).not.toContainEqual({ value: 1 });
    expect(result.length).toBe(5);
  });

  test("does not remove normal data without outliers", () => {
    const data = [
      { value: 50 },
      { value: 52 },
      { value: 55 },
      { value: 58 },
      { value: 60 },
    ];
    const result = filterOutliersByIQR(data);
    expect(result.length).toBe(5);
  });

  test("returns original as fallback if all filtered out", () => {
    const data = [
      { value: 1 },
      { value: 2 },
      { value: 3 },
      { value: 4 },
    ];
    const result = filterOutliersByIQR(data);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("getWeightedAveragePrice", () => {
  const now = Date.now();
  const hours = (h) => now - h * 60 * 60 * 1000;
  const days = (d) => now - d * 24 * 60 * 60 * 1000;

  test("returns all nulls for empty data", () => {
    const result = getWeightedAveragePrice([], null);
    expect(result).toEqual({
      last_24h: null,
      last_7d: null,
      last_30d: null,
      last_90d: null,
      last_ever: null,
    });
  });

  test("passes last_ever through as-is", () => {
    const result = getWeightedAveragePrice([], 42.5);
    expect(result.last_ever).toBe(42.5);
  });

  test("returns median for 1-3 data points in window", () => {
    const data = [
      { time: hours(1), value: 10, volume: 1 },
      { time: hours(2), value: 30, volume: 1 },
      { time: hours(3), value: 20, volume: 1 },
    ];
    // Median of [10, 20, 30] = 20
    expect(getWeightedAveragePrice(data, 30).last_24h).toBe(20);
  });

  test("returns median average for even count of data points", () => {
    const data = [
      { time: hours(1), value: 10, volume: 1 },
      { time: hours(2), value: 20, volume: 1 },
    ];
    // Median of [10, 20] = 15
    expect(getWeightedAveragePrice(data, 20).last_24h).toBe(15);
  });

  test("calculates correct VWAP for normal data", () => {
    const data = [
      { time: hours(1), value: 100, volume: 10 },
      { time: hours(2), value: 110, volume: 5 },
      { time: hours(3), value: 105, volume: 8 },
      { time: hours(4), value: 102, volume: 12 },
    ];
    // VWAP = (100*10 + 110*5 + 105*8 + 102*12) / (10+5+8+12)
    //      = (1000 + 550 + 840 + 1224) / 35
    //      = 3614 / 35 ≈ 103.257
    const result = getWeightedAveragePrice(data, 102);
    expect(result.last_24h).toBeCloseTo(3614 / 35, 2);
  });

  test("spike does not affect VWAP after IQR filtering", () => {
    const data = [
      { time: hours(1), value: 60, volume: 5 },
      { time: hours(2), value: 55, volume: 10 },
      { time: hours(3), value: 58, volume: 8 },
      { time: hours(4), value: 62, volume: 6 },
      { time: hours(5), value: 700, volume: 1 },
    ];

    const result = getWeightedAveragePrice(data, 700);

    // Without IQR: (60*5+55*10+58*8+62*6+700*1)/(5+10+8+6+1) = 2714/30 ≈ 90.47
    // With IQR: spike removed, VWAP = (60*5+55*10+58*8+62*6)/(5+10+8+6) = 2014/29 ≈ 69.45
    const vwapWithoutSpike = (60 * 5 + 55 * 10 + 58 * 8 + 62 * 6) / (5 + 10 + 8 + 6);
    expect(result.last_24h).toBeCloseTo(vwapWithoutSpike, 2);
  });

  test("returns null for windows with no data", () => {
    const data = [
      { time: days(20), value: 50, volume: 5 },
      { time: days(21), value: 55, volume: 3 },
      { time: days(22), value: 52, volume: 7 },
      { time: days(23), value: 48, volume: 4 },
    ];

    const result = getWeightedAveragePrice(data, 48);
    expect(result.last_24h).toBeNull();
    expect(result.last_7d).toBeNull();
    expect(result.last_30d).not.toBeNull();
    expect(result.last_90d).not.toBeNull();
  });

  test("different time windows return different values", () => {
    const data = [
      { time: hours(2), value: 100, volume: 5 },
      { time: days(3), value: 80, volume: 10 },
      { time: days(5), value: 85, volume: 8 },
      { time: days(6), value: 82, volume: 12 },
      { time: days(20), value: 60, volume: 15 },
      { time: days(25), value: 65, volume: 7 },
    ];

    const result = getWeightedAveragePrice(data, 100);
    expect(result.last_24h).toBe(100);
    expect(result.last_7d).not.toBe(result.last_30d);
  });
});
