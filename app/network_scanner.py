import subprocess
import requests
import re
import logging
from scapy.all import IP, TCP, sr, send
import socket
import ssl
import platform
import subprocess
import re
import logging

logging.basicConfig(level=logging.INFO)
mac_cache = {}  # Store MAC addresses to avoid infinite retries
def run_arp_scan():
    """Run an ARP scan to detect local devices."""
    try:
        result = subprocess.run(["arp", "-a"], capture_output=True, text=True, shell=True)
        devices = []
        for line in result.stdout.split("\n"):
            match = re.search(r"(\d+\.\d+\.\d+\.\d+)", line)
            if match:
                devices.append(match.group(0))
        return devices
    except Exception as e:
        logging.error("Error running ARP scan: %s", e)
        return []

def run_traceroute(target="8.8.8.8"):
    """Run traceroute in a cross-platform way and record average RTT for each hop.
    
    Returns a list of dictionaries with keys:
      - 'ip': the hop's IP address
      - 'avg_time': average round-trip time in milliseconds (or None if not available)
    """
    try:
        system = platform.system().lower()
        if system == "windows":
            cmd = ["tracert", target]
            # Windows tracert output example:
            #   1    <1 ms    <1 ms    <1 ms  192.168.1.1
            time_pattern = re.compile(r"(?P<time><1|\d+)\s*ms", re.IGNORECASE)
            ip_pattern = re.compile(r"(\d+\.\d+\.\d+\.\d+)")
        else:
            cmd = ["traceroute", target]
            # Linux traceroute output example:
            # 1  router (192.168.1.1)  0.123 ms  0.098 ms  0.110 ms
            # Sometimes the IP is within parentheses; we'll capture that.
            time_pattern = re.compile(r"(?P<time>\d+\.\d+)\s*ms")
            ip_pattern = re.compile(r"\((\d+\.\d+\.\d+\.\d+)\)|^(\d+\.\d+\.\d+\.\d+)")
        
        result = subprocess.run(cmd, capture_output=True, text=True, shell=True)
        hops = []
        for line in result.stdout.split("\n"):
            # Find the IP address in the line
            ip_match = ip_pattern.search(line)
            if not ip_match:
                continue
            # If the IP is captured within parentheses, use that group, else the other group.
            ip = ip_match.group(1) if ip_match.group(1) else ip_match.group(2)
            # Find all time values in the line
            times = []
            for match in time_pattern.finditer(line):
                time_str = match.group("time")
                if time_str.lower() == "<1":
                    times.append(1.0)
                else:
                    try:
                        times.append(float(time_str))
                    except ValueError:
                        continue
            avg_time = sum(times) / len(times) if times else None
            hops.append({"ip": ip, "avg_time": avg_time})
        return hops
    except Exception as e:
        logging.error("Error running traceroute: %s", e)
        return []

def scapy_port_scan(ip, start_port=20, end_port=1024, timeout=2):
    """
    Perform a TCP SYN scan using Scapy on the given IP address.
    
    :param ip: Target IP address.
    :param start_port: Starting port number.
    :param end_port: Ending port number.
    :param timeout: Timeout in seconds for responses.
    :return: A list of open ports.
    """
    open_ports = []
    ports = list(range(start_port, end_port + 1))
    
    # Build the SYN packets for all ports
    packets = [IP(dst=ip)/TCP(dport=port, flags="S") for port in ports]
    
    logging.info("Starting Scapy scan on %s for ports %s to %s", ip, start_port, end_port)
    
    # Send the packets concurrently and collect responses
    answered, unanswered = sr(packets, timeout=timeout, verbose=0)
    
    # Process the responses: a SYN-ACK (flags=0x12) indicates an open port
    for sent, received in answered:
        tcp_layer = received.getlayer(TCP)
        if tcp_layer and tcp_layer.flags == 0x12:
            open_ports.append(sent.dport)
            # Send a RST packet to gracefully close the half-open connection
            send(IP(dst=ip)/TCP(dport=sent.dport, flags="R"), verbose=0)
    
    logging.info("Scapy scan complete on %s, open ports: %s", ip, open_ports)
    return open_ports

def get_asn_info(ip):
    """Fetch ASN and ISP information using the BGPView API, returning a dict."""
    try:
        # For private networks, return a dict indicating it's private.
        if ip.startswith(("10.", "172.16.", "192.168.")):
            return {"asn": None, "holder": "Private Network"}
        url = f"https://api.bgpview.io/ip/{ip}"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            asn = data["data"].get("asn")
            isp = data["data"].get("isp")
            if asn:
                return {"asn": asn, "holder": isp or "Unknown ISP"}
            else:
                return None
        else:
            return None
    except Exception as e:
        logging.error("Error getting ASN info for %s: %s", ip, e)
        return None


def get_mac(ip):
    """Retrieve the MAC address for a local network device with retry limits."""
    if not ip.startswith(("192.168.", "10.", "172.")):
        return "Unavailable (External Network)"

    # If we've already failed to find this MAC, return "Unknown" without retrying forever
    if ip in mac_cache and mac_cache[ip] is None:
        return "Unknown"

    try:
        result = subprocess.run(["arp", "-a"], capture_output=True, text=True, shell=True)
        for line in result.stdout.split("\n"):
            if ip in line:
                mac_match = re.search(r"([0-9A-Fa-f:-]{17})", line)
                if mac_match:
                    mac_cache[ip] = mac_match.group(0)  # Cache the result
                    return mac_match.group(0)

    except Exception as e:
        logging.error("Error getting MAC for %s: %s", ip, e)

    # If no MAC is found, cache the failure and return "Unknown"
    mac_cache[ip] = None
    return "Unknown"
def reverse_dns_lookup(ip):
    try:
        return socket.gethostbyaddr(ip)[0]
    except socket.herror:
        return "Unknown"
    
def get_ssl_info(ip, port=443):
    try:
        context = ssl.create_default_context()
        with socket.create_connection((ip, port), timeout=3) as sock:
            with context.wrap_socket(sock, server_hostname=ip) as ssock:
                cert = ssock.getpeercert()
                return cert
    except:
        return "No SSL or Failed to Retrieve"
    
def grab_banner(ip, port):
    try:
        with socket.create_connection((ip, port), timeout=3) as s:
            s.sendall(b"GET / HTTP/1.1\r\n\r\n")  # Example request for HTTP services
            return s.recv(1024).decode(errors="ignore")
    except Exception:
        return "Unknown"
def check_cve(service_name, version):
    url = f"https://services.nvd.nist.gov/rest/json/cves/1.0?keyword={service_name}%20{version}"
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            return response.json()
    except:
        return "Unknown"    