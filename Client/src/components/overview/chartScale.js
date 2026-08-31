// scale configuration
const STEP_CANDIDATES = [1, 2, 2.5, 3, 4, 5, 10];

// scale functions
export function buildScale(peak, maxSteps = 4) {
    const top = Number.isFinite(peak) ? Math.max(peak, 0) : 0;

    if (top <= 0) return { max: 1, ticks: [1, 0] };

    const steps = Math.max(1, Math.min(maxSteps, Math.ceil(top)));
    const raw = top / steps;
    const magnitude = 10 ** Math.floor(Math.log10(raw));

    const step = STEP_CANDIDATES
        .map(factor => factor * magnitude)
        .find(candidate => candidate >= raw - 1e-9) ?? magnitude * 10;

    const rounded = Math.max(1, Math.round(step));
    const max = rounded * steps;

    const ticks = [];
    for (let value = max; value >= 0; value -= rounded) ticks.push(value);

    return { max, ticks };
}

// label functions
export function labelStride(count, maxLabels = 12) {
    return Math.max(1, Math.ceil(count / maxLabels));
}

export function showsLabel(index, count, stride) {
    return (count - 1 - index) % stride === 0;
}

export function toneVariable(tone, fallback = 'completed') {
    return `var(--chart-${tone || fallback})`;
}
