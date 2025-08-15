# Beniferro WiFi Pool

Controllo della Piscina WiFi di Beniferro 

Aggiungi supporto per monitorare il tuo Redox, pH, temperatura e flusso

- Pagina delle impostazioni dell'app: Solo per testare/registrare l'accesso, trovare il dominio del dispositivo e i moduli collegati.
- Quando aggiungi un dispositivo, le credenziali e la scoperta saranno eseguite per il dispositivo
- Dispositivo: un "WiFi Pool Sensor" espone le capacità `measure_redox`, `measure_ph`, `measure_temperature`, `alarm_flow`.
- Registri: registri estesi stampati quando si esegue `homey app run`.

## Note
- Gli endpoint API si basano sulla cattura della comunicazione, la documentazione ufficiale non è disponibile
  - Importante: Qualsiasi cambiamento da parte di Beniferro non viene comunicato e potrebbe interrompere la funzionalità di questa app