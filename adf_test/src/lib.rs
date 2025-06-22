use wasm_bindgen::prelude::*;

// This is where you will paste the content of your adf_p_value_lookup_dense.csv
// converted into a Rust const array.
// Ensure this data is sorted by the test_stat (first element of each inner array).
const ADF_P_VALUE_LOOKUP: &[[f64; 2]] = &[
    // Example data - REPLACE THIS WITH YOUR ACTUAL DENSE LOOKUP TABLE
    [-10.0, 0.00001],
    [-9.0, 0.00002],
    [-8.0, 0.00005],
    [-7.0, 0.0001],
    [-6.0, 0.0005],
    [-5.0, 0.001],
    [-4.0, 0.005],
    [-3.5, 0.01],
    [-3.0, 0.025],
    [-2.5, 0.05],
    [-2.0, 0.1],
    [-1.5, 0.2],
    [-1.0, 0.5],
    [0.0, 0.99],
    // ... PASTE ALL YOUR GENERATED DATA HERE ...
];

#[wasm_bindgen]
pub struct AdfResult {
    pub statistic: f64,
    pub p_value: f64,
    pub critical_values: JsValue, // Use JsValue to return a JS object/dict
    pub is_stationary: bool,
}

#[wasm_bindgen]
pub fn get_adf_p_value_and_stationarity(test_statistic: f64) -> AdfResult {
    let p_value = interpolate_p_value(test_statistic);

    // Define critical values (these are typical values for ADF, adjust if your source provides different ones)
    // For a more robust solution, these could also be part of the lookup or passed in.
    let critical_1_percent = -3.43; // Example critical value
    let critical_5_percent = -2.86; // Example critical value
    let critical_10_percent = -2.57; // Example critical value

    // Determine stationarity based on p-value and test statistic vs critical value
    // A common rule: p-value <= 0.05 AND test_statistic < critical_5_percent
    let is_stationary = p_value <= 0.05 && test_statistic < critical_5_percent;

    // Create a JavaScript object for critical values
    let critical_values_js = js_sys::Object::new();
    js_sys::Reflect::set(&critical_values_js, &JsValue::from_str("1%"), &JsValue::from_f64(critical_1_percent)).unwrap();
    js_sys::Reflect::set(&critical_values_js, &JsValue::from_str("5%"), &JsValue::from_f64(critical_5_percent)).unwrap();
    js_sys::Reflect::set(&critical_values_js, &JsValue::from_str("10%"), &JsValue::from_f64(critical_10_percent)).unwrap();

    AdfResult {
        statistic: test_statistic,
        p_value,
        critical_values: critical_values_js,
        is_stationary,
    }
}

// Linear interpolation function
fn interpolate_p_value(test_statistic: f64) -> f64 {
    if test_statistic <= ADF_P_VALUE_LOOKUP[0][0] {
        return ADF_P_VALUE_LOOKUP[0][1];
    }
    if test_statistic >= ADF_P_VALUE_LOOKUP[ADF_P_VALUE_LOOKUP.len() - 1][0] {
        return ADF_P_VALUE_LOOKUP[ADF_P_VALUE_LOOKUP.len() - 1][1];
    }

    let mut low = 0;
    let mut high = ADF_P_VALUE_LOOKUP.len() - 1;
    let mut idx = 0;

    // Find the interval using binary search
    while low <= high {
        let mid = low + (high - low) / 2;
        if ADF_P_VALUE_LOOKUP[mid][0] == test_statistic {
            return ADF_P_VALUE_LOOKUP[mid][1];
        } else if ADF_P_VALUE_LOOKUP[mid][0] < test_statistic {
            idx = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    let x1 = ADF_P_VALUE_LOOKUP[idx][0];
    let y1 = ADF_P_VALUE_LOOKUP[idx][1];
    let x2 = ADF_P_VALUE_LOOKUP[idx + 1][0];
    let y2 = ADF_P_VALUE_LOOKUP[idx + 1][1];

    // Linear interpolation formula
    y1 + (test_statistic - x1) * (y2 - y1) / (x2 - x1)
}
