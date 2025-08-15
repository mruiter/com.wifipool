# Beniferro WiFi Pool

WiFi Pool-kontroll från Beniferro

Lägg till stöd för att övervaka din Redox, pH, temperatur och flöde

- Apps inställningssida: Endast för att testa/logga inloggning, hitta enhetens domän och anslutna moduler.
- När enheten läggs till görs inloggningsuppgifter och upptäckt för enheten.
- Enhet: en "WiFi Pool Sensor" exponerar funktionerna `measure_redox`, `measure_ph`, `measure_temperature`, `alarm_flow`.
- Loggning: omfattande loggar skrivs ut när du kör `homey app run`.

## Anmärkningar
- API-slutpunkterna baseras på att fånga kommunikationen, officiell dokumentation är inte tillgänglig
  - Viktigt: Alla ändringar från Beniferros sida kommuniceras inte och kan bryta appens funktionalitet