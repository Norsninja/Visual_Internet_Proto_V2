import socket
import requests
import time
import logging
from collections import deque
from scapy.all import IP, sniff
import netifaces

# A deque to store the last 100 captured packets.
traffic_data = deque(maxlen=100)

# Global external target (can be updated via an endpoint)
external_target = "8.8.8.8"

def get_local_ip():
    try:
        hostname = socket.gethostname()
        return socket.gethostbyname(hostname)
    except Exception as e:
        logging.error("Error getting local IP: %s", e)
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
    import netifaces
    try:
        gateways = netifaces.gateways()
        if 'default' in gateways and netifaces.AF_INET in gateways['default']:
            default_gateway = gateways['default'][netifaces.AF_INET][0]
            logging.info(f"Detected IPv4 Gateway: {default_gateway}")
            return default_gateway
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

def packet_callback(packet):
    if IP in packet:
        src = packet[IP].src
        dst = packet[IP].dst
        proto = packet.proto
        size = len(packet)
        timestamp = time.time()
        traffic_data.append({"src": src, "dst": dst, "proto": proto, "size": size, "timestamp": timestamp})

def start_packet_capture():
    sniff(prn=packet_callback, store=False)

