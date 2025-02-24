from neo4j import GraphDatabase
import time
import logging
from scanners import get_gateway, get_local_ip, get_public_ip, get_local_subnet
from network_scanner import run_arp_scan, run_traceroute, scapy_port_scan, get_asn_info, get_mac
import schedule
from config import external_target
from labeling import generate_node_label

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
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (a:ASNNode) REQUIRE a.id IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (n:NetworkNode) REQUIRE n.id IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (w:WebNode) REQUIRE w.id IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (s:Scan) REQUIRE s.id IS UNIQUE")


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

        # ✅ Step 1: Check if a scan of this type already exists for the target
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
            return None  # ✅ Prevent duplicate scan creation

        # ✅ Step 2: Generate a unique scan ID
        scan_id = f"{scan_type}-{target}-{int(time.time())}"

        # ✅ Step 3: Construct the scan node dictionary
        scan_node = {
            "id": scan_id,
            "type": scan_type,
            "target": target,
            "timestamp": time.time()
        }
        scan_node.update(additional_properties)

        # ✅ Step 4: Generate a label using a centralized function
        scan_node["label"] = generate_node_label(scan_node)

        # ✅ Step 5: Build query for inserting the scan
        extra_label_str = "".join(f":{label}" for label in extra_labels)

        query_scan = f"""
        MERGE (s:Scan{extra_label_str} {{id: $scan_id}})
        SET s += $scan_node
        """

        # ✅ Step 6: Insert the scan and create the relationship
        with self.driver.session() as session:
            session.run(query_scan, scan_id=scan_id, scan_node=scan_node)

        self.create_scan_relationship(scan_id, target)
        
        # ✅ Step 7: Update the node’s scan completion status
        self.update_scan_status(target, scan_type)

        return scan_id  # ✅ Return the scan_id if a new scan was created

        
    def update_scan_status(self, target_ip, scan_type):
        """
        Updates the scan completion status of a NetworkNode.
        If all required scans are complete, mark the node as `fully_scanned`.

        - If a port scan has been completed and no web ports (80, 443) exist, `webscan` is no longer required.
        - If a port scan has not been completed, assume `webscan` might still be needed.
        """
        required_scans = self.get_config_value("required_scans") or []

        # ✅ Step 1: Retrieve existing scan completions and open ports
        query = """
        MATCH (n:NetworkNode {id: $target_ip})
        RETURN n.ports AS ports, n.scans_completed AS scans_completed
        """
        with self.driver.session() as session:
            result = session.run(query, target_ip=target_ip)
            record = result.single()

        if not record:
            return  # No node found, exit early

        ports = record["ports"] or []  # ✅ Get open ports (if they exist)
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
        for hop in hops:
            hop_ip = hop["ip"] if isinstance(hop, dict) and "ip" in hop else hop
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



#     def update_graph_data():
#         """Scheduled update for network data, runs every 10 seconds."""
#         now = time.time()
#         local_ip = get_local_ip()
#         gateway_ip = get_gateway()

#         if gateway_ip == "Unknown":
#             logging.error("Gateway IP could not be determined, skipping update.")
#             return

#         existing_router = db.get_node_by_id(gateway_ip)
#         if existing_router and "open_external_port" in existing_router:
#             open_external_port = existing_router["open_external_port"]
#         else:
#             external_ports = scapy_port_scan(gateway_ip, start_port=20, end_port=1024)
#             open_external_port = external_ports[0] if external_ports else None

#         # Create router node data with type "router"
#         router_node = {
#             "id": gateway_ip,
#             "type": "router",
#             "mac_address": get_mac(gateway_ip),
#             "role": "Router",
#             "color": "orange",  # Router nodes are orange
#             "last_seen": now,
#             "public_ip": get_public_ip(),
#             "open_external_port": open_external_port
#         }
#         # The upsert will call generate_node_label internally.
#         db.upsert_network_node(router_node)
#         logging.info(f"Router node updated: {router_node}")

#         # Process Local Devices (from ARP Scan)
#         devices = run_arp_scan()
#         local_subnet = get_local_subnet()
#         for device in devices:
#             if device not in (local_ip, gateway_ip):
#                 is_local = local_subnet and device.startswith(local_subnet)
#                 node_dict = {
#                     "id": device,
#                     "type": "device" if is_local else "external",
#                     "mac_address": get_mac(device),
#                     "role": "Unknown Device" if is_local else "External Node",
#                     "color": "#0099FF" if is_local else "red",  # Local devices are blue; external, red
#                     "last_seen": now
#                 }
#                 db.upsert_network_node(node_dict)
#                 db.create_relationship(gateway_ip, device, "CONNECTED_TO", {"timestamp": now})

#         # Synchronize External Target from Config stored in Neo4j
#         external_target_config = db.get_config_value("external_target")
#         if not external_target_config:
#             external_target_config = external_target  # Fallback to default from config.py
#             db.set_config_value("external_target", external_target_config)

#         # Process External Nodes (Traceroute Hops)
#         traceroute_hops = run_traceroute(target=external_target_config)
#         prev_hop = gateway_ip
#         for hop in traceroute_hops:
#             hop_ip = hop["ip"] if isinstance(hop, dict) and "ip" in hop else hop
#             if hop_ip != gateway_ip:
#                 node_dict = {
#                     "id": hop_ip,
#                     "type": "external",
#                     "mac_address": "Unavailable (External)",
#                     "role": "External Node",
#                     "color": "red",  # External nodes are red
#                     "last_seen": now,
#                     "tracerouted": (hop_ip == external_target_config)
#                 }
#                 # Optionally include ASN info if available (only after a BGP scan)
#                 asn_info = get_asn_info(hop_ip)
#                 if asn_info:
#                     node_dict["asn_info"] = asn_info
#                 db.upsert_network_node(node_dict)
#                 db.create_relationship(prev_hop, hop_ip, "TRACEROUTE_HOP", {"timestamp": now, "traceroute_mode": "local"})
#                 prev_hop = hop_ip

#         logging.info("Graph data successfully updated.")

#     # Schedule update to run every 10 seconds
#     schedule.every(10).seconds.do(update_graph_data)


# def run_scheduled_tasks():
#     """Continuously run scheduled tasks (used in app.py)."""
#     while True:
#         schedule.run_pending()
#         time.sleep(1)

# Initialize the Neo4j database instance
db = Neo4jDB()
