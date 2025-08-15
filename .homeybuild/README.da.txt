# Beniferro WiFi Pool

WiFi Pool Control fra Beniferro

Tilføj support til overvågning af din Redox, pH, temperatur og flow

- App Indstillinger side: Bare for at teste/logge login, finde enhedens domæne og tilsluttede moduler.
- Når enheder tilføjes, udføres legitimationsoplysninger og opdagelse for enheden
- Enhed: en "WiFi Pool Sensor" som afslører kapaciteterne `measure_redox`, `measure_ph`, `measure_temperature`, `alarm_flow`.
- Logning: omfattende logfiler udskrives, når `homey app run` kører.

## Noter
- API-endepunkter er baseret på at fange kommunikationen, officiel dokumentation er ikke tilgængelig
  - Vigtigt: Enhver ændring fra Beniferros side kommunikeres ikke og kan bryde funktionaliteten af denne app