use wasm_bindgen::prelude::*;
use js_sys::{self, Reflect};

#[wasm_bindgen]
pub struct AdfResult {
    pub statistic: f64,
    pub p_value: f64,
    critical_values: JsValue, // Make this field private
    pub is_stationary: bool,
}

// Add a getter method for critical_values
#[wasm_bindgen]
impl AdfResult {
    #[wasm_bindgen(getter)]
    pub fn critical_values(&self) -> JsValue {
        self.critical_values.clone() // Return a clone as JsValue is not Copy
    }
}

// Linear interpolation function, now accepting a JsValue for the lookup table
fn interpolate_p_value(test_statistic: f64, lookup_table_js: &JsValue) -> f64 {
    if !lookup_table_js.is_array() {
        return 1.0; // Default p-value if not an array
    }
    let lookup_table = js_sys::Array::from(lookup_table_js);

    if lookup_table.length() == 0 {
        return 1.0; // Default p-value if no lookup data
    }

    let first_entry = lookup_table.get(0);
    let first_entry_array = js_sys::Array::from(&first_entry);
    let first_stat = Reflect::get(&first_entry_array, &JsValue::from_f64(0.0)).unwrap().as_f64().unwrap_or(f64::NEG_INFINITY);
    let first_p_value = Reflect::get(&first_entry_array, &JsValue::from_f64(1.0)).unwrap().as_f64().unwrap_or(1.0);

    if test_statistic <= first_stat {
        return first_p_value;
    }

    let last_entry = lookup_table.get(lookup_table.length() - 1);
    let last_entry_array = js_sys::Array::from(&last_entry);
    let last_stat = Reflect::get(&last_entry_array, &JsValue::from_f64(0.0)).unwrap().as_f64().unwrap_or(f64::INFINITY);
    let last_p_value = Reflect::get(&last_entry_array, &JsValue::from_f64(1.0)).unwrap().as_f64().unwrap_or(0.0);

    if test_statistic >= last_stat {
        return last_p_value;
    }

    let mut low = 0;
    let mut high = lookup_table.length() - 1;
    let mut idx = 0;

    // Find the interval using binary search
    while low <= high {
        let mid = low + (high - low) / 2;
        let mid_entry = lookup_table.get(mid);
        let mid_entry_array = js_sys::Array::from(&mid_entry);
        let mid_stat = Reflect::get(&mid_entry_array, &JsValue::from_f64(0.0)).unwrap().as_f64().unwrap();

        if mid_stat == test_statistic {
            return Reflect::get(&mid_entry_array, &JsValue::from_f64(1.0)).unwrap().as_f64().unwrap();
        } else if mid_stat < test_statistic {
            idx = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    let x1_entry = lookup_table.get(idx);
    let x1_array = js_sys::Array::from(&x1_entry);
    let x1 = Reflect::get(&x1_array, &JsValue::from_f64(0.0)).unwrap().as_f64().unwrap();
    let y1 = Reflect::get(&x1_array, &JsValue::from_f64(1.0)).unwrap().as_f64().unwrap();

    let x2_entry = lookup_table.get(idx + 1);
    let x2_array = js_sys::Array::from(&x2_entry);
    let x2 = Reflect::get(&x2_array, &JsValue::from_f64(0.0)).unwrap().as_f64().unwrap();
    let y2 = Reflect::get(&x2_array, &JsValue::from_f64(1.0)).unwrap().as_f64().unwrap();

    // Linear interpolation formula
    y1 + (test_statistic - x1) * (y2 - y1) / (x2 - x1)
}

#[wasm_bindgen]
pub fn get_adf_p_value_and_stationarity(test_statistic: f64, sample_size: usize, critical_values_js: JsValue, p_value_tables_js: JsValue) -> AdfResult {
    let critical_values_map = js_sys::Object::from(critical_values_js);
    let p_value_tables_map = js_sys::Object::from(p_value_tables_js);

    let keys = Reflect::own_keys(&critical_values_map).unwrap();

    let mut closest_n = 0;
    let mut min_diff = usize::MAX;

    // Find the closest sample size in the lookup data (using critical values map for keys)
    for i in 0..keys.length() {
        let key_js = keys.get(i);
        if let Some(key_str) = key_js.as_string() {
            if let Ok(n_val) = key_str.parse::<usize>() {
                let diff = (sample_size as isize - n_val as isize).abs() as usize;
                if diff < min_diff {
                    min_diff = diff;
                    closest_n = n_val;
                }
            }
        }
    }

    let sample_size_critical_data_js = if closest_n > 0 {
        Reflect::get(&critical_values_map, &JsValue::from_str(&closest_n.to_string())).unwrap_or_else(|_| JsValue::NULL)
    } else {
        JsValue::NULL
    };

    let sample_size_critical_data_obj = js_sys::Object::from(sample_size_critical_data_js);

    // Extract critical values from the critical values map
    let critical_1_percent = Reflect::get(&sample_size_critical_data_obj, &JsValue::from_str("1%")).unwrap().as_f64().unwrap_or(-3.43);
    let critical_5_percent = Reflect::get(&sample_size_critical_data_obj, &JsValue::from_str("5%")).unwrap().as_f64().unwrap_or(-2.86);
    let critical_10_percent = Reflect::get(&sample_size_critical_data_obj, &JsValue::from_str("10%")).unwrap().as_f64().unwrap_or(-2.57);

    // Extract p_values lookup table for interpolation from the p_value tables map
    let p_values_lookup_js = if closest_n > 0 {
        Reflect::get(&p_value_tables_map, &JsValue::from_str(&closest_n.to_string())).unwrap_or_else(|_| JsValue::NULL)
    } else {
        JsValue::NULL
    };
    
    let p_value = interpolate_p_value(test_statistic, &p_values_lookup_js);

    // Determine stationarity based on p-value and test statistic vs critical value
    // A common rule: p-value <= 0.05 AND test_statistic < critical_5_percent
    let is_stationary = p_value <= 0.05 && test_statistic < critical_5_percent;

    // Create a JavaScript object for critical values to return
    let critical_values_js_output = js_sys::Object::new();
    Reflect::set(&critical_values_js_output, &JsValue::from_str("1%"), &JsValue::from_f64(critical_1_percent)).unwrap();
    Reflect::set(&critical_values_js_output, &JsValue::from_str("5%"), &JsValue::from_f64(critical_5_percent)).unwrap();
    Reflect::set(&critical_values_js_output, &JsValue::from_str("10%"), &JsValue::from_f64(critical_10_percent)).unwrap();

    AdfResult {
        statistic: test_statistic,
        p_value,
        critical_values: critical_values_js_output.into(),
        is_stationary,
    }
}
