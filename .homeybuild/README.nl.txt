# Beniferro WiFi Pool

WiFi Pool Besturing van Beniferro

Voeg ondersteuning toe voor het monitoren van je Redox, pH, temperatuur en stroming

- App Instellingen pagina: Alleen om inloggen te testen/loggen, het apparaatsdomein en verbonden modules te vinden.
- Bij het toevoegen van een apparaat worden de inloggegevens en de ontdekking voor het apparaat gedaan.
- Apparaat: één "WiFi Pool Sensor" biedt mogelijkheden `measure_redox`, `measure_ph`, `measure_temperature`, `alarm_flow`.
- Logging: uitgebreide logs worden afgedrukt bij het uitvoeren van `homey app run`.

## Opmerkingen
- API-eindpunten zijn gebaseerd op het vastleggen van de communicatie, er is geen officiële documentatie beschikbaar
  - Belangrijk: Elke wijziging aan de kant van Beniferro wordt niet gecommuniceerd en kan de functionaliteit van deze app breken.