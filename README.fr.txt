# Beniferro WiFi Pool

Contrôle de piscine WiFi de Beniferro 

Ajoutez la prise en charge de la surveillance de votre Redox, pH, température et débit

- Page des paramètres de l'application : Juste pour tester/enregistrer la connexion, trouver le domaine de l'appareil et les modules connectés.
- Lors de l'ajout de l'appareil, les identifiants et la découverte seront effectués pour l'appareil
- Appareil : un "Capteur de piscine WiFi" expose les capacités `measure_redox`, `measure_ph`, `measure_temperature`, `alarm_flow`.
- Journalisation: journaux détaillés imprimés lors de l'exécution de `homey app run`.

## Remarques
- Les points de terminaison de l'API sont basés sur la capture de la communication, la documentation officielle n'est pas disponible
  - Important : Tout changement du côté de Beniferro n'est pas communiqué et pourrait interrompre le fonctionnement de cette application