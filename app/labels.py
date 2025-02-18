# labels.py
from network_scanner import get_asn_info

def build_network_label(ip, extra_data=None):
    """
    Build a label for a network node. Use ASN info as the primary label.
    """
    label = get_asn_info(ip)
    # Optionally, you might incorporate additional info from extra_data
    if extra_data and extra_data.get("role"):
        label += f" ({extra_data.get('role')})"
    return label

def build_web_label(metadata):
    """
    Build a label for a web node using metadata fetched from the site.
    """
    return metadata.get("title") or metadata.get("url")
