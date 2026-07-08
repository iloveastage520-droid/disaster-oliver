export function calculateStatistics(features) {
  const total = features.length;
  const completed = countByStatus(features, "Completed");
  const inProgress = countByStatus(features, "In Progress");
  const notStarted = countByStatus(features, "Not Started");
  const averageCompletion = total
    ? Math.round(features.reduce((sum, feature) => sum + feature.properties.completionPercentage, 0) / total)
    : 0;

  return {
    total,
    completed,
    inProgress,
    notStarted,
    completionRate: averageCompletion,
    estimatedFinishTime: latestEstimatedFinish(features)
  };
}

function countByStatus(features, status) {
  return features.filter((feature) => feature.properties.status === status).length;
}

function latestEstimatedFinish(features) {
  const times = features
    .map((feature) => feature.properties.estimatedFinishTime)
    .filter((value) => value && value !== "--")
    .sort();
  return times.at(-1) || "--";
}
