import json
import pandas as pd
from statsmodels.tsa.stattools import adfuller
import numpy as np

def handler(request, response):
    """
    Vercel Serverless Function to perform Augmented Dickey-Fuller (ADF) test.
    Expects a JSON body with a 'series' key containing a list of numbers.
    """
    try:
        # Parse the request body
        request_body = json.loads(request.body)
        data_list = request_body.get('series')

        if not isinstance(data_list, list):
            response.statusCode = 400
            response.send(json.dumps({"error": "Invalid request body. 'series' must be a list."}))
            return

        # Convert list to pandas Series and drop NaNs
        data_series = pd.Series(data_list)
        clean_series = data_series.dropna()

        if clean_series.empty:
            response.statusCode = 400
            response.send(json.dumps({"error": "No valid data provided after dropping NaN values."}))
            return
        if len(clean_series) < 5: # adfuller typically needs at least 5 observations
            response.statusCode = 400
            response.send(json.dumps({"error": f"Not enough observations ({len(clean_series)}) for ADF test. Minimum required is 5."}))
            return

        # Perform the ADF test
        # autolag='AIC': Automatically selects the optimal number of lags based on AIC.
        # regression='c': Includes a constant (intercept) in the test regression.
        adf_result = adfuller(clean_series, autolag='AIC', regression='c')

        # Extract results
        t_statistic = adf_result[0]
        p_value = adf_result[1]
        critical_values = adf_result[4] # Dictionary of critical values

        response.statusCode = 200
        response.send(json.dumps({
            "p_value": p_value,
            "t_statistic": t_statistic,
            "critical_values": critical_values,
            "isStationary": p_value < 0.05 # Common significance level
        }))
    except json.JSONDecodeError:
        response.statusCode = 400
        response.send(json.dumps({"error": "Invalid JSON in request body."}))
    except Exception as e:
        print(f"Error during ADF test: {e}")
        response.statusCode = 500
        response.send(json.dumps({"error": f"An internal server error occurred: {str(e)}"}))

# This is a simplified handler for Vercel's Python runtime.
# In a real Vercel deployment, the `handler` function is automatically
# invoked by the Vercel build system.
