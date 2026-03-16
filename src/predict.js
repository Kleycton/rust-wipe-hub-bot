function diffDays(a, b) {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function pickRegularInterval(wipes) {
  if (!Array.isArray(wipes) || wipes.length < 3) return null;

  const sorted = wipes
    .map((d) => (d instanceof Date ? d : new Date(d)))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());

  const intervals = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const days = diffDays(sorted[i], sorted[i + 1]);
    if (days > 0 && days <= 35) intervals.push(days);
  }

  if (intervals.length < 2) return null;

  const score = new Map();
  for (const days of intervals) score.set(days, (score.get(days) || 0) + 1);

  const ranked = [...score.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0] - b[0];
  });

  const [intervalDays, count] = ranked[0] || [];
  if (!intervalDays) return null;

  const nextWipe = new Date(sorted[0]);
  nextWipe.setUTCDate(nextWipe.getUTCDate() + intervalDays);

  return {
    intervalDays,
    confidence: count / intervals.length,
    nextWipe
  };
}

module.exports = { pickRegularInterval };
