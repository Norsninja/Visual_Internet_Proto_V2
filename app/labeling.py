# labeling.py

NODE_LABEL_FORMATS = {
    "router": "Router/Gateway",
    "device": "Local Device: {id}",
    "observer": "Network Observer: {id}",  # ✅ New label for scanning node
    "external": "External Node: {id}",
    "web": "Website: {title}",
    "asn": "ASN {asn}: {holder}",
    "prefix": "Prefix {id}"
}


def generate_node_label(node):
    """
    Generates a label for a node based on its type and available properties.
    The node dict is expected to have a "type" key.
    """
    node_type = node.get("type", "").lower()
    
    if node_type == "router":
        return NODE_LABEL_FORMATS["router"]
    elif node_type == "device":
        return NODE_LABEL_FORMATS["device"].format(id=node.get("id", "Unknown"))
    elif node_type == "observer":  # ✅ New case for network observer
        return NODE_LABEL_FORMATS["observer"].format(id=node.get("id", "Unknown"))
    elif node_type == "external":
        asn_info = node.get("asn_info")
        if asn_info:
            return f"ASN {asn_info.get('asn', 'Unknown')}: {asn_info.get('holder', 'Unknown')}"
        return NODE_LABEL_FORMATS["external"].format(id=node.get("id", "Unknown"))

    elif node_type == "web":
        title = node.get("title") or node.get("url", "Website")
        return NODE_LABEL_FORMATS["web"].format(title=title)
    elif node_type == "asn":
        return NODE_LABEL_FORMATS["asn"].format(
            asn=node.get("asn", "Unknown"),
            holder=node.get("holder", "Unknown")
        )
    elif node_type == "prefix":
        return NODE_LABEL_FORMATS["prefix"].format(id=node.get("id", "Unknown"))
    
    # Fallback label
    return node.get("label", "Unknown Node")

