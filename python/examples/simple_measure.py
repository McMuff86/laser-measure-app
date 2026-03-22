#!/usr/bin/env python3
"""
Simple measurement example for Bosch GLM laser distance meters.

This example demonstrates basic usage:
1. Scan for GLM devices
2. Connect to the first device found
3. Enable measurement notifications
4. Wait for user to press device button
5. Print measurement result

Usage:
    python simple_measure.py
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path to import laser_measure
sys.path.insert(0, str(Path(__file__).parent.parent))

from laser_measure import GLMScanner, GLMClient, MeasurementCollector


async def simple_measurement_demo():
    """Demonstrate basic measurement functionality"""
    print("Bosch GLM Simple Measurement Demo")
    print("=" * 40)
    
    # Step 1: Scan for devices
    print("1. Scanning for GLM devices...")
    devices = await GLMScanner.scan(timeout=5.0)
    
    if not devices:
        print("❌ No GLM devices found")
        print("\nTroubleshooting:")
        print("- Ensure your GLM device is powered on")
        print("- Check that Bluetooth is enabled")
        print("- Try moving closer to the device")
        return
    
    print(f"✅ Found {len(devices)} device(s)")
    
    # Use the first device found
    device = devices[0]
    print(f"📱 Using device: {device.name} ({device.address})")
    
    # Step 2: Connect to device
    print("\n2. Connecting to device...")
    client = GLMClient(device)
    
    if not await client.connect():
        print("❌ Failed to connect to device")
        return
    
    print("✅ Connected successfully")
    
    try:
        # Step 3: Set up measurement collection
        print("\n3. Setting up measurement notifications...")
        collector = MeasurementCollector()
        client.set_measurement_callback(collector.measurement_callback)
        
        # Enable notifications and send SYNC command
        if not await client.enable_notifications():
            print("❌ Failed to enable notifications")
            return
        
        print("✅ Notifications enabled")
        
        # Step 4: Wait for measurements
        print("\n4. Ready for measurements!")
        print("📏 Press the button on your GLM device to take a measurement")
        print("⏱️  Waiting up to 30 seconds...")
        print("🔄 Press Ctrl+C to stop")
        
        measurement_count = 0
        
        while True:
            try:
                # Wait for a measurement
                result = await collector.wait_for_measurement(timeout=30.0)
                
                if result:
                    measurement_count += 1
                    print(f"\n📐 Measurement {measurement_count}:")
                    print(f"   Distance: {result.distance_mm:.1f} mm")
                    print(f"   Distance: {result.distance_m:.3f} m")
                    print(f"   Protocol: {result.protocol}")
                    print("   Press device button again for another measurement...")
                else:
                    print("\n⏰ Timeout - no measurement received within 30 seconds")
                    print("   Press device button to take a measurement")
                    
            except KeyboardInterrupt:
                print("\n\n🛑 Stopping measurement demo...")
                break
        
        print(f"\n📊 Session Summary:")
        print(f"   Total measurements: {measurement_count}")
        
        if measurement_count > 0:
            all_measurements = collector.measurements
            distances = [m.distance_mm for m in all_measurements]
            print(f"   Average distance: {sum(distances) / len(distances):.1f} mm")
            print(f"   Min distance: {min(distances):.1f} mm")
            print(f"   Max distance: {max(distances):.1f} mm")
    
    finally:
        # Step 5: Clean disconnect
        print("\n5. Disconnecting from device...")
        await client.disconnect()
        print("✅ Disconnected")
    
    print("\nDemo complete! 🎉")


async def device_info_demo():
    """Demonstrate device discovery and information display"""
    print("Device Discovery Demo")
    print("=" * 30)
    
    print("Scanning for all BLE devices...")
    devices = await GLMScanner.scan(timeout=5.0, compatible_only=False)
    
    print(f"\nFound {len(devices)} device(s):")
    for i, device in enumerate(devices, 1):
        print(f"{i:2d}. {device.name or 'Unknown'}")
        print(f"     Address: {device.address}")
        print(f"     RSSI: {device.rssi} dBm")
        print()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Simple GLM measurement demo")
    parser.add_argument("--scan-only", action="store_true", 
                       help="Only scan for devices, don't measure")
    args = parser.parse_args()
    
    try:
        if args.scan_only:
            asyncio.run(device_info_demo())
        else:
            asyncio.run(simple_measurement_demo())
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)