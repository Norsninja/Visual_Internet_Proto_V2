import requests
import json
import logging
import time

logging.basicConfig(level=logging.INFO)

def get_asn_from_ip(ip):
    """Fetch ASN for a given IP using RIPE Stat."""
    url = f"https://stat.ripe.net/data/prefix-overview/data.json?resource={ip}"
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            asns = data.get("data", {}).get("asns", [])
            return asns[0] if asns else None
    except Exception as e:
        logging.error(f"Error fetching ASN for IP {ip}: {e}")
    return None

def get_bgp_peers(asn):
    """Fetch peers of an ASN from RIPE Stat."""
    url = f"https://stat.ripe.net/data/peers/data.json?resource=AS{asn}"
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            return [peer["asn"] for peer in data["data"]["peers"]]
    except Exception as e:
        logging.error(f"Error fetching BGP peers for ASN {asn}: {e}")
    return []

def get_bgp_prefixes(asn):
    """Fetch announced prefixes for an ASN."""
    url = f"https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS{asn}"
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            return [prefix["prefix"] for prefix in data["data"]["prefixes"]]
    except Exception as e:
        logging.error(f"Error fetching prefixes for ASN {asn}: {e}")
    return []

def scan_asn(ip_or_asn):
    """
    Scan an IP or ASN and return aggregated results.
    If the input does not start with "AS", it is treated as an IP address.
    """
    # Determine whether we're scanning an IP or an ASN
    if isinstance(ip_or_asn, str) and ip_or_asn.upper().startswith("AS"):
        asn = ip_or_asn.upper()[2:]  # Remove the "AS" prefix for consistency
    else:
        asn = get_asn_from_ip(ip_or_asn)
    
    if not asn:
        logging.warning(f"No ASN found for {ip_or_asn}")
        return {"error": "ASN not found"}

    logging.info(f"Scanning ASN: {asn}")

    # Fetch Peers and Prefixes
    peers = get_bgp_peers(asn)
    prefixes = get_bgp_prefixes(asn)

    # Return aggregated results as a dictionary
    return {"asn": asn, "peers": peers, "prefixes": prefixes}

if __name__ == "__main__":
    target = input("Enter an IP or ASN to scan (e.g., 8.8.8.8 or AS15169): ").strip()
    results = scan_asn(target)
    print("\nScan Results:")
    print(results)
