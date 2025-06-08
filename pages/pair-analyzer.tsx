// Matrix operations for 2x2 matrices
const matrixMultiply2x2 = (A: number[][], B: number[][]): number[][] => {
  return [
    [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
    [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
  ]
}

const matrixMultiply2x1 = (A: number[][], b: number[]): number[] => {
  return [A[0][0] * b[0] + A[0][1] * b[1], A[1][0] * b[0] + A[1][1] * b[1]]
}

const matrixMultiply1x2 = (a: number[], B: number[][]): number[] => {
  return [a[0] * B[0][0] + a[1] * B[1][0], a[0] * B[0][1] + a[1] * B[1][1]]
}

const matrixTranspose2x2 = (A: number[][]): number[][] => {
  return [
    [A[0][0], A[1][0]],
    [A[0][1], A[1][1]],
  ]
}

const matrixAdd2x2 = (A: number[][], B: number[][]): number[][] => {
  return [
    [A[0][0] + B[0][0], A[0][1] + B[0][1]],
    [A[1][0] + B[1][0], A[1][1] + B[1][1]],
  ]
}

const matrixSubtract2x2 = (A: number[][], B: number[][]): number[][] => {
  return [
    [A[0][0] - B[0][0], A[0][1] - B[0][1]],
    [A[1][0] - B[1][0], A[1][1] - B[1][1]],
  ]
}

const matrixInverse2x2 = (A: number[][]): number[][] => {
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
  if (Math.abs(det) < 1e-10) {
    // Return identity matrix if singular
    return [
      [1, 0],
      [0, 1],
    ]
  }
  return [
    [A[1][1] / det, -A[0][1] / det],
    [-A[1][0] / det, A[0][0] / det],
  ]
}

const scalarInverse = (x: number): number => {
  return Math.abs(x) < 1e-10 ? 1.0 : 1.0 / x
}

// Improved Kalman filter implementation with 2D state vector
const kalmanFilter = (
  pricesA: { close: number; date: string }[],
  pricesB: { close: number; date: string }[],
  processNoise = 0.0001,
  measurementNoise = 1.0,
  initialLookback = 60,
) => {
  const n = pricesA.length

  if (n < initialLookback) {
    console.warn(`Not enough data for Kalman filter initialization. Need ${initialLookback}, got ${n}`)
    return { hedgeRatios: Array(n).fill(1), alphas: Array(n).fill(0) }
  }

  // Initialize with OLS regression on first initialLookback days
  let sumA = 0,
    sumB = 0,
    sumAB = 0,
    sumB2 = 0
  for (let i = 0; i < initialLookback; i++) {
    const priceA = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
    const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close

    sumA += priceA
    sumB += priceB
    sumAB += priceA * priceB
    sumB2 += priceB * priceB
  }

  const meanA = sumA / initialLookback
  const meanB = sumB / initialLookback

  // Calculate initial beta and alpha using OLS
  const numerator = initialLookback * sumAB - sumA * sumB
  const denominator = initialLookback * sumB2 - sumB * sumB
  const initialBeta = Math.abs(denominator) > 1e-10 ? numerator / denominator : 1.0
  const initialAlpha = meanA - initialBeta * meanB

  // Calculate initial measurement noise from OLS residuals
  let residualSumSquares = 0
  for (let i = 0; i < initialLookback; i++) {
    const priceA = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
    const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close
    const predicted = initialAlpha + initialBeta * priceB
    const residual = priceA - predicted
    residualSumSquares += residual * residual
  }
  const adaptiveR = residualSumSquares / (initialLookback - 2) // Use adaptive measurement noise

  console.log("=== IMPROVED KALMAN FILTER INITIALIZATION ===")
  console.log(`Initial lookback: ${initialLookback} days`)
  console.log(`Initial Alpha: ${initialAlpha.toFixed(4)}`)
  console.log(`Initial Beta: ${initialBeta.toFixed(4)}`)
  console.log(`Adaptive R (measurement noise): ${adaptiveR.toFixed(6)}`)
  console.log(`Process noise: ${processNoise}`)

  // Initialize state vector [alpha, beta]
  let x = [initialAlpha, initialBeta]

  // Initialize covariance matrix P
  let P: number[][] = [
    [1000, 0],
    [0, 1000],
  ]

  // Process noise matrix Q
  const Q: number[][] = [
    [processNoise, 0],
    [0, processNoise],
  ]

  // State transition matrix F (identity for this model)
  const F: number[][] = [
    [1, 0],
    [0, 1],
  ]

  const hedgeRatios: number[] = []
  const alphas: number[] = []

  // Fill initial values for the first initialLookback days
  for (let i = 0; i < initialLookback; i++) {
    hedgeRatios.push(initialBeta)
    alphas.push(initialAlpha)
  }

  // Process remaining data points with Kalman filter
  for (let i = initialLookback; i < n; i++) {
    const priceA = typeof pricesA[i].close === "string" ? Number.parseFloat(pricesA[i].close) : pricesA[i].close
    const priceB = typeof pricesB[i].close === "string" ? Number.parseFloat(pricesB[i].close) : pricesB[i].close

    // Prediction step
    // x_pred = F @ x (F is identity, so x_pred = x)
    const x_pred = [...x]

    // P_pred = F @ P @ F.T + Q (F is identity, so P_pred = P + Q)
    const P_pred = matrixAdd2x2(P, Q)

    // Update step
    // Observation matrix H_t = [1, priceB]
    const H_t = [1, priceB]

    // Innovation: y - H @ x_pred
    const predicted_y = H_t[0] * x_pred[0] + H_t[1] * x_pred[1] // H_t @ x_pred
    const innovation = priceA - predicted_y

    // Innovation covariance: H @ P_pred @ H.T + R
    const H_P_pred = [P_pred[0][0] * H_t[0] + P_pred[0][1] * H_t[1], P_pred[1][0] * H_t[0] + P_pred[1][1] * H_t[1]] // 2x1
    const innovation_covariance = H_P_pred[0] * H_t[0] + H_P_pred[1] * H_t[1] + adaptiveR // scalar

    // Kalman gain: P_pred @ H.T @ inv(innovation_covariance)
    const P_pred_H_T = [P_pred[0][0] * H_t[0] + P_pred[0][1] * H_t[1], P_pred[1][0] * H_t[0] + P_pred[1][1] * H_t[1]] // 2x1
    const K = [
      P_pred_H_T[0] * scalarInverse(innovation_covariance),
      P_pred_H_T[1] * scalarInverse(innovation_covariance),
    ] // 2x1

    // Update state: x = x_pred + K @ innovation
    x = [x_pred[0] + K[0] * innovation, x_pred[1] + K[1] * innovation]

    // Update covariance: P = (I - K @ H) @ P_pred
    const K_H = [
      [K[0] * H_t[0], K[0] * H_t[1]],
      [K[1] * H_t[0], K[1] * H_t[1]],
    ] // 2x2

    const I_minus_KH = matrixSubtract2x2(
      [
        [1, 0],
        [0, 1],
      ],
      K_H,
    )
    P = matrixMultiply2x2(I_minus_KH, P_pred)

    // Store results
    alphas.push(x[0])
    hedgeRatios.push(x[1])

    // Debug output for last few iterations
    if (i >= n - 3) {
      console.log(`=== KALMAN UPDATE ${i + 1}/${n} ===`)
      console.log(`Price A: ${priceA.toFixed(2)}, Price B: ${priceB.toFixed(2)}`)
      console.log(`Predicted: ${predicted_y.toFixed(4)}, Actual: ${priceA.toFixed(4)}`)
      console.log(`Innovation: ${innovation.toFixed(4)}`)
      console.log(`Updated Alpha: ${x[0].toFixed(4)}, Beta: ${x[1].toFixed(4)}`)
      console.log(`Kalman Gain: [${K[0].toFixed(6)}, ${K[1].toFixed(6)}]`)
    }
  }

  console.log("=== FINAL KALMAN RESULTS ===")
  console.log(`Final Alpha: ${alphas[alphas.length - 1].toFixed(4)}`)
  console.log(`Final Beta: ${hedgeRatios[hedgeRatios.length - 1].toFixed(4)}`)
  console.log(`Total iterations: ${n - initialLookback}`)
  console.log("=====================================")

  return { hedgeRatios, alphas }
}

// Function to run Kalman analysis
const runKalmanAnalysis = (
  pricesA: { close: number; date: string }[],
  pricesB: { close: number; date: string }[],
  kalmanProcessNoise: number,
  kalmanMeasurementNoise: number,
  kalmanInitialLookback: number,
) => {
  const minLength = Math.min(pricesA.length, pricesB.length)

  if (minLength < kalmanInitialLookback) {
    console.warn(`Not enough data for Kalman filter initialization. Need ${kalmanInitialLookback}, got ${minLength}`)
    return { hedgeRatios: Array(minLength).fill(1), alphas: Array(minLength).fill(0) }
  }

  const { hedgeRatios, alphas } = kalmanFilter(
    pricesA.slice(0, minLength),
    pricesB.slice(0, minLength),
    kalmanProcessNoise,
    kalmanMeasurementNoise,
    kalmanInitialLookback,
  )

  return { hedgeRatios, alphas }
}
