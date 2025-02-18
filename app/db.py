from neo4j import GraphDatabase
import time
import logging
from scanners import get_gateway, get_local_ip, get_public_ip, get_local_subnet
from network_scanner import run_arp_scan, run_traceroute, scapy_port_scan, get_asn_info, get_mac
import schedule
from config import external_target

# Neo4j connection settings
NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "password"

class Neo4jDB:
    def __init__(self, uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))
        # self.init_constraints()  # Uncomment to run once if needed

    def close(self):
        self.driver.close()

    def init_constraints(self):
        """Create constraints to enforce uniqueness on node IDs."""
        with self.driver.session() as session:
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (n:NetworkNode) REQUIRE n.id IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (w:WebNode) REQUIRE w.id IS UNIQUE")
            session.run("CREATE CONSTRAINT IF NOT EXISTS FOR (s:Scan) REQUIRE s.id IS UNIQUE")

    def upsert_network_node(self, node):
        """
        Insert or update a Network Node while merging any extra properties.
        This ensures that properties like color, tracerouted, public_ip, and open_external_port are preserved.
        """
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


    def store_traceroute(self, target_ip, hops):
        """Store traceroute results in the database."""
        if not hops:
            print(f"No valid hops for {target_ip}, skipping storage.")
            return

        prev_hop = target_ip
        for hop in hops:
            # Support both dict and string types for hop
            hop_ip = hop["ip"] if isinstance(hop, dict) and "ip" in hop else hop

            node_dict = {
                "id": hop_ip,
                "label": get_asn_info(hop_ip),
                "type": "external",
                "mac_address": "Unavailable (External)",
                "role": "External Node",
                "color": "red",  # External nodes are red
                "last_seen": time.time(),
                "tracerouted": (hop_ip == target_ip)  # Mark tracerouted for the target of the traceroute
            }
            self.upsert_network_node(node_dict)
            self.create_relationship(prev_hop, hop_ip, "TRACEROUTE_HOP", {"timestamp": time.time()})
            prev_hop = hop_ip

        print(f"Stored traceroute for {target_ip}: {hops}")

    def store_port_scan(self, target_ip, ports):
        """Store port scan results and update the network node with discovered ports."""
        scan_id = f"portscan-{target_ip}-{int(time.time())}"

        # Store scan results as a separate scan node (already implemented)
        query_scan = """
        MERGE (s:Scan:PortScan {id: $scan_id})
        SET s.target = $target, s.ports = $ports, s.timestamp = $timestamp
        WITH s
        MATCH (n:NetworkNode {id: $target})
        CREATE (s)-[:RESULTS_IN]->(n)
        """
        
        # Update the NetworkNode to include discovered ports
        query_update_node = """
        MATCH (n:NetworkNode {id: $target})
        SET n.ports = $ports
        """

        with self.driver.session() as session:
            session.run(query_scan, scan_id=scan_id, target=target_ip, ports=ports, timestamp=time.time())
            session.run(query_update_node, target=target_ip, ports=ports)

        print(f"Stored port scan for {target_ip}: {ports}")



    def store_ssl_scan(self, target_ip, ssl_info):
        """Store SSL scan results separately."""
        scan_id = f"sslscan-{target_ip}-{int(time.time())}"
        query = """
        MERGE (s:Scan:SSLScan {id: $scan_id})
        SET s.target = $target, s.issuer = $issuer, s.notBefore = $notBefore, s.notAfter = $notAfter, s.timestamp = $timestamp
        WITH s
        MATCH (n:NetworkNode {id: $target})
        CREATE (s)-[:RESULTS_IN]->(n)
        """
        with self.driver.session() as session:
            session.run(query, scan_id=scan_id, target=target_ip, issuer=ssl_info["issuer"],
                        notBefore=ssl_info["notBefore"], notAfter=ssl_info["notAfter"], timestamp=time.time())
        print(f"Stored SSL scan for {target_ip}")

    def fetch_full_graph(self):
        """Retrieve all nodes and relationships, including unconnected nodes."""
        query = """
        MATCH (n) OPTIONAL MATCH (n)-[r]->(m)
        RETURN n, r, m
        """
        with self.driver.session() as session:
            result = session.run(query)
            nodes = {}
            edges = []
            for record in result:
                node_obj = record["n"]
                node = dict(node_obj)
                # Use the node's "id" property if it exists, otherwise use the internal id
                node_id = node.get("id")
                if not node_id:
                    node_id = node_obj.id  # fallback to internal id
                    node["id"] = node_id
                nodes[node_id] = node
                if record["r"]:
                    start_node = record["r"].start_node
                    end_node = record["r"].end_node
                    source_id = start_node.get("id", start_node.id)
                    target_id = end_node.get("id", end_node.id)
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
        """Ensure default gateway exists on startup."""
        gateway_ip = get_gateway() or "192.168.1.1"
        if not self.get_node_by_id(gateway_ip):
            self.upsert_network_node({
                "id": gateway_ip,
                "label": "Router/Gateway",
                "type": "router",
                "mac_address": get_mac(gateway_ip),
                "role": "Router",
                "color": "orange",  # Critical for frontend styling
                "last_seen": time.time()
            })
            logging.info("Created default gateway node on startup")

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

    def update_graph_data():
        """Scheduled update for network data, runs every 10 seconds."""
        now = time.time()
        local_ip = get_local_ip()
        gateway_ip = get_gateway()

        if gateway_ip == "Unknown":
            logging.error("Gateway IP could not be determined, skipping update.")
            return

        existing_router = db.get_node_by_id(gateway_ip)
        if existing_router and "open_external_port" in existing_router:
            open_external_port = existing_router["open_external_port"]
        else:
            external_ports = scapy_port_scan(gateway_ip, start_port=20, end_port=1024)
            open_external_port = external_ports[0] if external_ports else None

        router_node = {
            "id": gateway_ip,
            "label": "Router/Gateway",
            "type": "router",
            "mac_address": get_mac(gateway_ip),
            "role": "Router",
            "color": "orange",  # Router nodes are orange
            "last_seen": now,
            "public_ip": get_public_ip(),
            "open_external_port": open_external_port
        }
        db.upsert_network_node(router_node)
        logging.info(f"Router node updated: {router_node}")

        # Process Local Devices (from ARP Scan)
        devices = run_arp_scan()
        local_subnet = get_local_subnet()
        for device in devices:
            if device not in (local_ip, gateway_ip):
                is_local = local_subnet and device.startswith(local_subnet)
                node_dict = {
                    "id": device,
                    "label": "Local Device" if is_local else "External Device",
                    "type": "device" if is_local else "external",
                    "mac_address": get_mac(device),
                    "role": "Unknown Device" if is_local else "External Node",
                    "color": "#0099FF" if is_local else "red",  # Local devices are blue; external, red
                    "last_seen": now
                }
                db.upsert_network_node(node_dict)
                db.create_relationship(gateway_ip, device, "CONNECTED_TO", {"timestamp": now})

        # Synchronize External Target from Config stored in Neo4j
        external_target_config = db.get_config_value("external_target")
        if not external_target_config:
            external_target_config = external_target  # Fallback to default from config.py
            db.set_config_value("external_target", external_target_config)

        # Process External Nodes (Traceroute Hops)
        traceroute_hops = run_traceroute(target=external_target_config)
        prev_hop = gateway_ip
        for hop in traceroute_hops:
            hop_ip = hop["ip"] if isinstance(hop, dict) and "ip" in hop else hop
            if hop_ip != gateway_ip:
                node_dict = {
                    "id": hop_ip,
                    "label": get_asn_info(hop_ip),
                    "type": "external",
                    "mac_address": "Unavailable (External)",
                    "role": "External Node",
                    "color": "red",  # External nodes are red
                    "last_seen": now,
                    "tracerouted": (hop_ip == external_target_config)  # Mark tracerouted when appropriate
                }
                db.upsert_network_node(node_dict)
                db.create_relationship(prev_hop, hop_ip, "TRACEROUTE_HOP", {"timestamp": now})
                prev_hop = hop_ip

        logging.info("Graph data successfully updated.")

    # Schedule update to run every 10 seconds
    schedule.every(10).seconds.do(update_graph_data)

def run_scheduled_tasks():
    """Continuously run scheduled tasks (used in app.py)."""
    while True:
        schedule.run_pending()
        time.sleep(1)

# Initialize the Neo4j database instance
db = Neo4jDB()
