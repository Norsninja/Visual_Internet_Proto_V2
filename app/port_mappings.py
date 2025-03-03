SERVICE_PORT_MAPPINGS = {
    "web": [80, 443, 8080, 8443, 8000, 8888],
    "mail": [25, 465, 587, 110, 995, 143, 993],
    "ftp": [20, 21],
    "ssh": [22],
    "telnet": [23],
    "dns": [53],
    "dhcp": [67, 68],
    "tftp": [69],
    "database": [1433, 1521, 3306, 5432, 6379, 27017, 9200, 7474],
    "rdp": [3389],
    "ipfs": [4001, 5001, 8080],
    "blockchain": [8333, 8332, 30303, 30304],
    "tor": [9001, 9030, 9050, 9051],
    "iot_mqtt": [1883, 8883],
    "iot_coap": [5683, 5684],
    "p2p": [6881, 6882, 6883, 6889, 6969],
    "industrial": [502, 102, 20000]  # Modbus, S7, DNP3
}

# Flatten all service ports into a list (sorted, unique)
INTERESTING_PORTS = sorted(set(port for ports in SERVICE_PORT_MAPPINGS.values() for port in ports))
