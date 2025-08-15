# Beniferro WiFi Pool

Sterowanie basenem WiFi od Beniferro

Dodaj wsparcie dla monitorowania Redox, pH, temperatury i przepływu

- Strona ustawień aplikacji: Służy do testowania/logowania logowania, znajdowania domeny urządzenia i podłączonych modułów.
- Podczas dodawania urządzenia, podanie danych uwierzytelniających i odkrywanie zostanie dokonane dla urządzenia
- Urządzenie: jeden "Czujnik Basenowy WiFi" odsłania funkcje `measure_redox`, `measure_ph`, `measure_temperature`, `alarm_flow`.
- Logowanie: obszerne logi drukowane podczas uruchamiania `homey app run`.

## Uwagi
- Punkty końcowe API są oparte na przechwytywaniu komunikacji, oficjalna dokumentacja nie jest dostępna
  - Ważne: każda zmiana po stronie Beniferro nie jest komunikowana i może zakłócić funkcjonowanie tej aplikacji