# Piscina WiFi de Beniferro

Control de piscina WiFi de Beniferro

Añade soporte para monitorear tu Redox, pH, temperatura y flujo

- Página de Configuración de la App: Solo para probar/registrar inicio de sesión, encontrar el dominio del dispositivo y los módulos conectados.
- Al agregar un dispositivo, se realizarán las credenciales y el descubrimiento para el dispositivo
- Dispositivo: un "Sensor de Piscina WiFi" expone las capacidades `measure_redox`, `measure_ph`, `measure_temperature`, `alarm_flow`.
- Registro: registros extensos impresos al ejecutar `homey app run`.

## Notas
- Los puntos de acceso a la API se basan en la captura de la comunicación, la documentación oficial no está disponible
  - Importante: Cualquier cambio del lado de Beniferro no se comunica y podría romper la funcionalidad de esta app