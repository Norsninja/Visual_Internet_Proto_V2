#!/usr/bin/env python3
"""
orchestrator.py

This module coordinates scanning operations and delegates persistence
to the database layer in db.py. A global lock prevents overlapping scans.
"""

import time
import threading
import logging
from db import db  # Your Neo4j DB instance (an instance of Neo4jDB)
from scanners import get_gateway, get_local_ip, get_public_ip, get_local_subnet
from network_scanner import run_arp_scan, run_traceroute, scapy_port_scan, get_asn_info, get_mac
from bgp_scanner import scan_asn
from web_scanner import fetch_website_metadata, extract_hyperlinks
from config import external_target  # External target configuration

# Global lock to prevent overlapping scans.
scan_lock = threading.Lock()

def update_router_data():
    """Collect and return router node data."""
    now = time.time()
    gateway_ip = get_gateway() or "192.168.1.1"
    router_data = {
        "id": gateway_ip,
        "type": "router",
        "mac_address": get_mac(gateway_ip),
        "role": "Router",
        "color": "orange",
        "last_seen": now,
        "public_ip": get_public_ip(),
    }
    # Optionally perform a port scan on the gateway.
    external_ports = scapy_port_scan(gateway_ip, start_port=20, end_port=1024)
    if external_ports:
        router_data["open_external_port"] = external_ports[0]
    return router_data

def update_local_devices():
    """Collect and return a list of local device node data."""
    now = time.time()
    devices = run_arp_scan()
    local_ip = get_local_ip()
    gateway_ip = get_gateway()
    local_subnet = get_local_subnet()
    device_nodes = []
    for device in devices:
        if device in (local_ip, gateway_ip):
            continue
        is_local = local_subnet and device.startswith(local_subnet)
        node_type = "device" if is_local else "external"
        node_data = {
            "id": device,
            "type": node_type,
            "mac_address": get_mac(device),
            "role": "Unknown Device" if is_local else "External Node",
            "color": "#0099FF" if is_local else "red",
            "last_seen": now,
        }
        device_nodes.append(node_data)
    return device_nodes

def update_traceroute_data():
    """Collect traceroute hops and build nodes and relationships, preserving original behavior."""
    import time
    from db import db
    from config import external_target  # Default external target from config
    from network_scanner import run_traceroute, get_asn_info
    from scanners import get_gateway

    now = time.time()
    gateway_ip = get_gateway()
    
    # Retrieve external target from DB; if not set, fall back to default and update the DB.
    target_config = db.get_config_value("external_target")
    if not target_config:
        target_config = external_target
        db.set_config_value("external_target", target_config)
    
    # Run traceroute using the external target.
    hops = run_traceroute(target=target_config)
    traceroute_nodes = []
    traceroute_relationships = []
    prev_hop = gateway_ip

    for hop in hops:
        # Extract hop IP from dict or directly.
        hop_ip = hop["ip"] if isinstance(hop, dict) and "ip" in hop else hop

        # Skip hop if it's the gateway, if it's a "*" entry, or if empty.
        if hop_ip == gateway_ip or hop_ip == "*" or not hop_ip.strip():
            continue

        # Fetch ASN info for the hop.
        asn_info = get_asn_info(hop_ip)
        
        # Build the node data; include the tracerouted flag to indicate if this hop is the target.
        node_data = {
            "id": hop_ip,
            "type": "external",
            "mac_address": "Unavailable (External)",
            "role": "External Node",
            "color": "red",
            "last_seen": now,
            "tracerouted": (hop_ip == target_config)
        }
        if asn_info:
            node_data["asn_info"] = asn_info

        traceroute_nodes.append(node_data)

        traceroute_relationships.append({
            "source": prev_hop,
            "target": hop_ip,
            "type": "TRACEROUTE_HOP",
            "properties": {"timestamp": now, "traceroute_mode": "local"}
        })
        prev_hop = hop_ip

    return traceroute_nodes, traceroute_relationships




def perform_full_scan():
    """
    Master function that aggregates local scan data (router, ARP, traceroute)
    and delegates persistence to the DB layer.
    """
    if not scan_lock.acquire(blocking=False):
        logging.info("Scan already in progress; skipping this interval.")
        return
    try:
        logging.info("Starting full scan...")
        router_data = update_router_data()
        local_devices = update_local_devices()
        traceroute_nodes, traceroute_relationships = update_traceroute_data()

        # Build the structured payload (external scans omitted).
        scan_payload = {
            "router": router_data,
            "devices": local_devices,
            "traceroute_nodes": traceroute_nodes,
            "traceroute_relationships": traceroute_relationships,
        }
        # Delegate persistence to the DB layer.
        db.update_graph_with_data(scan_payload)
        logging.info("Full scan persisted successfully.")
    except Exception as e:
        logging.error("Error during full scan: %s", e)
    finally:
        scan_lock.release()


def schedule_full_scan(interval=10):
    """Continuously schedule full scans with a fixed interval."""
    while True:
        perform_full_scan()
        time.sleep(interval)

if __name__ == "__main__":
    perform_full_scan()
