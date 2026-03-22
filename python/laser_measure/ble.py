"""
Bluetooth Low Energy interface for Bosch GLM laser distance meters.

This module provides async BLE connectivity using the bleak library.
Handles device discovery, connection, command sending, and measurement notifications.
"""

import asyncio
import logging
from typing import Optional, List, Callable, Any
from dataclasses import dataclass
from datetime import datetime

from bleak import BleakClient, BleakScanner
from bleak.backends.device import BLEDevice

from .protocol import (
    BLE_SERVICE_UUID,
    BLE_CHAR_UUID,
    Commands,
    MeasurementResult,
    parse_measurement,
    format_hex,
    is_compatible_device
)

logger = logging.getLogger(__name__)


@dataclass
class GLMDevice:
    """Represents a discovered GLM device"""
    address: str
    name: str
    rssi: int
    device: BLEDevice


class GLMClient:
    """BLE client for Bosch GLM laser distance meters"""
    
    def __init__(self, device: GLMDevice):
        """Initialize GLM client
        
        Args:
            device: GLMDevice instance from scanner
        """
        self.device = device
        self._client: Optional[BleakClient] = None
        self._connected = False
        self._measurement_callback: Optional[Callable[[MeasurementResult], None]] = None
        self._raw_callback: Optional[Callable[[bytes], None]] = None
        
    async def connect(self, timeout: float = 10.0) -> bool:
        """Connect to the GLM device
        
        Args:
            timeout: Connection timeout in seconds
            
        Returns:
            True if connected successfully
        """
        try:
            logger.info(f"Connecting to {self.device.name} ({self.device.address})...")
            
            self._client = BleakClient(self.device.device, timeout=timeout)
            await self._client.connect()
            
            # Verify service is available
            services = await self._client.get_services()
            service = services.get_service(BLE_SERVICE_UUID)
            if not service:
                logger.error(f"GLM service {BLE_SERVICE_UUID} not found")
                await self._client.disconnect()
                return False
            
            # Verify characteristic is available
            char = service.get_characteristic(BLE_CHAR_UUID)
            if not char:
                logger.error(f"GLM characteristic {BLE_CHAR_UUID} not found")
                await self._client.disconnect()
                return False
            
            logger.info(f"Connected to {self.device.name}")
            self._connected = True
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect: {e}")
            self._connected = False
            return False
    
    async def disconnect(self):
        """Disconnect from the GLM device"""
        if self._client and self._connected:
            try:
                await self._client.disconnect()
                logger.info(f"Disconnected from {self.device.name}")
            except Exception as e:
                logger.error(f"Error during disconnect: {e}")
            finally:
                self._connected = False
                self._client = None
    
    @property
    def is_connected(self) -> bool:
        """Check if device is connected"""
        return self._connected and self._client is not None and self._client.is_connected
    
    async def send_command(self, command: bytes) -> bool:
        """Send command to GLM device
        
        Args:
            command: Command bytes to send
            
        Returns:
            True if command sent successfully
        """
        if not self.is_connected:
            logger.error("Not connected to device")
            return False
        
        try:
            await self._client.write_gatt_char(BLE_CHAR_UUID, command)
            logger.debug(f"Sent command: {format_hex(command)}")
            return True
        except Exception as e:
            logger.error(f"Failed to send command: {e}")
            return False
    
    async def enable_notifications(self) -> bool:
        """Enable measurement notifications and send SYNC command
        
        Returns:
            True if notifications enabled successfully
        """
        if not self.is_connected:
            logger.error("Not connected to device")
            return False
        
        try:
            # Start notifications
            await self._client.start_notify(BLE_CHAR_UUID, self._notification_handler)
            logger.debug("Notifications enabled")
            
            # Send SYNC command to enable measurement streaming
            await asyncio.sleep(0.1)  # Small delay
            success = await self.send_command(Commands.SYNC)
            if success:
                logger.info("SYNC command sent - device ready for measurements")
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to enable notifications: {e}")
            return False
    
    async def disable_notifications(self) -> bool:
        """Disable measurement notifications
        
        Returns:
            True if notifications disabled successfully
        """
        if not self.is_connected:
            return True
        
        try:
            await self._client.stop_notify(BLE_CHAR_UUID)
            logger.debug("Notifications disabled")
            return True
        except Exception as e:
            logger.error(f"Failed to disable notifications: {e}")
            return False
    
    def set_measurement_callback(self, callback: Callable[[MeasurementResult], None]):
        """Set callback for parsed measurement results
        
        Args:
            callback: Function to call with MeasurementResult objects
        """
        self._measurement_callback = callback
    
    def set_raw_callback(self, callback: Callable[[bytes], None]):
        """Set callback for raw notification data
        
        Args:
            callback: Function to call with raw bytes
        """
        self._raw_callback = callback
    
    def _notification_handler(self, sender, data: bytearray):
        """Internal notification handler
        
        Args:
            sender: GATT characteristic sender
            data: Raw notification data
        """
        data_bytes = bytes(data)
        logger.debug(f"Notification: {format_hex(data_bytes)}")
        
        # Call raw callback if set
        if self._raw_callback:
            try:
                self._raw_callback(data_bytes)
            except Exception as e:
                logger.error(f"Error in raw callback: {e}")
        
        # Parse measurement and call measurement callback
        if self._measurement_callback:
            try:
                result = parse_measurement(data_bytes)
                self._measurement_callback(result)
            except Exception as e:
                logger.error(f"Error in measurement callback: {e}")
    
    async def trigger_measurement(self) -> bool:
        """Try to trigger measurement remotely (may not work on all models)
        
        Returns:
            True if command sent successfully (doesn't guarantee measurement)
        """
        logger.info("Attempting remote measurement trigger")
        return await self.send_command(Commands.MEASURE)
    
    async def laser_on(self) -> bool:
        """Turn laser on (may not work on all models)
        
        Returns:
            True if command sent successfully
        """
        logger.info("Turning laser on")
        return await self.send_command(Commands.LASER_ON)
    
    async def laser_off(self) -> bool:
        """Turn laser off (may not work on all models)
        
        Returns:
            True if command sent successfully
        """
        logger.info("Turning laser off")
        return await self.send_command(Commands.LASER_OFF)
    
    async def __aenter__(self):
        """Async context manager entry"""
        await self.connect()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.disconnect()


