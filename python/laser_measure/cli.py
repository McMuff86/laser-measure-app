"""
Command-line interface for Bosch GLM laser distance meters.

Provides subcommands for device discovery, connection, measurement, 
recording workflows, and data export.
"""

import asyncio
import sys
from pathlib import Path
from typing import List, Optional

import click

from .ble import GLMScanner, GLMClient, MeasurementCollector, GLMDevice
from .protocol import MeasurementResult, format_hex
from .export import export_measurements, get_default_filename


@click.group()
@click.option('--debug', is_flag=True, help='Enable debug logging')
@click.pass_context
def cli(ctx, debug):
    """Bosch GLM laser distance meter CLI tool"""
    import logging
    
    level = logging.DEBUG if debug else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(levelname)s: %(message)s'
    )
    
    ctx.ensure_object(dict)
    ctx.obj['debug'] = debug


@cli.command()
@click.option('--timeout', '-t', default=5.0, help='Scan timeout in seconds')
@click.option('--all-devices', '-a', is_flag=True, help='Show all BLE devices, not just GLM')
def scan(timeout, all_devices):
    """Scan for Bosch GLM devices"""
    async def do_scan():
        devices = await GLMScanner.scan(timeout=timeout, compatible_only=not all_devices)
        
        if not devices:
            click.echo("No GLM devices found")
            return
        
        click.echo(f"\nFound {len(devices)} device(s):\n")
        for i, device in enumerate(devices, 1):
            click.echo(f"{i}. {device.name}")
            click.echo(f"   Address: {device.address}")
            click.echo(f"   RSSI: {device.rssi} dBm")
            click.echo()
    
    asyncio.run(do_scan())


@cli.command()
@click.option('--timeout', '-t', default=30.0, help='Measurement timeout in seconds')
@click.option('--device-timeout', '-d', default=10.0, help='Device connection timeout')
def connect(timeout, device_timeout):
    """Connect and show live measurements (press device button to measure)"""
    async def do_connect():
        click.echo("Scanning for GLM devices...")
        device = await GLMScanner.scan_for_first(timeout=device_timeout)
        
        if not device:
            click.echo("No GLM devices found")
            return
        
        click.echo(f"Connecting to {device.name} ({device.address})...")
        
        client = GLMClient(device)
        if not await client.connect():
            click.echo("Failed to connect")
            return
        
        try:
            collector = MeasurementCollector()
            client.set_measurement_callback(collector.measurement_callback)
            
            # Enable notifications and send sync command
            if not await client.enable_notifications():
                click.echo("Failed to enable notifications")
                return
            
            click.echo(f"\nConnected to {device.name}")
            click.echo("Press the device button to take measurements")
            click.echo("Press Ctrl+C to stop\n")
            
            measurement_count = 0
            
            while True:
                try:
                    result = await collector.wait_for_measurement(timeout=timeout)
                    if result:
                        measurement_count += 1
                        click.echo(f"Measurement {measurement_count}: {result.distance_mm:.1f} mm ({result.distance_m:.3f} m)")
                    else:
                        click.echo(f"No measurement received within {timeout} seconds")
                        break
                        
                except KeyboardInterrupt:
                    break
            
            click.echo(f"\nTotal measurements: {measurement_count}")
            
        finally:
            await client.disconnect()
    
    asyncio.run(do_connect())


@cli.command()
@click.option('--count', '-n', default=1, help='Number of measurements to take')
@click.option('--timeout', '-t', default=30.0, help='Timeout per measurement in seconds')
@click.option('--device-timeout', '-d', default=10.0, help='Device connection timeout')
@click.option('--output', '-o', help='Output file to save measurements')
@click.option('--format', '-f', type=click.Choice(['csv', 'json', 'excel']), default='csv',
              help='Output format')
def measure(count, timeout, device_timeout, output, format):
    """Take N measurements and print results"""
    async def do_measure():
        click.echo("Scanning for GLM devices...")
        device = await GLMScanner.scan_for_first(timeout=device_timeout)
        
        if not device:
            click.echo("No GLM devices found")
            return
        
        click.echo(f"Connecting to {device.name} ({device.address})...")
        
        client = GLMClient(device)
        if not await client.connect():
            click.echo("Failed to connect")
            return
        
        try:
            collector = MeasurementCollector()
            client.set_measurement_callback(collector.measurement_callback)
            
            # Enable notifications
            if not await client.enable_notifications():
                click.echo("Failed to enable notifications")
                return
            
            click.echo(f"\nTaking {count} measurement(s)")
            click.echo("Press the device button for each measurement\n")
            
            measurements = []
            
            for i in range(count):
                click.echo(f"Waiting for measurement {i+1}/{count}...")
                
                result = await collector.wait_for_measurement(timeout=timeout)
                if result:
                    measurements.append(result)
                    click.echo(f"✓ {result.distance_mm:.1f} mm ({result.distance_m:.3f} m)")
                else:
                    click.echo(f"✗ Timeout waiting for measurement {i+1}")
                    break
            
            if measurements:
                click.echo(f"\nResults ({len(measurements)} measurements):")
                for i, m in enumerate(measurements, 1):
                    click.echo(f"{i}. {m.distance_mm:.1f} mm ({m.distance_m:.3f} m)")
                
                # Save to file if requested
                if output:
                    if export_measurements(measurements, output, format):
                        click.echo(f"\nMeasurements saved to {output}")
                    else:
                        click.echo(f"\nFailed to save measurements to {output}")
            else:
                click.echo("\nNo measurements collected")
            
        finally:
            await client.disconnect()
    
    asyncio.run(do_measure())


