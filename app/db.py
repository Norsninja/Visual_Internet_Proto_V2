from neo4j import GraphDatabase
import time
import logging
from scanners import get_gateway, get_local_ip, get_public_ip, get_local_subnet
from network_scanner import run_arp_scan, run_traceroute, scapy_port_scan, get_asn_info, get_mac
import json
from config import external_target
from labeling import generate_node_label
import re

# Neo4j connection settings
NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "password"

class Neo4jDB:
    recently_seen_nodes = {}          
    def __init__(self, uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))
        # self.init_constraints()  # Uncomment to run once if needed

    def close(self):
        self.driver.close()

    def init_constraints(self):
        with self.driver.session() as session:
            # Indexes for faster node lookups
            session.run("CREATE INDEX IF NOT EXISTS FOR (n:NetworkNode) ON (n.id)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (n:WebNode) ON (n.id)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (n:ASNNode) ON (n.id)")
            
            # Indexes for common query patterns
            session.run("CREATE INDEX IF NOT EXISTS FOR (n:NetworkNode) ON (n.type)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (n:NetworkNode) ON (n.fully_scanned)")
            
            # Other useful indexes
            session.run("CREATE INDEX IF NOT EXISTS FOR (n:Scan) ON (n.type)")


    def upsert_network_node(self, node):
        """
        Insert or update a Network Node while merging any extra properties.
        """
        # Generate the label based on the node's data.
        node["label"] = generate_node_label(node)
        # Remove non-primitive properties that shouldn't be stored in Neo4j.
        if "asn_info" in node and isinstance(node["asn_info"], dict):
            # Optionally, you can set node["asn"] and node["holder"] if desired:
            if "asn" not in node:
                node["asn"] = node["asn_info"].get("asn")
            if "holder" not in node:
                node["holder"] = node["asn_info"].get("holder")
            # Now remove the asn_info dictionary
            node.pop("asn_info")
        props = node.copy()
        id_value = props.pop("id")
        query = """
        MERGE (n:NetworkNode {id: $id})
        SET n += $props
        """
        with self.driver.session() as session:
            session.run(query, id=id_value, props=props)



    def upsert_web_node(self, web_node):
        """
        Insert or update a Web Node while merging extra properties.
        """
        web_node["layer"] = "web"
        props = {k: v for k, v in web_node.items() if v is not None}  # Remove None values
        id_value = props.pop("id", None)
        if not id_value:
            logging.error("❌ upsert_web_node: Missing WebNode ID!")
            return
        
        query = """
        MERGE (w:WebNode {id: $id})
        ON CREATE SET w += $props
        ON MATCH SET w.last_seen = timestamp()
        """

        web_node.setdefault("color", "#FF69B4")  # Hot pink for web nodes
        with self.driver.session() as session:
            session.run(query, id=id_value, props=props)
                    
    def upsert_asn_node(self, asn_data, prefixes=[], peers=[]):
        """
        Insert or update an ASN Node while merging prefix and peer arrays.
        """
        node_id = f"AS{asn_data['asn']}"
        node = {
            "id": node_id,
            "type": "asn",
            "asn": asn_data['asn'],
            "holder": asn_data.get("holder", "Unknown"),
            "color": "#FFD700",  # Gold for ASN nodes
            "last_seen": time.time(),
            "prefixes": prefixes,
            "peers": peers
        }
        # Generate the label here
        node["label"] = generate_node_label(node)
        
        with self.driver.session() as session:
            result = session.run(
                "MATCH (a:ASNNode {id: $id}) RETURN a.prefixes AS prefixes, a.peers AS peers",
                id=node_id
            )
            record = result.single()
            if record:
                existing_prefixes = record["prefixes"] or []
                existing_peers = record["peers"] or []
                merged_prefixes = list(set(existing_prefixes + prefixes))
                merged_peers = list(set(existing_peers + peers))
                node["prefixes"] = merged_prefixes
                node["peers"] = merged_peers
            query = """
            MERGE (a:ASNNode {id: $id})
            SET a += $props
            """
            session.run(query, id=node_id, props=node)


    def store_bgp_scan(self, target, bgp_data):
        """
        Stores a BGP scan in Neo4j and updates related nodes efficiently,
        ensuring no duplicate BGP scan is added.
        """
        properties = {
            "asn": bgp_data['asn']['asn'],
            "holder": bgp_data['asn'].get('holder', "Unknown"),
            "prefixes": bgp_data.get('prefixes', []),
            "peers": bgp_data.get('peers', [])
        }

        # ✅ Step 1: Store scan only if it does not already exist
        scan_id = self.store_scan("bgpscan", target, properties, extra_labels=["BGPScan"])
        if not scan_id:
            return  # ✅ Prevents redundant work if the scan already exists

        print(f"Stored BGP scan for {target}: {bgp_data}")

        # ✅ Step 2: Set `bgp_scanned = true` on the target NetworkNode
        query_update_node = """
            MATCH (n:NetworkNode {id: $target})
            SET n.bgp_scanned = true
        """
        with self.driver.session() as session:
            session.run(query_update_node, target=target)

        # ✅ Step 3: Batch process prefixes
        prefix_nodes = []
        prefix_relationships = []
        for prefix in bgp_data.get('prefixes', []):
            prefix_nodes.append({
                "id": prefix,
                "type": "prefix",
                "last_seen": time.time(),
                "color": "#0099FF",
                "label": generate_node_label({"id": prefix, "type": "prefix"})
            })
            prefix_relationships.append((f"AS{bgp_data['asn']['asn']}", prefix, "ANNOUNCES", {"timestamp": time.time()}))

        for node in prefix_nodes:
            self.upsert_network_node(node)

        for asn_id, prefix, rel_type, props in prefix_relationships:
            self.create_asn_network_relationship(asn_id, prefix, rel_type, props)





    def create_relationship(self, source_id, target_id, relationship_type, properties={}):
        """Create relationships between nodes while correctly handling WebNodes and NetworkNodes."""
        query = """
        MERGE (a {id: $source_id})
        ON CREATE SET a:%s
        MERGE (b {id: $target_id})
        ON CREATE SET b:%s
        MERGE (a)-[r:%s]->(b)
        SET r += $properties
        """ % (
            "WebNode" if relationship_type == "WEB_LINK" else "NetworkNode",
            "WebNode" if relationship_type == "WEB_LINK" else "NetworkNode",
            relationship_type
        )

        with self.driver.session() as session:
            session.run(query, source_id=source_id, target_id=target_id, properties=properties)

    def create_asn_network_relationship(self, asn_node_id, network_node_id, relationship_type, properties={}):
        """
        Create a relationship between an ASN node and a Network node.
        This method explicitly matches an ASNNode for the source and a NetworkNode for the target.
        """
        query = """
        MATCH (a:ASNNode {id: $asn_node_id})
        MATCH (b:NetworkNode {id: $network_node_id})
        MERGE (a)-[r:%s]->(b)
        SET r += $properties
        """ % (relationship_type)
        with self.driver.session() as session:
            session.run(query, asn_node_id=asn_node_id, network_node_id=network_node_id, properties=properties)

    def create_scan_relationship(self, scan_id, target_ip, relationship_type="RESULTS_IN"):
        """
        Creates a relationship between the scan node and the target NetworkNode.
        """
        query = """
        MATCH (s:Scan {id: $scan_id})
        MATCH (n:NetworkNode {id: $target_ip})
        MERGE (s)-[r:%s]->(n)
        SET r.timestamp = $timestamp
        """ % relationship_type
        with self.driver.session() as session:
            session.run(query, scan_id=scan_id, target_ip=target_ip, timestamp=time.time())

    def store_scan(self, scan_type, target, additional_properties, extra_labels=None):
        """
        Centralized function to store any type of scan, ensuring duplicates are not added.
        
        :param scan_type: A string identifier for the scan type (e.g., "portscan", "bgpscan", "sslscan", "webscan").
        :param target: The target IP address that was scanned.
        :param additional_properties: A dict of scan-specific properties (e.g., ports, prefixes, peers, etc.).
        :param extra_labels: A list of extra labels to add to the scan node (e.g., ["PortScan"] or ["BGPScan"]).
        :return: The scan_id if a new scan is created, or None if a scan already exists.
        """
        if extra_labels is None:
            extra_labels = []

        # Check for duplicate scans (existing code)
        query_check = """
        MATCH (s:Scan)-[:RESULTS_IN]->(n:NetworkNode {id: $target})
        WHERE s.type = $scan_type
        RETURN s.id AS scan_id
        """
        with self.driver.session() as session:
            result = session.run(query_check, scan_type=scan_type, target=target)
            existing_scan = result.single()

        if existing_scan:
            print(f"⚠️ Skipping duplicate scan: {scan_type} already exists for {target}")
            return None

        # Generate a unique scan ID
        scan_id = f"{scan_type}-{target}-{int(time.time())}"

        # Construct the scan node dictionary
        scan_node = {
            "id": scan_id,
            "type": scan_type,
            "target": target,
            "timestamp": time.time()
        }
        scan_node.update(additional_properties)
        scan_node["label"] = generate_node_label(scan_node)
        extra_label_str = "".join(f":{label}" for label in extra_labels)

        query_scan = f"""
        MERGE (s:Scan{extra_label_str} {{id: $scan_id}})
        SET s += $scan_node
        """
        with self.driver.session() as session:
            session.run(query_scan, scan_id=scan_id, scan_node=scan_node)

        self.create_scan_relationship(scan_id, target)

        # If this is a port scan, update the NetworkNode with port info.
        if scan_type == "portscan":
            query_update_node = """
            MATCH (n:NetworkNode {id: $target})
            SET n.ports = $ports, n.scanned_ports = true
            """
            with self.driver.session() as session:
                session.run(query_update_node, target=target, ports=additional_properties.get("ports", []))

        self.update_scan_status(target, scan_type)

        return scan_id
    
    def update_port_scan_advanced_results(self, target_ip, port, scan_type, results):
        """
        Updates a PortScan node with advanced scan results.

        :param target_ip: The target IP address
        :param port: The specific port being scanned
        :param scan_type: The type of advanced scan (e.g., "bannerGrab", "reverseDNS", "sslInfo", "cveLookup")
        :param results: The results to store
        """
        query = """
        MATCH (s:Scan {type: 'portscan', target: $target_ip})
        WITH s, toString($port) + '_' + $scan_type AS key
        SET s.advanced_results = coalesce(s.advanced_results, {})
        SET s.advanced_results[key] = $results
        RETURN s.id
        """

        with self.driver.session() as session:
            result = session.run(query, target_ip=target_ip, port=str(port), scan_type=scan_type, results=results)
            record = result.single()
            return record["s.id"] if record else None


    def store_port_scan_advanced_result(self, target_ip, port, scan_type, results):
        """
        Stores an advanced scan result as a separate node and creates a relationship
        from the most recent PortScan node to this advanced result.
        
        :param target_ip: The target IP address that was scanned.
        :param port: The specific port for which the advanced scan was performed.
        :param scan_type: The type of advanced scan (e.g., "bannerGrab", "reverseDNS", "sslInfo", "cveLookup").
        :param results: The results data to store (if it's a dict or list, it will be converted to JSON).
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
        
        # Convert results to a JSON string if it's not already a primitive.
        if isinstance(results, (dict, list)):
            results_str = json.dumps(results)
        else:
            results_str = results

        # Step 3: Create the AdvancedResult node with its properties.
        advanced_node = {
            "id": advanced_id,
            "target": target_ip,
            "port": port,
            "scan_type": scan_type,
            "results": results_str,
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
        MATCH (s:Scan {id: $port_scan_id})
        MATCH (a:AdvancedResult {id: $advanced_id})
        MERGE (s)-[r:HAS_ADVANCED_RESULT]->(a)
        SET r.timestamp = $timestamp
        """
        with self.driver.session() as session:
            session.run(query_rel, port_scan_id=port_scan_id, advanced_id=advanced_id, timestamp=time.time())
        
        return advanced_id


                
    def update_scan_status(self, target_ip, scan_type):
        """
        Updates the scan completion status of a NetworkNode.
        If all required scans are complete, mark the node as `fully_scanned`.

        - If a port scan has been completed and no web ports (80, 443) exist, `webscan` is no longer required.
        - If a port scan has not been completed, assume `webscan` might still be needed.
        """
        required_scans = self.get_config_value("required_scans") or []

        # Step 1: Retrieve existing scan completions and open ports
        query = """
        MATCH (n:NetworkNode {id: $target_ip})
        RETURN n.ports AS ports, n.scans_completed AS scans_completed
        """
        with self.driver.session() as session:
            result = session.run(query, target_ip=target_ip)
            record = result.single()

        if not record:
            return  # No node found, exit early

        ports = record["ports"] or []  # et open ports (if they exist)
        scans_completed = record["scans_completed"] or []  # ✅ Get completed scans

        # ✅ Step 2: Check if port scan was completed
        portscan_completed = "portscan" in scans_completed

        # ✅ Step 3: If a port scan has been completed but no web ports exist, remove `webscan`
        if portscan_completed and not any(port in [80, 443] for port in ports):
            required_scans = [scan for scan in required_scans if scan != "webscan"]

        # ✅ Step 4: Update the node’s scan completion status
        query_update = """
        MATCH (n:NetworkNode {id: $target_ip})
        SET n.scans_completed = COALESCE(n.scans_completed, []) + $scan_type
        WITH n, $required_scans AS required
        SET n.fully_scanned = size(n.scans_completed) = size(required)
        """
        with self.driver.session() as session:
            session.run(query_update, target_ip=target_ip, scan_type=scan_type, required_scans=required_scans)

    


    def store_traceroute(self, target_ip, hops, traceroute_mode="local"):
        if not hops:
            print(f"No valid hops for {target_ip}, skipping storage.")
            return

        prev_hop = target_ip
        ip_pattern = re.compile(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$")  # Regex for valid IPv4

        for hop in hops:
            hop_ip = hop["ip"] if isinstance(hop, dict) and "ip" in hop else hop

            # ✅ Skip non-IP hops
            if not ip_pattern.match(hop_ip):
                logging.warning(f"Skipping non-IP hop: {hop_ip}")
                continue

            # ✅ Skip empty or wildcard hops
            if hop_ip == "*" or hop_ip.strip() == "":
                continue

            # Instead of using get_asn_info directly, you can store the ASN info if available.
            asn_info = get_asn_info(hop_ip)
            if asn_info:
                node_data["asn_info"] = asn_info

            node_data = {
                "id": hop_ip,
                "type": "external",
                "mac_address": "Unavailable (External)",
                "role": "External Node",
                "color": "red",
                "last_seen": time.time(),
                "tracerouted": (hop_ip == target_ip),
                "asn_info": asn_info  # optionally include ASN data for label generation
            }
            # Generate label using the helper
            node_data["label"] = generate_node_label(node_data)
            self.upsert_network_node(node_data)
            self.create_relationship(prev_hop, hop_ip, "TRACEROUTE_HOP",
                                    {"timestamp": time.time(), "traceroute_mode": traceroute_mode})
            prev_hop = hop_ip

        print(f"Stored {traceroute_mode} traceroute for {target_ip}: {hops}")





    def store_port_scan(self, target_ip, ports):
        """
        Refactored function to store a port scan using the centralized store_scan function.
        """
        # Prepare scan-specific properties
        properties = {
            "ports": ports
        }
        # Call the base scan function with an extra label for clarity
        scan_id = self.store_scan("portscan", target_ip, properties, extra_labels=["PortScan"])
        
        # Update the target NetworkNode with discovered ports and a scanned flag.
        query_update_node = """
        MATCH (n:NetworkNode {id: $target})
        SET n.ports = $ports, n.scanned_ports = true
        """
        with self.driver.session() as session:
            session.run(query_update_node, target=target_ip, ports=ports)
        
        print(f"Stored port scan for {target_ip}: {ports}")



    def store_ssl_scan(self, target_ip, ssl_info):
        """
        Refactored function to store SSL scan results using the centralized store_scan function.
        """
        # Prepare SSL scan-specific properties.
        properties = {
            "issuer": ssl_info["issuer"],
            "notBefore": ssl_info["notBefore"],
            "notAfter": ssl_info["notAfter"]
        }
        
        # Call the base scan function with an extra label for SSL scans.
        scan_id = self.store_scan("sslscan", target_ip, properties, extra_labels=["SSLScan"])
        
        print(f"Stored SSL scan for {target_ip}")


    def fetch_full_graph(self):
        """Retrieve all nodes and relationships, ensuring node ids are strings, excluding scan nodes."""
        query = """
        MATCH (n)
        WHERE NOT n:Scan
        OPTIONAL MATCH (n)-[r]->(m)
        RETURN n, r, m
        """
        with self.driver.session() as session:
            result = session.run(query)
            nodes = {}
            edges = []
            for record in result:
                node_obj = record["n"]
                node = dict(node_obj)
                node_id = node.get("id")
                if not node_id:
                    node_id = node_obj.id  # fallback to internal id
                # Ensure node_id is a string
                node["id"] = str(node_id)
                nodes[node["id"]] = node
                if record["r"]:
                    start_node = record["r"].start_node
                    end_node = record["r"].end_node
                    source_id = str(start_node.get("id", start_node.id))
                    target_id = str(end_node.get("id", end_node.id))
                    edges.append({
                        "source": source_id,
                        "target": target_id,
                        "type": record["r"].type,
                        "properties": dict(record["r"])
                    })
        return {"nodes": list(nodes.values()), "edges": edges}

    
    def get_node_by_id(self, node_id):
        """Retrieve a node from Neo4j by its ID."""
        query = """
        MATCH (n) WHERE n.id = $node_id
        RETURN n
        """
        with self.driver.session() as session:
            result = session.run(query, node_id=node_id)
            record = result.single()
            return dict(record["n"]) if record else None

    # New configuration functions to persist settings in Neo4j
    def set_config_value(self, key, value):
        """Store a configuration value in Neo4j under a Config node."""
        query = """
        MERGE (c:Config {key: $key})
        SET c.value = $value
        """
        with self.driver.session() as session:
            session.run(query, key=key, value=value)

    def get_config_value(self, key):
        """Retrieve a configuration value from the Config node in Neo4j."""
        query = """
        MATCH (c:Config {key: $key})
        RETURN c.value AS value
        """
        with self.driver.session() as session:
            result = session.run(query, key=key)
            record = result.single()
            return record["value"] if record else None


    def initialize_graph(self):
        """Ensure default gateway exists on startup and set required scans in Config."""
        gateway_ip = get_gateway() or "192.168.1.1"
        
        if not self.get_node_by_id(gateway_ip):
            node_data = {
                "id": gateway_ip,
                "type": "router",
                "mac_address": get_mac(gateway_ip),
                "role": "Router",
                "color": "orange",  # Critical for frontend styling
                "last_seen": time.time()
            }
            node_data["label"] = generate_node_label(node_data)
            self.upsert_network_node(node_data)
            logging.info("Created default gateway node on startup")

        # Set required scans in Config node
        if not self.get_config_value("required_scans"):
            self.set_config_value("required_scans", ["portscan", "bgpscan", "webscan"])
            logging.info("Initialized required scans in Config node")



    def load_past_traceroutes(self):
        """Reload past traceroutes from Neo4j on startup."""
        query = "MATCH (t:Traceroute) RETURN t.target_ip AS target_ip, t.hops AS hops"
        with self.driver.session() as session:
            result = session.run(query)
            for record in result:
                target_ip = record["target_ip"]
                hops = record["hops"]
                # Rebuild relationships based on historical traceroute data
                self.store_traceroute(target_ip, hops)

    def discover_network_node(self, ip, discovery_method, timestamp):
        """
        Ensures a node is created or updated only if necessary.
        Uses an in-memory cache to avoid excessive DB writes.
        """
        if ip in self.recently_seen_nodes and (timestamp - self.recently_seen_nodes[ip]) < 10:
            return  # Skip update if last seen within 10 seconds

        existing_node = self.get_node_by_id(ip)

        if existing_node:
            if existing_node.get("last_seen", 0) < timestamp:
                with self.driver.session() as session:
                    session.run(
                        "MATCH (n:NetworkNode {id: $id}) SET n.last_seen = $timestamp",
                        id=ip, timestamp=timestamp
                    )
            self.recently_seen_nodes[ip] = timestamp  # Update cache
            return

        # Identify if the node is local, external, or the observer
        local_subnet = get_local_subnet()
        gateway_ip = get_gateway()
        local_ip = get_local_ip()

        if ip == gateway_ip:
            node_type = "router"
            color = "orange"
            role = "Router/Gateway"
        elif ip == local_ip:  # ✅ Assign scanning system as "Network Observer"
            node_type = "observer"
            color = "#00FFFF"  # Cyan for visibility
            role = "Network Observer / Scanning Node"
        elif local_subnet and ip.startswith(local_subnet):
            node_type = "device"
            color = "#0099FF"
            role = "Local Device (Traffic)"
        else:
            node_type = "external"
            color = "red"
            role = "External Node (Traffic)"

        # Assign Label
        node_data = {
            "id": ip,
            "type": node_type,
            "mac_address": "Unknown",
            "role": role,
            "color": color,
            "last_seen": timestamp
        }
        node_data["label"] = generate_node_label(node_data)

        self.upsert_network_node(node_data)
        self.recently_seen_nodes[ip] = timestamp  # Update cache

        # ✅ Ensure `CONNECTED_TO` relationship is created when the node is discovered
        self.create_relationship(gateway_ip, ip, "CONNECTED_TO", {"discovery_method": discovery_method, "timestamp": timestamp})




    def store_traffic(self, src, dst, proto, size, timestamp):
        """Ensure traffic is stored and properly connected to the network graph."""
        gateway_ip = get_gateway()
        local_ip = get_local_ip()

        # Determine actual source/destination for external traffic
        if not src.startswith("192.168.") and dst.startswith("192.168."):
            actual_src = gateway_ip  # External traffic enters through router
        else:
            actual_src = src  # Local/internal traffic remains unchanged

        if not dst.startswith("192.168.") and src.startswith("192.168."):
            actual_dst = gateway_ip  # External traffic exits through router
        else:
            actual_dst = dst  # Local/internal traffic remains unchanged

        with self.driver.session() as session:
            session.run(
                """
                MERGE (src:NetworkNode {id: $actual_src})
                ON CREATE SET src.label = "Local Device: " + $actual_src, src.last_seen = $timestamp
                ON MATCH SET src.last_seen = $timestamp

                MERGE (dst:NetworkNode {id: $actual_dst})
                ON CREATE SET dst.label = "Local Device: " + $actual_dst, dst.last_seen = $timestamp
                ON MATCH SET dst.last_seen = $timestamp

                MERGE (src)-[t:TRAFFIC]->(dst)
                ON CREATE SET t.timestamp = $timestamp, t.proto = $proto, t.size = $size
                ON MATCH SET t.timestamp = $timestamp, t.proto = $proto, t.size = $size
                """,
                actual_src=actual_src, actual_dst=actual_dst, proto=proto, size=size, timestamp=timestamp
            )

        # ✅ Ensure `CONNECTED_TO` relationships are also created
        self.create_relationship(actual_src, actual_dst, "CONNECTED_TO", {"timestamp": timestamp})

    def update_graph_with_data(self, data):
        """
        Persist structured local scan data into Neo4j.
        
        Expected payload structure:
        - data["router"]: dict with router node data.
        - data["devices"]: list of device node data.
        - data["traceroute_nodes"]: list of nodes from traceroute.
        - data["traceroute_relationships"]: list of relationships from traceroute.
        """
        now = time.time()
        
        # 1. Update Router Node
        self.upsert_network_node(data["router"])
        
        # 2. Update Local Devices and create CONNECTED_TO relationships.
        for device in data["devices"]:
            self.upsert_network_node(device)
            self.create_relationship(data["router"]["id"], device["id"], "CONNECTED_TO", {"timestamp": now})
        
        # 3. Process Traceroute Nodes and Relationships.
        for node in data["traceroute_nodes"]:
            self.upsert_network_node(node)
        for rel in data["traceroute_relationships"]:
            self.create_relationship(rel["source"], rel["target"], rel["type"], rel["properties"])


#New fetch node details. this will fetch all the node details and relationships and scan data in one call. we will cache this, and bust it only when new scan data comes in.
    def fetch_node_details(self, node_id):
        query = """
        MATCH (n {id: $node_id})

        /* 1) Gather all scans and their advanced results */
        OPTIONAL MATCH (n)<-[:RESULTS_IN]-(s:Scan)
        OPTIONAL MATCH (s)-[:HAS_ADVANCED_RESULT]->(adv:AdvancedResult)
        WITH n, s, collect(DISTINCT adv { .* }) AS advList
        /* Now group scans (with their advList) into one collection */
        WITH n,
            collect(
                DISTINCT s {
                    .*, 
                    advanced: advList
                }
            ) AS scans

        /* 2) Gather traffic edges from n -> other */
        OPTIONAL MATCH (n)-[t:TRAFFIC]->(other)
        WITH n, scans,
        // Collect all traffic edges, but only keep objects where 'other' isn't null
        [ x IN collect(
            CASE WHEN t IS NOT NULL THEN {
                other: other.id,
                proto: t.proto,
                size: t.size,
                last_seen: t.timestamp
            } END
            )
            WHERE x IS NOT NULL  // filter out any null elements
        ] AS trafficList


        /* 3) Gather traceroute hops by traversing any :TRACEROUTE_HOP paths */
        OPTIONAL MATCH path=(n)-[:TRACEROUTE_HOP*]->(hop)
        WITH n, scans, trafficList,
            collect(DISTINCT hop.id) AS tracerouteIds

        /* 4) Return a single object with all properties + aggregated data */
        RETURN n {
            .*,
            scans: scans,
            traffic: trafficList,
            tracerouteHops: tracerouteIds
        } AS nodeDetails
        """

        with self.driver.session() as session:
            record = session.run(query, node_id=node_id).single()
            return record["nodeDetails"] if record and record["nodeDetails"] else None

# Initialize the Neo4j database instance
db = Neo4jDB()
