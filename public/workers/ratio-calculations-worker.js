self.addEventListener('message', function(e) {
  const data = e.data;
  switch (data.type) {
    case 'calculateRatios':
      const ratios = calculateRatios(data.payload);
      self.postMessage({ type: 'ratiosCalculated', payload: ratios });
      break;
    case 'calculateRollingAverage':
      const rollingAverage = calculateRollingAverage(data.payload.data, data.payload.window);
      self.postMessage({ type: 'rollingAverageCalculated', payload: rollingAverage });
      break;
    case 'calculateRollingStdDev':
      const rollingStdDev = calculateRollingStdDev(data.payload.data, data.payload.window);
      self.postMessage({ type: 'rollingStdDevCalculated', payload: rollingStdDev });
      break;
  }
}, false);

function calculateRatios(data) {
  // Example implementation (replace with your actual ratio calculation logic)
  const ratios = data.map(item => {
    return {
      ratio1: item.value1 / item.value2,
      ratio2: item.value3 * item.value4
    };
  });
  return ratios;
}

function calculateRollingAverage(data, windowSize) {
  const rollingAverage = [];
  for (let i = 0; i < data.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize + 1); j <= i; j++) {
      sum += data[j];
      count++;
    }
    rollingAverage.push(sum / count);
  }
  return rollingAverage;
}

function calculateRollingStdDev(data, windowSize) {
  const rollingStdDev = [];
  for (let i = 0; i < data.length; i++) {
    const slice = data.slice(Math.max(0, i - windowSize + 1), i + 1);
    const mean = slice.reduce((sum, val) => sum + val, 0) / slice.length;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (slice.length - 1);
    const stdDev = Math.sqrt(variance);
    rollingStdDev.push(stdDev);
  }
  return rollingStdDev;
}
