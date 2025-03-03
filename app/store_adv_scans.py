import time
import logging

def store_port_scan_advanced_result(self, target_ip, port, scan_type, results):
    """
    Stores an advanced scan result as a separate node and creates a relationship
    from the most recent PortScan node to this advanced result.
    
    :param target_ip: The target IP address that was scanned.
    :param port: The specific port for which the advanced scan was performed.
    :param scan_type: The type of advanced scan (e.g., "bannerGrab", "reverseDNS", "sslInfo", "cveLookup").
    :param results: The results data to store (can be a dict, JSON string, etc.).
    :return: The ID of the advanced result node, or None if no matching PortScan node was found.
    """
    # Step 1: Find the most recent port scan node for the given target IP.
    query_find = """
    MATCH (s:Scan {type: 'portscan', target: $target_ip})
    WITH s ORDER BY s.timestamp DESC LIMIT 1
    RETURN s.id AS scan_id
    """
    with self.driver.session() as session:
        record = session.run(query_find, target_ip=target_ip).single()
        if not record:
            logging.error("No port scan node found for target: %s", target_ip)
            return None
        port_scan_id = record["scan_id"]
    
    # Step 2: Create a unique ID for the advanced result node.
    advanced_id = f"advanced_{port_scan_id}_{port}_{scan_type}_{int(time.time())}"
    
    # Step 3: Create the AdvancedResult node with its properties.
    advanced_node = {
        "id": advanced_id,
        "target": target_ip,
        "port": port,
        "scan_type": scan_type,
        "results": results,
        "timestamp": time.time(),
        "label": f"{scan_type} Result"
    }
    query_create = """
    MERGE (a:AdvancedResult {id: $advanced_id})
    SET a = $advanced_node
    """
    with self.driver.session() as session:
        session.run(query_create, advanced_id=advanced_id, advanced_node=advanced_node)
    
    # Step 4: Create a relationship from the PortScan node to this AdvancedResult node.
    query_rel = """
    MATCH (s:Scan {id: $port_scan_id}), (a:AdvancedResult {id: $advanced_id})
    MERGE (s)-[r:HAS_ADVANCED_RESULT]->(a)
    SET r.timestamp = $timestamp
    """
    with self.driver.session() as session:
        session.run(query_rel, port_scan_id=port_scan_id, advanced_id=advanced_id, timestamp=time.time())
    
    return advanced_id
