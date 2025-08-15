# Beniferro WiFi Pool

WiFi-bassengkontroll fra Beniferro

Legg til støtte for overvåking av Redox, pH, temperatur og flyt

- Appinnstillingssiden: Bare for å teste/logge innlogging, finne enhetens domene og tilkoblede moduler.
- Når du legger til en enhet, vil legitimasjon og søk bli gjort for enheten
- Enhet: en "WiFi Pool Sensor" eksponerer funksjonene `measure_redox`, `measure_ph`, `measure_temperature`, `alarm_flow`.
- Logging: omfattende logger skrives ut når du kjører `homey app run`.

## Notater
- API-endepunkter er basert på å fange opp kommunikasjonen, offisiell dokumentasjon er ikke tilgjengelig
  - Viktig: Eventuelle endringer fra Beniferros side er ikke kommunisert og kan ødelegge funksjonaliteten til denne appen