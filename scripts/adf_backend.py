from flask import Flask, request, jsonify
from statsmodels.tsa.stattools import adfuller
import numpy as np
import pandas as pd
from flask_cors import CORS # Import CORS

app = Flask(__name__)
CORS(app) # Enable CORS for all routes

@app.route('/api/adf-test', methods=['POST'])
def adf_test_endpoint():
    """
    API endpoint to perform the Augmented Dickey-Fuller (ADF) test.
    Expects a JSON payload with a 'time_series' key containing a list of numbers.
    """
    data = request.get_json()
    if not data or 'time_series' not in data:
        return jsonify({"error": "Missing 'time_series' in request body"}), 400

    time_series_list = data['time_series']
    if not isinstance(time_series_list, list):
        return jsonify({"error": "'time_series' must be a list"}), 400

    # Convert list to pandas Series and drop NaNs
    clean_series = pd.Series(time_series_list).dropna()

    if clean_series.empty:
        return jsonify({"error": "Input time series is empty after dropping NaN values."}), 400
    if len(clean_series) < 5:
        return jsonify({"error": f"Not enough observations ({len(clean_series)}) for ADF test. Minimum required is 5."}), 400

    try:
        # Perform the ADF test
        adf_result = adfuller(clean_series, autolag='AIC', regression='c')

        # Extract results
        test_statistic = adf_result[0]
        p_value = adf_result[1]
        critical_values = adf_result[4] # Dictionary of critical values

        # Determine stationarity based on p-value
        is_stationary = p_value < 0.05 # Common significance level

        return jsonify({
            "statistic": test_statistic,
            "p_value": p_value,
            "critical_values": critical_values,
            "is_stationary": is_stationary
        }), 200
    except Exception as e:
        return jsonify({"error": f"An error occurred during ADF test calculation: {str(e)}"}), 500

if __name__ == '__main__':
    # To run this Flask app:
    # 1. Make sure you have Flask, pandas, numpy, statsmodels, and flask_cors installed:
    #    pip install Flask pandas numpy statsmodels flask_cors
    # 2. Run this script: python scripts/adf_backend.py
    # The server will run on http://127.0.0.1:5000 by default.
    app.run(debug=True, port=5000)
