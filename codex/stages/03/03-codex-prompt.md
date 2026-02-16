Implementá Stage 03.

Requisitos:
- Conectar wrapper del motor a la UI.
- Render:
  - cp => +0.12 (value/100)
  - mate => M#3 (signo según lado)
- Barra:
  - clamp cp a +/- 600
- Estados:
  - idle / analyzing / error
- Cancelación/obsolescencia:
  - descartar resultados viejos.
