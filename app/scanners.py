import socket
import requests
import time
import logging
from collections import deque
from scapy.all import IP, sniff
import netifaces
_cached_gateway = None  # Cache variable

# Global external target (can be updated via an endpoint)
external_target = "8.8.8.8"

def get_local_ip():
    """Retrieves the local IP address using a direct network lookup to avoid DNS issues."""
    try:
        # ✅ Use a direct connection method instead of DNS resolution
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))  # Google's DNS
            local_ip = s.getsockname()[0]
            return local_ip
    except Exception as e:
        logging.error(f"Error getting local IP using network socket: {e}")

    # ✅ Fallback: Return 'Unknown' instead of crashing
    logging.error("Failed to determine local IP address. Returning 'Unknown'.")
    return "Unknown"

def get_public_ip():
    try:
        response = requests.get("https://api.ipify.org?format=json", timeout=5)
        if response.status_code == 200:
            return response.json().get("ip")
    except Exception as e:
        logging.error("Error fetching public IP: %s", e)
    return "Unknown"



def get_gateway():
    """Retrieve and cache the IPv4 gateway to prevent redundant lookups."""
    global _cached_gateway

    if _cached_gateway is not None:
        return _cached_gateway  # ✅ Return cached value if already set

    try:
        gateways = netifaces.gateways()
        if 'default' in gateways and netifaces.AF_INET in gateways['default']:
            _cached_gateway = gateways['default'][netifaces.AF_INET][0]  # ✅ Cache the gateway
            logging.info(f"Cached IPv4 Gateway: {_cached_gateway}")
            return _cached_gateway

        logging.warning("No valid IPv4 gateway detected.")
        return "Unknown"

    except Exception as e:
        logging.error(f"Error getting gateway: {e}")
        return "Unknown"

def get_local_subnet():
    import netifaces
    try:
        iface = netifaces.gateways()['default'][netifaces.AF_INET][1]
        addr_info = netifaces.ifaddresses(iface)[netifaces.AF_INET][0]
        local_subnet = addr_info['addr'].rsplit('.', 1)[0] + '.'
        return local_subnet
    except Exception as e:
        logging.error("Could not determine local subnet: %s", e)
        return None