class GLMScanner:
    """Scanner for Bosch GLM devices"""
    
    @staticmethod
    async def scan(timeout: float = 5.0, compatible_only: bool = True) -> List[GLMDevice]:
        """Scan for GLM devices
        
        Args:
            timeout: Scan timeout in seconds
            compatible_only: Only return devices with known compatible names
            
        Returns:
            List of discovered GLM devices
        """
        logger.info(f"Scanning for GLM devices (timeout: {timeout}s)...")
        
        devices = []
        
        try:
            discovered = await BleakScanner.discover(timeout=timeout)
            
            for device in discovered:
                device_name = device.name or "Unknown"
                
                # Filter by compatibility if requested
                if compatible_only and not is_compatible_device(device_name):
                    continue
                
                # Also check if device advertises GLM service
                has_service = BLE_SERVICE_UUID.lower() in [
                    str(uuid).lower() for uuid in (device.metadata.get('uuids', []) or [])
                ]
                
                if compatible_only and not has_service and not is_compatible_device(device_name):
                    continue
                
                glm_device = GLMDevice(
                    address=device.address,
                    name=device_name,
                    rssi=device.rssi or -99,
                    device=device
                )
                
                devices.append(glm_device)
                logger.info(f"Found: {device_name} ({device.address}) RSSI: {device.rssi}")
        
        except Exception as e:
            logger.error(f"Scan failed: {e}")
        
        logger.info(f"Scan complete - found {len(devices)} device(s)")
        return devices
    
    @staticmethod
    async def scan_for_first(timeout: float = 10.0) -> Optional[GLMDevice]:
        """Scan for the first compatible GLM device
        
        Args:
            timeout: Scan timeout in seconds
            
        Returns:
            First GLM device found, or None
        """
        devices = await GLMScanner.scan(timeout=timeout, compatible_only=True)
        return devices[0] if devices else None


class MeasurementCollector:
    """Collects measurements from GLM device"""
    
    def __init__(self):
        self.measurements: List[MeasurementResult] = []
        self._measurement_event = asyncio.Event()
        self._last_measurement: Optional[MeasurementResult] = None
    
    def measurement_callback(self, result: MeasurementResult):
        """Callback for measurement results"""
        if result.type == 'measurement':
            result.timestamp = datetime.now()
            self.measurements.append(result)
            self._last_measurement = result
            self._measurement_event.set()
            self._measurement_event.clear()
    
    async def wait_for_measurement(self, timeout: float = 30.0) -> Optional[MeasurementResult]:
        """Wait for next measurement
        
        Args:
            timeout: Timeout in seconds
            
        Returns:
            MeasurementResult or None if timeout
        """
        try:
            await asyncio.wait_for(self._measurement_event.wait(), timeout=timeout)
            return self._last_measurement
        except asyncio.TimeoutError:
            return None
    
    def get_last_measurement(self) -> Optional[MeasurementResult]:
        """Get the most recent measurement"""
        return self._last_measurement
    
    def clear(self):
        """Clear collected measurements"""
        self.measurements.clear()
        self._last_measurement = None


# Convenience functions

async def scan_devices(timeout: float = 5.0) -> List[GLMDevice]:
    """Convenience function to scan for GLM devices"""
    return await GLMScanner.scan(timeout=timeout)


async def connect_to_first_device(timeout: float = 10.0) -> Optional[GLMClient]:
    """Convenience function to connect to first available GLM device
    
    Args:
        timeout: Scan and connect timeout
        
    Returns:
        Connected GLMClient or None
    """
    device = await GLMScanner.scan_for_first(timeout=timeout)
    if not device:
        return None
    
    client = GLMClient(device)
    if await client.connect():
        return client
    else:
        return None