@cli.command()
@click.option('--timeout', '-t', default=30.0, help='Timeout per measurement in seconds')
@click.option('--device-timeout', '-d', default=10.0, help='Device connection timeout')
@click.option('--output', '-o', help='Output file (default: doors_TIMESTAMP.csv)')
@click.option('--format', '-f', type=click.Choice(['csv', 'json', 'excel']), default='csv',
              help='Output format')
def record(timeout, device_timeout, output, format):
    """Interactive door workflow: Breite, Höhe, Wandstärke per door"""
    async def do_record():
        click.echo("Scanning for GLM devices...")
        device = await GLMScanner.scan_for_first(timeout=device_timeout)
        
        if not device:
            click.echo("No GLM devices found")
            return
        
        click.echo(f"Connecting to {device.name} ({device.address})...")
        
        client = GLMClient(device)
        if not await client.connect():
            click.echo("Failed to connect")
            return
        
        try:
            collector = MeasurementCollector()
            client.set_measurement_callback(collector.measurement_callback)
            
            # Enable notifications
            if not await client.enable_notifications():
                click.echo("Failed to enable notifications")
                return
            
            click.echo(f"\nDoor Recording Workflow")
            click.echo("For each door, measure: Breite → Höhe → Wandstärke")
            click.echo("Press device button for each measurement")
            click.echo("Press Ctrl+C when done\n")
            
            all_measurements = []
            door_number = 1
            
            while True:
                try:
                    click.echo(f"=== Door {door_number} ===")
                    door_measurements = []
                    
                    # Breite (Width)
                    click.echo("1. Measure Breite (width) and press device button...")
                    result = await collector.wait_for_measurement(timeout=timeout)
                    if result:
                        door_measurements.append(result)
                        all_measurements.append(result)
                        click.echo(f"✓ Breite: {result.distance_mm:.1f} mm")
                    else:
                        click.echo("✗ Timeout - skipping to next door")
                        continue
                    
                    # Höhe (Height)
                    click.echo("2. Measure Höhe (height) and press device button...")
                    result = await collector.wait_for_measurement(timeout=timeout)
                    if result:
                        door_measurements.append(result)
                        all_measurements.append(result)
                        click.echo(f"✓ Höhe: {result.distance_mm:.1f} mm")
                    else:
                        click.echo("✗ Timeout - skipping to next door")
                        continue
                    
                    # Wandstärke (Wall thickness)
                    click.echo("3. Measure Wandstärke (wall thickness) and press device button...")
                    result = await collector.wait_for_measurement(timeout=timeout)
                    if result:
                        door_measurements.append(result)
                        all_measurements.append(result)
                        click.echo(f"✓ Wandstärke: {result.distance_mm:.1f} mm")
                    else:
                        click.echo("✗ Timeout - skipping to next door")
                        continue
                    
                    # Summary for this door
                    breite, hoehe, wandstaerke = door_measurements
                    click.echo(f"\nDoor {door_number} Summary:")
                    click.echo(f"  Breite:      {breite.distance_mm:.1f} mm")
                    click.echo(f"  Höhe:        {hoehe.distance_mm:.1f} mm")
                    click.echo(f"  Wandstärke:  {wandstaerke.distance_mm:.1f} mm")
                    click.echo()
                    
                    door_number += 1
                    
                except KeyboardInterrupt:
                    break
            
            total_doors = (len(all_measurements) // 3)
            click.echo(f"\nRecording complete - {total_doors} door(s) recorded")
            
            if all_measurements:
                # Generate output filename if not provided
                if not output:
                    output = get_default_filename(format, door_format=True)
                
                # Export with door format
                if export_measurements(all_measurements, output, format, door_format=True):
                    click.echo(f"Door data saved to {output}")
                else:
                    click.echo(f"Failed to save door data to {output}")
            
        finally:
            await client.disconnect()
    
    asyncio.run(do_record())


@cli.command()
@click.argument('input_file', type=click.Path(exists=True))
@click.argument('output_file')
@click.option('--format', '-f', type=click.Choice(['csv', 'json', 'excel']), 
              help='Output format (auto-detected from extension if not specified)')
@click.option('--door-format', is_flag=True, help='Use door-specific formatting')
def export(input_file, output_file, format, door_format):
    """Export measurements from one format to another"""
    # This is a placeholder - would need to implement reading from files
    # For now, just show the command structure
    click.echo("Export command not yet implemented")
    click.echo(f"Would convert {input_file} to {output_file}")
    if format:
        click.echo(f"Format: {format}")
    if door_format:
        click.echo("Using door format")


def main():
    """Entry point for the CLI"""
    try:
        cli()
    except KeyboardInterrupt:
        click.echo("\nOperation cancelled")
        sys.exit(1)
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


if __name__ == '__main__':
    main()