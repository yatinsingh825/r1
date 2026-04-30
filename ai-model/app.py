from flask import Flask, request, jsonify
import joblib

app = Flask(__name__)

# 🔥 Load models
price_model = joblib.load("price_model.pkl")
demand_model = joblib.load("demand_model.pkl")

# 🔥 Load scaler + flag
scaler = joblib.load("scaler.pkl")
use_scaler = joblib.load("use_scaler.pkl")

# 🔥 Load encoders
encoders = {
    "airline": joblib.load("airline_encoder.pkl"),
    "source_city": joblib.load("source_city_encoder.pkl"),
    "destination_city": joblib.load("destination_city_encoder.pkl"),
    "departure_time": joblib.load("departure_time_encoder.pkl"),
    "stops": joblib.load("stops_encoder.pkl"),
    "class": joblib.load("class_encoder.pkl")
}

@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.json

        # 🔥 Encode features
        features = [[
            encoders["airline"].transform([data["airline"]])[0],
            encoders["source_city"].transform([data["source_city"]])[0],
            encoders["destination_city"].transform([data["destination_city"]])[0],
            encoders["departure_time"].transform([data["departure_time"]])[0],
            encoders["stops"].transform([data["stops"]])[0],
            encoders["class"].transform([data["class"]])[0],
            data["duration"],
            data["days_left"]
        ]]

        # 🔥 Apply scaling ONLY if needed
        if use_scaler:
            features = scaler.transform(features)

        # 🔥 Predict
        base_price = price_model.predict(features)[0]
        demand_score = demand_model.predict(features if not use_scaler else scaler.inverse_transform(features))[0]

        return jsonify({
            "base_price": int(base_price),
            "demand_score": float(demand_score)
        })

    except Exception as e:
        return jsonify({"error": str(e)})

# 🔥 Start server
if __name__ == "__main__":
    print("🚀 AI Model Server running on http://localhost:8000")
    app.run(host="0.0.0.0", port=8000, debug=True)