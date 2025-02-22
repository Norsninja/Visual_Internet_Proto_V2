import time
import logging
from collections import deque
from scapy.all import IP, sniff
from db import db

# A deque to store the last 100 captured packets.
traffic_data = deque(maxlen=100)

def packet_callback(packet):
    """Processes network packets and stores traffic data in the database."""
    if IP in packet:
        src = packet[IP].src
        dst = packet[IP].dst
        proto = packet.proto  #  Capture protocol
        size = len(packet)    #  Capture size
        timestamp = time.time()

        # Ensure both src and dst are tracked in the database
        db.discover_network_node(src, "Traffic", timestamp)
        db.discover_network_node(dst, "Traffic", timestamp)

        # Store packet in both real-time cache and database
        traffic_data.append({
            "src": src, 
            "dst": dst, 
            "proto": proto, 
            "size": size, 
            "timestamp": timestamp
        })
        db.store_traffic(src, dst, proto, size, timestamp)  #  Pass full packet data


def start_packet_capture():
    """Starts sniffing network packets in real-time."""
    sniff(prn=packet_callback, store=False)
