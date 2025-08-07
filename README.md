# 🌊 WiFi Pool Sensor for Homey

This repository contains a Homey app for reading data from WiFi Pool compatible dosing systems. The app logs in to the WiFi Pool API and exposes pH, flow and redox values as Homey capabilities.

## 🚀 Features
- Secure login to the WiFi Pool API.
- Periodic retrieval of sensor data.
- Homey capabilities for **pH**, **flow** and **redox**.

## 🛠 Installation
1. Navigate to the `homey-app` folder.
2. Install dependencies (none required by default).
3. Use the [Homey CLI](https://apps.developer.homey.app/the-basics/getting-started) to run or install the app on your Homey.

## 📚 Development Notes
- API helpers live in `lib/wifipool.js`.
- The WiFi Pool driver and device are located in `drivers/wifipool`.

## 📄 License
This project is licensed under the MIT License.
