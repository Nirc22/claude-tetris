---
name: temperatura
description: Toma la temperatura local del equipo (CPU/zonas térmicas) en Windows y la reporta en °C con carga de CPU. Úsalo cuando el usuario pida "tomar la temperatura", ver qué tan caliente está la PC, o revisar la temperatura del procesador.
---

# Temperatura local

Lee la temperatura del hardware de esta máquina (Windows, PowerShell). No usa red.

## Pasos

1. Ejecuta con la herramienta PowerShell:

```powershell
try {
  Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop |
    Select-Object InstanceName, @{n='Celsius';e={[math]::Round($_.CurrentTemperature/10-273.15,1)}}
} catch { "ERR: $($_.Exception.Message)" }
Get-CimInstance Win32_Processor | Select-Object Name, LoadPercentage
```

2. Si devuelve temperaturas: repórtalas en °C, junto con el nombre del CPU y su carga (%).
3. Si devuelve `Acceso denegado`: la lectura WMI exige permisos de administrador. No reintentes igual. Informa al usuario y ofrece, por orden:
   - Abrir PowerShell como administrador y ejecutar el mismo comando (puede pegarlo con el prefijo `!` si ya tiene sesión elevada).
   - Usar una herramienta como HWiNFO o LibreHardwareMonitor, que leen sensores reales por núcleo (WMI da solo la zona térmica ACPI, a veces imprecisa).
4. Si el valor sale absurdo (ej. 0 °C o >100 °C constantes), avisa que el sensor ACPI no es fiable en ese equipo.

## Interpretación rápida

- < 60 °C: normal en reposo.
- 60–85 °C: carga alta, aceptable.
- > 90 °C: caliente; sugerir revisar ventilación o cerrar procesos.

## Salida

Respuesta corta en español: temperatura(s), carga de CPU y una línea de veredicto.
