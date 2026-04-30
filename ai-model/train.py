import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error

# Load dataset
df = pd.read_csv("Clean_Dataset.csv")

# Drop unwanted column
df = df.drop(columns=["Unnamed: 0", "flight", "arrival_time"])

# Handle missing values
df = df.dropna()

# Label Encoding (categorical → numeric)
encoders = {}

for col in ["airline", "source_city", "destination_city", "departure_time", "stops", "class"]:
    le = LabelEncoder()
    df[col] = le.fit_transform(df[col])
    encoders[col] = le

# Features & target
X = df.drop(columns=["price"])
y = df["price"]

# Train/Test split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# Model
model = RandomForestRegressor(n_estimators=120, max_depth=20)
model.fit(X_train, y_train)

# Evaluate
pred = model.predict(X_test)
mae = mean_absolute_error(y_test, pred)

print("✅ Model trained")
print("📊 MAE:", mae)

# Save model
joblib.dump(model, "model.pkl")

# Save encoders
for key, val in encoders.items():
    joblib.dump(val, f"{key}_encoder.pkl")