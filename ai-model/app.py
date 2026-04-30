from flask import Flask, request, jsonify
import joblib

app = Flask(__name__)

# Load model
model = joblib.load("model.pkl")

# Load encoders
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
    data = request.json

    try:
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

        price = model.predict(features)[0]

        return jsonify({
            "predicted_price": int(price)
        })

    except Exception as e:
        return jsonify({"error": str(e)})

if __name__ == "__main__":
    app.run(port=8000)