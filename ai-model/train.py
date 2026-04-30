import pandas as pd
import joblib

from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.neural_network import MLPRegressor

# Load dataset
df = pd.read_csv("Clean_Dataset.csv")

# Clean
df = df.drop(columns=["Unnamed: 0", "flight", "arrival_time"])
df = df.dropna()

# Feature engineering
df["urgency"] = 1 / (df["days_left"] + 1)

# 🔥 Demand target
df["demand_score"] = (
    (df["duration"] < 3).astype(int) * 0.3 +
    (df["days_left"] < 10).astype(int) * 0.4 +
    (df["class"] == "Economy").astype(int) * 0.3
)

# Encode categorical
encoders = {}
categorical_cols = [
    "airline", "source_city", "destination_city",
    "departure_time", "stops", "class"
]

for col in categorical_cols:
    le = LabelEncoder()
    df[col] = le.fit_transform(df[col])
    encoders[col] = le

# Features
X = df.drop(columns=["price", "demand_score"])
y_price = df["price"]
y_demand = df["demand_score"]

# Split
X_train, X_test, y_price_train, y_price_test = train_test_split(
    X, y_price, test_size=0.2, random_state=42
)

_, _, y_demand_train, y_demand_test = train_test_split(
    X, y_demand, test_size=0.2, random_state=42
)

# 🔥 SCALE FEATURES (IMPORTANT FOR NN)
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# =========================
# 🔹 MODEL 1: Gradient Boosting
# =========================
param_grid = {
    "n_estimators": [100, 200],
    "learning_rate": [0.05, 0.1],
    "max_depth": [3, 5]
}

grid = GridSearchCV(
    GradientBoostingRegressor(),
    param_grid,
    cv=3,
    scoring="neg_mean_absolute_error"
)

grid.fit(X_train, y_price_train)
gbr_model = grid.best_estimator_

# =========================
# 🔹 MODEL 2: Neural Network
# =========================
mlp_model = MLPRegressor(
    hidden_layer_sizes=(128, 64),
    activation='relu',
    max_iter=300,
    random_state=42
)

mlp_model.fit(X_train_scaled, y_price_train)

# =========================
# 🔥 MODEL COMPARISON
# =========================
gbr_pred = gbr_model.predict(X_test)
mlp_pred = mlp_model.predict(X_test_scaled)

gbr_mae = mean_absolute_error(y_price_test, gbr_pred)
mlp_mae = mean_absolute_error(y_price_test, mlp_pred)

print("GBR MAE:", gbr_mae)
print("MLP MAE:", mlp_mae)

# Choose best model
if mlp_mae < gbr_mae:
    print("✅ Using Neural Network Model")
    price_model = mlp_model
    use_scaler = True
else:
    print("✅ Using Gradient Boosting Model")
    price_model = gbr_model
    use_scaler = False

# =========================
# 🔹 DEMAND MODEL
# =========================
demand_model = GradientBoostingRegressor(
    n_estimators=150,
    learning_rate=0.1,
    max_depth=4,
    random_state=42
)

demand_model.fit(X_train, y_demand_train)

# =========================
# 🔥 FINAL EVALUATION
# =========================
final_pred = (
    price_model.predict(X_test_scaled)
    if use_scaler else price_model.predict(X_test)
)

print("Final MAE:", mean_absolute_error(y_price_test, final_pred))
print("Final R2:", r2_score(y_price_test, final_pred))

# =========================
# SAVE EVERYTHING
# =========================
joblib.dump(price_model, "price_model.pkl")
joblib.dump(demand_model, "demand_model.pkl")
joblib.dump(scaler, "scaler.pkl")
joblib.dump(use_scaler, "use_scaler.pkl")

for key, val in encoders.items():
    joblib.dump(val, f"{key}_encoder.pkl")

print("🚀 Models + scaler saved successfully")