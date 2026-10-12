const EPSILON = 1e-12;
const ITERATIONS = 80;
const DEFAULT_COMPONENTS = 15;

const dot = (left, right) =>
  left.reduce((sum, value, index) => sum + value * right[index], 0);
const norm = (vector) => Math.sqrt(dot(vector, vector));
const normalize = (vector) => {
  const length = norm(vector) || 1;
  return vector.map((value) => value / length);
};
const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));
const percentile = (values, probability) => {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.floor((sorted.length - 1) * probability),
  );
  return sorted[index] ?? 0;
};

function covariance(matrix) {
  const rows = matrix.length;
  const columns = matrix[0].length;
  const result = Array.from({ length: columns }, () => Array(columns).fill(0));
  for (let left = 0; left < columns; left += 1) {
    for (let right = left; right < columns; right += 1) {
      let total = 0;
      for (const row of matrix) total += row[left] * row[right];
      const value = total / Math.max(rows - 1, 1);
      result[left][right] = value;
      result[right][left] = value;
    }
  }
  return result;
}

function principalComponents(covarianceMatrix, requestedComponents) {
  const size = covarianceMatrix.length;
  const components = [];
  const residual = covarianceMatrix.map((row) => [...row]);
  for (
    let componentIndex = 0;
    componentIndex < Math.min(requestedComponents, size);
    componentIndex += 1
  ) {
    let vector = normalize(
      Array.from(
        { length: size },
        (_, index) => ((index + componentIndex * 3) % 11) + 1,
      ),
    );
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      vector = normalize(residual.map((row) => dot(row, vector)));
    }
    const eigenvalue = dot(
      vector,
      residual.map((row) => dot(row, vector)),
    );
    if (eigenvalue < EPSILON) break;
    components.push({ vector, eigenvalue });
    for (let left = 0; left < size; left += 1) {
      for (let right = 0; right < size; right += 1) {
        residual[left][right] -= eigenvalue * vector[left] * vector[right];
      }
    }
  }
  return components;
}

function buildSubsystemHealth(channels, featureResiduals) {
  const residualScale = percentile(featureResiduals, 0.95) || 1;
  const metrics = channels.map((channel, index) => {
    const validPoints = channel.points.filter((point) =>
      Number.isFinite(Number(point.value)),
    ).length;
    const completeness = validPoints / Math.max(channel.points.length, 1);
    const pcaHealth = clamp(
      100 - (featureResiduals[index] / residualScale) * 50,
      0,
      100,
    );
    return {
      channel: channel.id,
      subsystem: channel.subsystem,
      residual: Number(featureResiduals[index].toFixed(6)),
      pcaHealth,
      completeness,
      labeledAnomalies: channel.anomalies.length,
    };
  });
  const groups = [...new Set(metrics.map((metric) => metric.subsystem))];
  return groups.map((subsystem) => {
    const members = metrics.filter((metric) => metric.subsystem === subsystem);
    const pcaHealth =
      members.reduce((sum, metric) => sum + metric.pcaHealth, 0) /
      members.length;
    const completeness =
      members.reduce((sum, metric) => sum + metric.completeness, 0) /
      members.length;
    const labeledAnomalies = members.reduce(
      (sum, metric) => sum + metric.labeledAnomalies,
      0,
    );
    return {
      name: subsystem,
      healthScore: Math.round(pcaHealth * 0.75 + completeness * 100 * 0.25),
      pcaHealth: Math.round(pcaHealth),
      completeness: Math.round(completeness * 100),
      channelCount: members.length,
      labeledAnomalies,
    };
  });
}

export function scorePca(channels, requestedComponents = DEFAULT_COMPONENTS) {
  const usableChannels = channels.filter(
    (channel) => channel.points?.length > 1,
  );
  if (usableChannels.length < 2) {
    throw new Error(
      "At least two channels with telemetry points are required for PCA",
    );
  }
  const sampleCount = Math.min(
    ...usableChannels.map((channel) => channel.points.length),
  );
  const series = usableChannels.map((channel) => {
    const values = channel.points
      .slice(0, sampleCount)
      .map((point) => Number(point.value));
    const validValues = values.filter(Number.isFinite);
    const fallback = validValues.length
      ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length
      : 0;
    return values.map((value) => (Number.isFinite(value) ? value : fallback));
  });
  const featureMeans = series.map(
    (values) => values.reduce((sum, value) => sum + value, 0) / sampleCount,
  );
  const featureStds = series.map((values, featureIndex) => {
    const variance =
      values.reduce(
        (sum, value) => sum + (value - featureMeans[featureIndex]) ** 2,
        0,
      ) / Math.max(sampleCount - 1, 1);
    return Math.sqrt(variance) || 1;
  });
  const matrix = Array.from({ length: sampleCount }, (_, sampleIndex) =>
    series.map(
      (values, featureIndex) =>
        (values[sampleIndex] - featureMeans[featureIndex]) /
        featureStds[featureIndex],
    ),
  );
  const components = principalComponents(
    covariance(matrix),
    requestedComponents,
  );
  const residuals = matrix.map((row) => {
    const reconstruction = Array(row.length).fill(0);
    for (const component of components) {
      const projection = dot(row, component.vector);
      component.vector.forEach((value, index) => {
        reconstruction[index] += projection * value;
      });
    }
    return row.map((value, index) => value - reconstruction[index]);
  });
  const scores = residuals.map((row) =>
    Math.sqrt(row.reduce((sum, value) => sum + value ** 2, 0) / row.length),
  );
  const featureResiduals = usableChannels.map((_, featureIndex) =>
    Math.sqrt(
      residuals.reduce((sum, row) => sum + row[featureIndex] ** 2, 0) /
        residuals.length,
    ),
  );
  const threshold = percentile(scores, 0.95);
  const scoreSeries = scores.map((score, index) => ({
    time: usableChannels[0].points[index].time,
    value: Number(score.toFixed(6)),
  }));
  const currentIndex = scores.length - 1;
  const contributors = usableChannels
    .map((channel, index) => ({
      channel: channel.id,
      name: channel.displayName,
      contribution: Number(Math.abs(residuals[currentIndex][index]).toFixed(4)),
    }))
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, 8);
  return {
    algorithm: "PCA reconstruction error",
    components: components.length,
    featureCount: usableChannels.length,
    sampleCount,
    threshold: Number(threshold.toFixed(6)),
    currentScore: Number(scores[currentIndex].toFixed(6)),
    anomalySamples: scores.filter((score) => score > threshold).length,
    series: scoreSeries,
    contributors,
    subsystems: buildSubsystemHealth(usableChannels, featureResiduals),
  };
}
