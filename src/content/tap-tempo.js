export function tapTempoBpm(timestamps) {
  const taps = (Array.isArray(timestamps) ? timestamps : [])
    .map(Number)
    .filter(Number.isFinite)
    .filter((time, index, values) => index === 0 || time > values[index - 1]);
  if (taps.length < 4) return null;
  const intervals = taps.slice(1).map((time, index) => time - taps[index]).filter((interval) => interval > 0);
  if (!intervals.length) return null;

  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const middle = Math.floor(sortedIntervals.length / 2);
  const medianInterval = sortedIntervals.length % 2
    ? sortedIntervals[middle]
    : (sortedIntervals[middle - 1] + sortedIntervals[middle]) / 2;

  let elapsed = 0;
  let beat = 0;
  const points = [{ beat, elapsed }];
  for (const interval of intervals) {
    elapsed += interval;
    beat += Math.max(1, Math.round(interval / medianInterval));
    points.push({ beat, elapsed });
  }

  const meanBeat = points.reduce((sum, point) => sum + point.beat, 0) / points.length;
  const meanElapsed = points.reduce((sum, point) => sum + point.elapsed, 0) / points.length;
  const regression = points.reduce((result, point) => ({
    covariance: result.covariance + (point.beat - meanBeat) * (point.elapsed - meanElapsed),
    variance: result.variance + (point.beat - meanBeat) ** 2
  }), { covariance: 0, variance: 0 });
  if (!regression.variance) return null;

  let bpm = 60000 / (regression.covariance / regression.variance);
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}
