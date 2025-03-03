# genes.py
import json
import time
import random
import logging
from collections import defaultdict

class NodeGeneticSystem:
    """
    Responsible for generating, managing, and evolving genetic traits
    for network nodes based on their properties and relationships.
    """
    
    def __init__(self, db_connection):
        self.db = db_connection
        self.gene_cache = {}  # In-memory cache of recently accessed genes
        self.cache_expiration = 300  # 5 minutes cache expiration
    
    def get_node_genes(self, node_id):
        """
        Main entry point - gets or generates genes for a node.
        First checks cache, then DB, then generates new genes if needed.
        """
        # Check our in-memory cache first
        cache_key = f"genes_{node_id}"
        current_time = time.time()
        
        if cache_key in self.gene_cache:
            cached_data = self.gene_cache[cache_key]
            if current_time - cached_data["timestamp"] < self.cache_expiration:
                logging.info(f"Gene cache hit for {node_id}")
                return cached_data["genes"]
        
        # Not in cache, check database
        stored_genes = self.retrieve_stored_genes(node_id)
        if stored_genes:
            # Update cache
            self.gene_cache[cache_key] = {
                "genes": stored_genes,
                "timestamp": current_time
            }
            return stored_genes
        
        # No genes found, generate new ones
        logging.info(f"Generating new genes for {node_id}")
        
        # Fetch comprehensive node data
        node_data = self.db.fetch_node_details(node_id)
        if not node_data:
            logging.error(f"No node data found for {node_id}")
            return self._generate_default_genes(node_id)
        
        # Generate new genes based on node data
        new_genes = self.generate_genes_from_node_data(node_data)
        
        # Save to database for persistence
        self.store_genes(node_id, new_genes)
        
        # Update cache
        self.gene_cache[cache_key] = {
            "genes": new_genes,
            "timestamp": current_time
        }
        
        return new_genes
    
    def retrieve_stored_genes(self, node_id):
        """Retrieve previously stored genes from Neo4j"""
        query = """
        MATCH (n {id: $node_id})
        RETURN n.genes AS genes
        """
        try:
            with self.db.driver.session() as session:
                result = session.run(query, node_id=node_id)
                record = result.single()
                if record and record["genes"]:
                    return json.loads(record["genes"])
                return None
        except Exception as e:
            logging.error(f"Error retrieving genes for {node_id}: {e}")
            return None
    
    def store_genes(self, node_id, genes):
        """Store node genes in Neo4j for persistence"""
        query = """
        MATCH (n {id: $node_id})
        SET n.genes = $genes_json
        """
        try:
            genes_json = json.dumps(genes)
            with self.db.driver.session() as session:
                session.run(query, node_id=node_id, genes_json=genes_json)
            logging.info(f"Stored genes for {node_id}")
            return True
        except Exception as e:
            logging.error(f"Error storing genes for {node_id}: {e}")
            return False
    
    def _generate_default_genes(self, node_id):
        """Generate a basic gene set when we have no node data"""
        return {
            "id": node_id,
            "ca_rules": {
                "birth": [3],
                "survival": [2, 3],
                "neighbors": "moore"
            },
            "visual": {
                "hue_base": random.randint(0, 360),
                "pattern_type": "random",
                "texture_density": 0.5
            },
            "behavior": {
                "mutation_rate": 0.05,
                "evolution_speed": 1.0,
                "interaction_strength": 0.5
            },
            "special_traits": {},
            "metadata": {
                "generation": 1,
                "creation_time": time.time(),
                "parent_ids": [],
                "gene_history": []
            }
        }
    
    def generate_genes_from_node_data(self, node_data):
        """
        Generate a complete gene set based on comprehensive node data.
        This is where the "primordial soup" analogy comes alive.
        """
        genes = self._generate_default_genes(node_data["id"])
        
        # Extract key aspects of node data that will influence genes
        self._analyze_ports(node_data, genes)
        self._analyze_asn(node_data, genes)
        self._analyze_relationships(node_data, genes)
        self._analyze_scan_status(node_data, genes)
        self._analyze_node_type(node_data, genes)
        self._analyze_traffic(node_data, genes)
        self._analyze_web_properties(node_data, genes)
        
        # Compute emergent traits based on combinations of factors
        self._derive_emergent_traits(node_data, genes)
        
        # Final refinement pass to ensure consistency
        self._normalize_gene_values(genes)
        
        # Add creation signature
        genes["metadata"]["creation_signature"] = self._generate_creation_signature(node_data, genes)
        
        return genes
    
    # === Analysis functions - each analyzes a specific aspect of node data ===
    
    def _analyze_ports(self, node_data, genes):
        """Analyze open ports to influence genetic traits"""
        ports = node_data.get("ports", [])
        if not ports:
            return
        
        # Group ports by service type
        service_ports = {
            "web": [80, 443, 8080, 8443, 8000, 8888],
            "database": [3306, 5432, 1433, 1521, 27017, 6379, 9200],
            "mail": [25, 465, 587, 110, 995, 143, 993],
            "file": [20, 21, 22, 445, 139],
            "remote": [22, 23, 3389, 5900],
            "name": [53, 389]
        }
        
        service_counts = defaultdict(int)
        for port in ports:
            for service, port_list in service_ports.items():
                if port in port_list:
                    service_counts[service] += 1
        
        # More ports = more complex system = more complex CA rules
        total_ports = len(ports)
        
        # Ports influence birth rules (what brings cells to life)
        if total_ports > 10:
            # Many ports: add birth rules for higher complexity
            genes["ca_rules"]["birth"] = sorted(list(set(genes["ca_rules"]["birth"] + [3, 6])))
        elif total_ports > 5:
            # Moderate ports: standard HighLife rule
            genes["ca_rules"]["birth"] = [3, 6]
        
        # Web servers: special visual patterns
        if service_counts["web"] > 0:
            genes["visual"]["pattern_type"] = "web_pattern"
            genes["ca_rules"]["birth"] = sorted(list(set(genes["ca_rules"]["birth"] + [3, 6])))
            
            # Higher density for more accessible web servers
            web_port_count = service_counts["web"]
            genes["visual"]["texture_density"] = min(0.9, 0.5 + web_port_count * 0.1)
            
            # Add special traits
            genes["special_traits"]["web_server"] = True
            genes["special_traits"]["content_generator"] = True
        
        # Database servers: more stable patterns with higher survival
        if service_counts["database"] > 0:
            genes["ca_rules"]["survival"] = sorted(list(set(genes["ca_rules"]["survival"] + [4])))
            genes["visual"]["pattern_type"] = "database_pattern"
            genes["special_traits"]["data_storage"] = True
            
            # Database nodes are more stable but slower to evolve
            genes["behavior"]["evolution_speed"] = 0.7
            genes["behavior"]["mutation_rate"] = 0.02
            
            # Database coloration tends toward blues/greens
            genes["visual"]["hue_base"] = random.randint(180, 240)
        
        # Remote access services: higher evolution speed
        if service_counts["remote"] > 0:
            genes["behavior"]["evolution_speed"] = 1.3
            genes["special_traits"]["remote_access"] = True
            
            # Remote access often means more interaction capability
            genes["behavior"]["interaction_strength"] = 0.8
    
    def _analyze_asn(self, node_data, genes):
        """Analyze ASN information to influence genetic traits"""
        # Check for ASN scans in the node data
        asn_scan = None
        if "scans" in node_data:
            for scan in node_data["scans"]:
                if scan.get("type") == "bgpscan" and scan.get("asn"):
                    asn_scan = scan
                    break
        
        # If no ASN scan found directly, check direct asn property
        asn_value = None
        if asn_scan:
            asn_value = asn_scan.get("asn")
        elif "asn" in node_data:
            asn_value = node_data["asn"]
        
        if not asn_value:
            return
        
        # ASN nodes have broader reach due to internet presence
        genes["ca_rules"]["birth"] = sorted(list(set(genes["ca_rules"]["birth"] + [3, 6])))
        genes["ca_rules"]["survival"] = sorted(list(set(genes["ca_rules"]["survival"] + [3, 4])))
        
        # ASN nodes are more dynamic
        genes["behavior"]["evolution_speed"] = 1.5
        
        # Special traits for ASN nodes
        genes["special_traits"]["internet_connected"] = True
        genes["special_traits"]["asn_node"] = True
        genes["special_traits"]["asn_value"] = asn_value
        
        # ASN diversity inspires genetic variation
        genes["behavior"]["mutation_rate"] = 0.08
        
        # ASN nodes tend to be more orange/red (warmer colors)
        genes["visual"]["hue_base"] = random.randint(0, 60)
        
        # Check for prefixes and peers to influence complexity
        prefixes = []
        peers = []
        
        if asn_scan:
            prefixes = asn_scan.get("prefixes", [])
            peers = asn_scan.get("peers", [])
        
        # More prefixes/peers = more complex and interconnected
        if len(prefixes) > 10 or len(peers) > 5:
            genes["special_traits"]["major_network_presence"] = True
            genes["ca_rules"]["birth"] = sorted(list(set(genes["ca_rules"]["birth"] + [3, 6, 7])))
            genes["behavior"]["interaction_strength"] = 0.9
    
    def _analyze_relationships(self, node_data, genes):
        """Analyze node relationships to influence genetic traits"""
        # Connected_to relationships show network integration
        connected_to_count = node_data.get("connected_to_count", 0)
        traceroute_hop_count = node_data.get("traceroute_hop_count", 0)
        
        # Higher connectivity = more interaction potential
        if connected_to_count > 0:
            genes["behavior"]["interaction_strength"] = min(1.0, 0.4 + (connected_to_count * 0.05))
        
        # Traceroute paths show internet routing pathways
        if traceroute_hop_count > 0:
            genes["special_traits"]["routing_node"] = True
            
            # More hops = more central to routing
            if traceroute_hop_count > 3:
                genes["special_traits"]["central_router"] = True
                genes["behavior"]["evolution_speed"] = 1.2
        
        # Calculate ratio between connected nodes and traceroute hops
        # This gives us a measure of how much the node is a "connector" vs. a "pass-through"
        if connected_to_count > 0 and traceroute_hop_count > 0:
            connector_ratio = connected_to_count / (connected_to_count + traceroute_hop_count)
            
            # High ratio = many connections, few hops = hub node
            if connector_ratio > 0.7:
                genes["special_traits"]["hub_node"] = True
                genes["ca_rules"]["birth"] = sorted(list(set(genes["ca_rules"]["birth"] + [3, 6])))
                genes["ca_rules"]["survival"] = sorted(list(set(genes["ca_rules"]["survival"] + [2, 3, 4])))
            
            # Low ratio = few connections, many hops = pass-through node
            elif connector_ratio < 0.3:
                genes["special_traits"]["transit_node"] = True
                genes["ca_rules"]["birth"] = sorted(list(set(genes["ca_rules"]["birth"] + [3])))
                genes["ca_rules"]["survival"] = sorted(list(set(genes["ca_rules"]["survival"] + [3, 4, 5])))
    
    def _analyze_scan_status(self, node_data, genes):
        """Analyze node scan status to influence genetic traits"""
        # Fully scanned nodes have complete information and are more stable
        fully_scanned = node_data.get("fully_scanned", False)
        
        if fully_scanned:
            genes["special_traits"]["fully_analyzed"] = True
            genes["ca_rules"]["survival"] = sorted(list(set(genes["ca_rules"]["survival"] + [2, 3, 4])))
            genes["behavior"]["evolution_speed"] = 0.9  # Slower evolution for well-known nodes
        else:
            # Partially scanned nodes are more dynamic and unpredictable
            genes["behavior"]["mutation_rate"] = 0.1
        
        # Check if specific scan types have been performed
        scans_completed = node_data.get("scans_completed", [])
        
        if "portscan" in scans_completed:
            genes["special_traits"]["port_analyzed"] = True
        
        if "webscan" in scans_completed:
            genes["special_traits"]["web_analyzed"] = True
            
        if "bgpscan" in scans_completed:
            genes["special_traits"]["routing_analyzed"] = True
    
    def _analyze_node_type(self, node_data, genes):
        """Analyze node type to influence genetic traits"""
        node_type = node_data.get("type", "unknown")
        
        if node_type == "router":
            # Routers are central, stable nodes with high connectivity
            genes["special_traits"]["router"] = True
            genes["ca_rules"]["survival"] = sorted(list(set(genes["ca_rules"]["survival"] + [1, 2, 3, 4, 5])))
            genes["visual"]["pattern_type"] = "router_pattern"
            genes["behavior"]["interaction_strength"] = 0.9
            
            # Router nodes tend toward oranges (visibility)
            genes["visual"]["hue_base"] = random.randint(20, 40)
            
        elif node_type == "device":
            # Local devices are client endpoints
            genes["special_traits"]["endpoint"] = True
            genes["visual"]["pattern_type"] = "device_pattern"
            
            # Local devices have more random behavior
            genes["behavior"]["mutation_rate"] = 0.07
            
            # Local devices tend toward blues/greens
            genes["visual"]["hue_base"] = random.randint(180, 240)
            
        elif node_type == "observer":
            # Observer nodes are scanning systems
            genes["special_traits"]["observer"] = True
            genes["special_traits"]["scanner"] = True
            genes["visual"]["pattern_type"] = "observer_pattern"
            
            # Observer nodes tend toward purples (mystical)
            genes["visual"]["hue_base"] = random.randint(270, 330)
            
        elif node_type == "external":
            # External nodes represent internet destinations
            genes["special_traits"]["external"] = True
            genes["visual"]["pattern_type"] = "external_pattern"
            
            # External nodes are more prone to change
            genes["behavior"]["mutation_rate"] = 0.09
            genes["behavior"]["evolution_speed"] = 1.2
            
            # External nodes tend toward reds
            genes["visual"]["hue_base"] = random.randint(0, 20)
            
        elif node_type == "web":
            # Web nodes are content hosts
            genes["special_traits"]["web"] = True
            genes["visual"]["pattern_type"] = "web_pattern"
            
            # Web nodes are highly interactive
            genes["behavior"]["interaction_strength"] = 0.85
            
            # Web nodes tend toward cyans (web color)
            genes["visual"]["hue_base"] = random.randint(170, 190)
            
        elif node_type == "asn":
            # ASN nodes represent autonomous systems
            genes["special_traits"]["asn"] = True
            genes["visual"]["pattern_type"] = "asn_pattern"
            
            # ASN nodes have complex behavior
            genes["ca_rules"]["birth"] = sorted(list(set(genes["ca_rules"]["birth"] + [3, 6, 7])))
            genes["ca_rules"]["survival"] = sorted(list(set(genes["ca_rules"]["survival"] + [2, 3, 4])))
            
            # ASN nodes tend toward yellows (institutional)
            genes["visual"]["hue_base"] = random.randint(50, 70)
    
    def _analyze_traffic(self, node_data, genes):
        """Analyze traffic data to influence genetic traits"""
        traffic = node_data.get("traffic", [])
        
        if not traffic:
            return
        
        # More traffic = more activity = more evolution
        traffic_volume = len(traffic)
        
        if traffic_volume > 10:
            genes["behavior"]["evolution_speed"] = min(1.8, 1.0 + (traffic_volume * 0.02))
            genes["special_traits"]["high_traffic"] = True
        
        # Calculate average packet size
        total_size = 0
        for t in traffic:
            if "size" in t:
                total_size += t["size"]
        
        if traffic_volume > 0:
            avg_size = total_size / traffic_volume
            
            # Larger packets = more data = more complexity
            if avg_size > 1000:
                genes["special_traits"]["large_data_transfer"] = True
                genes["ca_rules"]["birth"] = sorted(list(set(genes["ca_rules"]["birth"] + [3, 7])))
        
        # Analyze protocol distribution
        protocol_counts = defaultdict(int)
        for t in traffic:
            if "proto" in t:
                protocol_counts[t["proto"]] += 1
        
        # ICMP traffic indicates ping/traceroute behavior
        if protocol_counts.get(1, 0) > 0:  # ICMP is proto 1
            genes["special_traits"]["ping_traceroute"] = True
        
        # TCP traffic (proto 6) indicates connection-oriented services
        if protocol_counts.get(6, 0) > 5:
            genes["special_traits"]["connection_oriented"] = True
            genes["ca_rules"]["survival"] = sorted(list(set(genes["ca_rules"]["survival"] + [2, 3])))
        
        # UDP traffic (proto 17) indicates connectionless services
        if protocol_counts.get(17, 0) > 5:
            genes["special_traits"]["connectionless"] = True
            genes["ca_rules"]["birth"] = sorted(list(set(genes["ca_rules"]["birth"] + [3, 8])))
    
    def _analyze_web_properties(self, node_data, genes):
        """Analyze web-related properties to influence genetic traits"""
        # Look for web scans
        web_scan = None
        if "scans" in node_data:
            for scan in node_data["scans"]:
                if scan.get("type") == "webscan":
                    web_scan = scan
                    break
        
        if not web_scan:
            return
        
        genes["special_traits"]["web_server"] = True
        
        # Web server with a title has content
        if "title" in web_scan and web_scan["title"] != "Unknown":
            genes["special_traits"]["titled_content"] = True
            genes["visual"]["pattern_type"] = "content_pattern"
        
        # SSL-secured websites have different security traits
        if web_scan.get("url", "").startswith("https"):
            genes["special_traits"]["secured"] = True
            genes["ca_rules"]["survival"] = sorted(list(set(genes["ca_rules"]["survival"] + [4])))
            genes["behavior"]["mutation_rate"] = 0.03  # Lower mutation for secure sites
        
        # Content type influences patterns
        content_type = web_scan.get("content_type", "")
        if "text/html" in content_type:
            genes["special_traits"]["html_content"] = True
        elif "application/json" in content_type:
            genes["special_traits"]["api_endpoint"] = True
        elif "image" in content_type:
            genes["special_traits"]["image_server"] = True
    
    def _derive_emergent_traits(self, node_data, genes):
        """Derive emergent traits based on combinations of factors"""
        special_traits = genes["special_traits"]
        
        # Internet Gateway: router + external + high traffic + asn
        if (special_traits.get("router", False) and 
            special_traits.get("external", False) and
            special_traits.get("high_traffic", False) and
            "asn_value" in special_traits):
            
            special_traits["internet_gateway"] = True
            genes["ca_rules"]["birth"] = [3, 6, 7, 8]
            genes["ca_rules"]["survival"] = [2, 3, 4, 5]
            genes["behavior"]["evolution_speed"] = 1.5
            genes["visual"]["pattern_type"] = "gateway_pattern"
        
        # Load Balancer: high traffic + multiple web servers + connection_oriented
        if (special_traits.get("high_traffic", False) and
            special_traits.get("web_server", False) and
            special_traits.get("connection_oriented", False) and
            node_data.get("connected_to_count", 0) > 5):
            
            special_traits["load_balancer"] = True
            genes["ca_rules"]["birth"] = [3, 5, 7]
            genes["ca_rules"]["survival"] = [1, 3, 5, 7]
            genes["behavior"]["evolution_speed"] = 1.3
            genes["visual"]["pattern_type"] = "load_balancer_pattern"
        
        # Database Cluster: database + high traffic + multiple connections
        if (special_traits.get("data_storage", False) and
            special_traits.get("high_traffic", False) and
            node_data.get("connected_to_count", 0) > 3):
            
            special_traits["database_cluster"] = True
            genes["ca_rules"]["birth"] = [3, 6]
            genes["ca_rules"]["survival"] = [2, 3, 4, 5]
            genes["behavior"]["evolution_speed"] = 0.8
            genes["visual"]["pattern_type"] = "database_cluster_pattern"
        
        # Content Delivery Node: web server + external + high traffic
        if (special_traits.get("web_server", False) and
            special_traits.get("external", False) and
            special_traits.get("high_traffic", False)):
            
            special_traits["content_delivery"] = True
            genes["ca_rules"]["birth"] = [3, 6, 7]
            genes["ca_rules"]["survival"] = [2, 3]
            genes["behavior"]["evolution_speed"] = 1.4
            genes["visual"]["pattern_type"] = "cdn_pattern"
        
        # IoT Device: device + low ports + connectionless
        if (special_traits.get("endpoint", False) and
            len(node_data.get("ports", [])) < 3 and
            special_traits.get("connectionless", False)):
            
            special_traits["iot_device"] = True
            genes["ca_rules"]["birth"] = [3, 4]
            genes["ca_rules"]["survival"] = [2, 3]
            genes["behavior"]["mutation_rate"] = 0.02
            genes["visual"]["pattern_type"] = "iot_pattern"
    
    def _normalize_gene_values(self, genes):
        """Ensure gene values are within expected ranges"""
        # Ensure birth/survival rules are valid
        genes["ca_rules"]["birth"] = sorted(list(set([r for r in genes["ca_rules"]["birth"] if 0 < r <= 8])))
        genes["ca_rules"]["survival"] = sorted(list(set([r for r in genes["ca_rules"]["survival"] if 0 < r <= 8])))
        
        # If empty, set defaults
        if not genes["ca_rules"]["birth"]:
            genes["ca_rules"]["birth"] = [3]
        if not genes["ca_rules"]["survival"]:
            genes["ca_rules"]["survival"] = [2, 3]
        
        # Ensure behavior values are within range
        genes["behavior"]["mutation_rate"] = max(0.01, min(0.2, genes["behavior"]["mutation_rate"]))
        genes["behavior"]["evolution_speed"] = max(0.1, min(2.0, genes["behavior"]["evolution_speed"]))
        genes["behavior"]["interaction_strength"] = max(0.1, min(1.0, genes["behavior"]["interaction_strength"]))
        
        # Ensure visual values are sensible
        genes["visual"]["hue_base"] = genes["visual"]["hue_base"] % 360
        genes["visual"]["texture_density"] = max(0.1, min(1.0, genes["visual"]["texture_density"]))
    
    def _generate_creation_signature(self, node_data, genes):
        """Generate a unique signature based on the node's properties"""
        # Simple hash-like signature based on key properties
        components = [
            node_data.get("id", "unknown"),
            node_data.get("type", "unknown"),
            str(len(node_data.get("ports", []))),
            str(node_data.get("connected_to_count", 0)),
            str(time.time())
        ]
        
        signature = "_".join(components)
        return signature
    
    def evolve_genes_from_interaction(self, source_id, target_id, interaction_type):
        """
        Evolve genes based on interaction between two nodes.
        This is called when nodes interact in the network.
        """
        source_genes = self.get_node_genes(source_id)
        target_genes = self.get_node_genes(target_id)
        
        if not source_genes or not target_genes:
            logging.warning(f"Cannot evolve genes: missing genes for {source_id} or {target_id}")
            return False
        
        # Calculate interaction strength
        source_strength = source_genes["behavior"]["interaction_strength"]
        target_strength = target_genes["behavior"]["interaction_strength"]
        
        # Stronger interaction types have more influence
        type_multiplier = {
            "CONNECTED_TO": 1.0,
            "TRACEROUTE_HOP": 0.5,
            "HOSTS": 1.5,
            "BGP_PEER": 1.2,
            "TRAFFIC": 0.8
        }.get(interaction_type, 0.3)
        
        interaction_power = source_strength * target_strength * type_multiplier
        
        # Only evolve if interaction is powerful enough
        if interaction_power < 0.2:
            logging.info(f"Interaction too weak to trigger evolution: {interaction_power}")
            return False
        
        # Crossover rate based on interaction power
        crossover_rate = min(0.8, interaction_power)
        
        # Mutation rate based on source and target rates
        mutation_rate = (source_genes["behavior"]["mutation_rate"] + 
                        target_genes["behavior"]["mutation_rate"]) / 2
        
        # Create new gene sets by crossing over source and target
        new_source_genes = self._crossover_genes(source_genes, target_genes, crossover_rate)
        new_target_genes = self._crossover_genes(target_genes, source_genes, crossover_rate)
        
        # Apply mutations
        new_source_genes = self._mutate_genes(new_source_genes, mutation_rate)
        new_target_genes = self._mutate_genes(new_target_genes, mutation_rate)
        
        # Update generation metadata
        new_source_genes["metadata"]["generation"] += 1
        new_source_genes["metadata"]["parent_ids"] = sorted(list(set(
            new_source_genes["metadata"].get("parent_ids", []) + [target_id]
        )))
        
        new_target_genes["metadata"]["generation"] += 1
        new_target_genes["metadata"]["parent_ids"] = sorted(list(set(
            new_target_genes["metadata"].get("parent_ids", []) + [source_id]
        )))
        
        # Record interaction in gene history
        evolution_record = {
            "timestamp": time.time(),
            "interaction_type": interaction_type,
            "interaction_power": interaction_power,
            "partner_id": target_id
        }
        new_source_genes["metadata"]["gene_history"] = new_source_genes["metadata"].get("gene_history", [])
        new_source_genes["metadata"]["gene_history"].append(evolution_record)
        
        evolution_record_target = {
            "timestamp": time.time(),
            "interaction_type": interaction_type,
            "interaction_power": interaction_power,
            "partner_id": source_id
        }
        new_target_genes["metadata"]["gene_history"] = new_target_genes["metadata"].get("gene_history", [])
        new_target_genes["metadata"]["gene_history"].append(evolution_record_target)
        
        # Save evolved genes
        self.store_genes(source_id, new_source_genes)
        self.store_genes(target_id, new_target_genes)
        
        # Update cache
        self.gene_cache[f"genes_{source_id}"] = {
            "genes": new_source_genes,
            "timestamp": time.time()
        }
        self.gene_cache[f"genes_{target_id}"] = {
            "genes": new_target_genes,
            "timestamp": time.time()
        }
        
        logging.info(f"Evolution complete between {source_id} and {target_id}")
        return True
        
    def _crossover_genes(self, genes1, genes2, crossover_rate):
        """
        Perform genetic crossover between two gene sets.
        Returns a new gene set with traits from both parents.
        """
        child_genes = json.loads(json.dumps(genes1))  # Deep copy
        
        # CA Rules crossover
        if random.random() < crossover_rate:
            # Mathematical combination of birth rules
            birth1 = set(genes1["ca_rules"]["birth"])
            birth2 = set(genes2["ca_rules"]["birth"])
            
            # Different crossover strategies
            if random.random() < 0.5:
                # Union with probability
                union = birth1.union(birth2)
                child_birth = []
                for rule in range(1, 9):
                    if rule in birth1 and rule in birth2:
                        # Both parents have this rule - definitely keep it
                        child_birth.append(rule)
                    elif rule in union:
                        # Only one parent has it - keep with probability
                        if random.random() < 0.7:
                            child_birth.append(rule)
            else:
                # Intersection plus probabilistic extras
                intersection = birth1.intersection(birth2)
                child_birth = list(intersection)
                
                # Add some unique rules from either parent with low probability
                unique1 = birth1.difference(birth2)
                unique2 = birth2.difference(birth1)
                
                for rule in unique1:
                    if random.random() < 0.3:
                        child_birth.append(rule)
                
                for rule in unique2:
                    if random.random() < 0.3:
                        child_birth.append(rule)
            
            child_genes["ca_rules"]["birth"] = sorted(child_birth) if child_birth else [3]  # Default if empty
        
        # Similar approach for survival rules
        if random.random() < crossover_rate:
            survival1 = set(genes1["ca_rules"]["survival"])
            survival2 = set(genes2["ca_rules"]["survival"])
            
            if random.random() < 0.5:
                # Union with probability
                union = survival1.union(survival2)
                child_survival = []
                for rule in range(1, 9):
                    if rule in survival1 and rule in survival2:
                        child_survival.append(rule)
                    elif rule in union:
                        if random.random() < 0.7:
                            child_survival.append(rule)
            else:
                # Intersection plus probabilistic extras
                intersection = survival1.intersection(survival2)
                child_survival = list(intersection)
                
                # Add some unique rules from either parent
                unique1 = survival1.difference(survival2)
                unique2 = survival2.difference(survival1)
                
                for rule in unique1:
                    if random.random() < 0.3:
                        child_survival.append(rule)
                
                for rule in unique2:
                    if random.random() < 0.3:
                        child_survival.append(rule)
            
            child_genes["ca_rules"]["survival"] = sorted(child_survival) if child_survival else [2, 3]
        
        # Neighborhood crossover (simple swap)
        if random.random() < crossover_rate:
            child_genes["ca_rules"]["neighbors"] = genes2["ca_rules"]["neighbors"]
        
        # Visual genes crossover
        if random.random() < crossover_rate:
            # Pattern type (direct swap)
            if random.random() < 0.5:
                child_genes["visual"]["pattern_type"] = genes2["visual"]["pattern_type"]
            
            # Hue base (blend or swap)
            if random.random() < 0.7:
                # Blend - take a weighted average of the hues
                hue1 = genes1["visual"]["hue_base"]
                hue2 = genes2["visual"]["hue_base"]
                
                # Special handling for hue wrapping around 360
                if abs(hue1 - hue2) > 180:
                    # Wrapping case
                    if hue1 > hue2:
                        hue2 += 360
                    else:
                        hue1 += 360
                
                # Weighted blend
                weight = random.random()
                blended_hue = (hue1 * weight + hue2 * (1 - weight)) % 360
                child_genes["visual"]["hue_base"] = blended_hue
            else:
                # Direct swap
                child_genes["visual"]["hue_base"] = genes2["visual"]["hue_base"]
            
            # Texture density (blend)
            density1 = genes1["visual"]["texture_density"]
            density2 = genes2["visual"]["texture_density"]
            weight = random.random()
            child_genes["visual"]["texture_density"] = density1 * weight + density2 * (1 - weight)
        
        # Behavior genes crossover
        if random.random() < crossover_rate:
            # Mutation rate (blend)
            rate1 = genes1["behavior"]["mutation_rate"]
            rate2 = genes2["behavior"]["mutation_rate"]
            weight = random.random()
            child_genes["behavior"]["mutation_rate"] = rate1 * weight + rate2 * (1 - weight)
            
            # Evolution speed (blend)
            speed1 = genes1["behavior"]["evolution_speed"]
            speed2 = genes2["behavior"]["evolution_speed"]
            weight = random.random()
            child_genes["behavior"]["evolution_speed"] = speed1 * weight + speed2 * (1 - weight)
            
            # Interaction strength (blend)
            strength1 = genes1["behavior"]["interaction_strength"]
            strength2 = genes2["behavior"]["interaction_strength"]
            weight = random.random()
            child_genes["behavior"]["interaction_strength"] = strength1 * weight + strength2 * (1 - weight)
        
        # Special traits crossover (combine traits from both parents)
        if random.random() < crossover_rate:
            for trait, value in genes2["special_traits"].items():
                # For boolean traits, take with probability
                if isinstance(value, bool):
                    if random.random() < 0.5:
                        child_genes["special_traits"][trait] = value
                # For numeric traits, blend
                elif isinstance(value, (int, float)):
                    if trait in child_genes["special_traits"] and isinstance(child_genes["special_traits"][trait], (int, float)):
                        # If both have the trait, blend
                        weight = random.random()
                        child_genes["special_traits"][trait] = child_genes["special_traits"][trait] * weight + value * (1 - weight)
                    else:
                        # Otherwise, take with probability
                        if random.random() < 0.5:
                            child_genes["special_traits"][trait] = value
                # For string traits, take directly
                else:
                    if random.random() < 0.5:
                        child_genes["special_traits"][trait] = value
        
        return child_genes

    def _mutate_genes(self, genes, mutation_rate):
        """
        Apply random mutations to gene set based on the mutation rate.
        Each gene has a small chance of being modified.
        """
        # Deep copy to avoid modifying the original
        mutated_genes = json.loads(json.dumps(genes))
        
        # === CA Rules Mutations ===
        
        # Birth rules mutations
        if random.random() < mutation_rate:
            # Decide whether to add or remove a rule
            action = random.choice(["add", "remove"])
            
            if action == "add" and len(mutated_genes["ca_rules"]["birth"]) < 8:
                # Add a random rule that's not already present
                available_rules = [r for r in range(1, 9) if r not in mutated_genes["ca_rules"]["birth"]]
                if available_rules:
                    new_rule = random.choice(available_rules)
                    mutated_genes["ca_rules"]["birth"].append(new_rule)
                    mutated_genes["ca_rules"]["birth"].sort()
            
            elif action == "remove" and len(mutated_genes["ca_rules"]["birth"]) > 1:
                # Remove a random rule
                rule_to_remove = random.choice(mutated_genes["ca_rules"]["birth"])
                mutated_genes["ca_rules"]["birth"].remove(rule_to_remove)
        
        # Survival rules mutations (similar to birth)
        if random.random() < mutation_rate:
            action = random.choice(["add", "remove"])
            
            if action == "add" and len(mutated_genes["ca_rules"]["survival"]) < 8:
                available_rules = [r for r in range(1, 9) if r not in mutated_genes["ca_rules"]["survival"]]
                if available_rules:
                    new_rule = random.choice(available_rules)
                    mutated_genes["ca_rules"]["survival"].append(new_rule)
                    mutated_genes["ca_rules"]["survival"].sort()
            
            elif action == "remove" and len(mutated_genes["ca_rules"]["survival"]) > 1:
                rule_to_remove = random.choice(mutated_genes["ca_rules"]["survival"])
                mutated_genes["ca_rules"]["survival"].remove(rule_to_remove)
        
        # Neighborhood type mutation
        if random.random() < mutation_rate * 0.5:  # Less likely to change
            current = mutated_genes["ca_rules"]["neighbors"]
            mutated_genes["ca_rules"]["neighbors"] = "von_neumann" if current == "moore" else "moore"
        
        # === Visual Mutations ===
        
        # Hue base mutation
        if random.random() < mutation_rate:
            # Small drift in hue
            drift = random.gauss(0, 20)  # Standard deviation of 20 degrees
            mutated_genes["visual"]["hue_base"] = (mutated_genes["visual"]["hue_base"] + drift) % 360
        
        # Pattern type mutation
        if random.random() < mutation_rate * 0.3:  # Rarer mutation
            pattern_types = [
                "random", "glider_factory", "stable_core", "oscillator", 
                "web_pattern", "router_pattern", "database_pattern", "external_pattern"
            ]
            mutated_genes["visual"]["pattern_type"] = random.choice(pattern_types)
        
        # Texture density mutation
        if random.random() < mutation_rate:
            # Small change in density
            drift = random.gauss(0, 0.1)  # Standard deviation of 0.1
            new_density = mutated_genes["visual"]["texture_density"] + drift
            mutated_genes["visual"]["texture_density"] = max(0.1, min(1.0, new_density))
        
        # === Behavior Mutations ===
        
        # Mutation rate (meta-mutation)
        if random.random() < mutation_rate:
            drift = random.gauss(0, 0.01)
            new_rate = mutated_genes["behavior"]["mutation_rate"] + drift
            mutated_genes["behavior"]["mutation_rate"] = max(0.01, min(0.2, new_rate))
        
        # Evolution speed
        if random.random() < mutation_rate:
            drift = random.gauss(0, 0.1)
            new_speed = mutated_genes["behavior"]["evolution_speed"] + drift
            mutated_genes["behavior"]["evolution_speed"] = max(0.1, min(2.0, new_speed))
        
        # Interaction strength
        if random.random() < mutation_rate:
            drift = random.gauss(0, 0.05)
            new_strength = mutated_genes["behavior"]["interaction_strength"] + drift
            mutated_genes["behavior"]["interaction_strength"] = max(0.1, min(1.0, new_strength))
        
        # === Special Traits Mutations ===
        
        # 5% chance of gaining a completely new trait
        if random.random() < mutation_rate * 0.05:
            possible_new_traits = [
                "mutant", "explorer", "isolationist", "rapid_evolution",
                "stability_focused", "pattern_generator", "chaotic"
            ]
            new_trait = random.choice(possible_new_traits)
            mutated_genes["special_traits"][new_trait] = True
        
        # 5% chance of losing a random trait
        if random.random() < mutation_rate * 0.05 and mutated_genes["special_traits"]:
            trait_to_remove = random.choice(list(mutated_genes["special_traits"].keys()))
            del mutated_genes["special_traits"][trait_to_remove]
        
        # Record mutation event in history
        if not "gene_history" in mutated_genes["metadata"]:
            mutated_genes["metadata"]["gene_history"] = []
        
        mutated_genes["metadata"]["gene_history"].append({
            "timestamp": time.time(),
            "event_type": "mutation",
            "mutation_rate": mutation_rate
        })
        
        return mutated_genes
    
    def calculate_genetic_similarity(self, genes1, genes2):
        """
        Calculate a similarity score between two gene sets.
        Returns a value between 0 (completely different) and 1 (identical).
        """
        similarity_score = 0.0
        total_factors = 0
        
        # Compare CA rules (30% of total score)
        birth_similarity = self._calculate_rule_similarity(
            genes1["ca_rules"]["birth"], 
            genes2["ca_rules"]["birth"]
        )
        survival_similarity = self._calculate_rule_similarity(
            genes1["ca_rules"]["survival"], 
            genes2["ca_rules"]["survival"]
        )
        
        neighborhood_similarity = 1.0 if genes1["ca_rules"]["neighbors"] == genes2["ca_rules"]["neighbors"] else 0.0
        
        ca_similarity = (birth_similarity + survival_similarity + neighborhood_similarity) / 3
        similarity_score += ca_similarity * 0.3
        total_factors += 0.3
        
        # Compare visual genes (20% of total score)
        hue_diff = abs(genes1["visual"]["hue_base"] - genes2["visual"]["hue_base"])
        if hue_diff > 180:  # Handle color wheel wrapping
            hue_diff = 360 - hue_diff
        hue_similarity = 1.0 - (hue_diff / 180.0)
        
        pattern_similarity = 1.0 if genes1["visual"]["pattern_type"] == genes2["visual"]["pattern_type"] else 0.0
        
        density_diff = abs(genes1["visual"]["texture_density"] - genes2["visual"]["texture_density"])
        density_similarity = 1.0 - density_diff
        
        visual_similarity = (hue_similarity + pattern_similarity + density_similarity) / 3
        similarity_score += visual_similarity * 0.2
        total_factors += 0.2
        
        # Compare behavior genes (20% of total score)
        mutation_diff = abs(genes1["behavior"]["mutation_rate"] - genes2["behavior"]["mutation_rate"]) / 0.2
        mutation_similarity = 1.0 - mutation_diff
        
        speed_diff = abs(genes1["behavior"]["evolution_speed"] - genes2["behavior"]["evolution_speed"]) / 2.0
        speed_similarity = 1.0 - speed_diff
        
        interaction_diff = abs(genes1["behavior"]["interaction_strength"] - genes2["behavior"]["interaction_strength"])
        interaction_similarity = 1.0 - interaction_diff
        
        behavior_similarity = (mutation_similarity + speed_similarity + interaction_similarity) / 3
        similarity_score += behavior_similarity * 0.2
        total_factors += 0.2
        
        # Compare special traits (30% of total score)
        traits1 = set(genes1["special_traits"].keys())
        traits2 = set(genes2["special_traits"].keys())
        
        if not traits1 and not traits2:
            # Both have no special traits
            trait_similarity = 1.0
        elif not traits1 or not traits2:
            # One has traits, the other doesn't
            trait_similarity = 0.0
        else:
            # Both have traits - compare them
            intersection = len(traits1.intersection(traits2))
            union = len(traits1.union(traits2))
            trait_similarity = intersection / union
        
        similarity_score += trait_similarity * 0.3
        total_factors += 0.3
        
        # Normalize to account for any missing factors
        if total_factors > 0:
            similarity_score = similarity_score / total_factors
        
        return max(0.0, min(1.0, similarity_score))

    def _calculate_rule_similarity(self, rules1, rules2):
        """Helper to calculate similarity between two rule sets"""
        if not rules1 and not rules2:
            return 1.0  # Both empty = identical
        
        if not rules1 or not rules2:
            return 0.0  # One empty, one not = completely different
        
        # Calculate Jaccard similarity coefficient
        set1 = set(rules1)
        set2 = set(rules2)
        intersection = len(set1.intersection(set2))
        union = len(set1.union(set2))
        
        return intersection / union

    def identify_shared_traits(self, genes1, genes2):
        """
        Identify the traits that are shared between two gene sets.
        Returns a dictionary of shared traits and their details.
        """
        shared = {}
        
        # Check for identical CA rules
        birth1 = set(genes1["ca_rules"]["birth"])
        birth2 = set(genes2["ca_rules"]["birth"])
        shared_birth = birth1.intersection(birth2)
        
        survival1 = set(genes1["ca_rules"]["survival"])
        survival2 = set(genes2["ca_rules"]["survival"])
        shared_survival = survival1.intersection(survival2)
        
        if shared_birth:
            shared["ca_birth_rules"] = sorted(list(shared_birth))
        
        if shared_survival:
            shared["ca_survival_rules"] = sorted(list(shared_survival))
        
        if genes1["ca_rules"]["neighbors"] == genes2["ca_rules"]["neighbors"]:
            shared["neighborhood"] = genes1["ca_rules"]["neighbors"]
        
        # Check for similar visual genes
        hue_diff = abs(genes1["visual"]["hue_base"] - genes2["visual"]["hue_base"])
        if hue_diff > 180:  # Handle color wheel wrapping
            hue_diff = 360 - hue_diff
        
        if hue_diff < 30:  # Consider similar if within 30 degrees
            shared["similar_hue"] = {
                "hue1": genes1["visual"]["hue_base"],
                "hue2": genes2["visual"]["hue_base"],
                "difference": hue_diff
            }
        
        if genes1["visual"]["pattern_type"] == genes2["visual"]["pattern_type"]:
            shared["pattern_type"] = genes1["visual"]["pattern_type"]
        
        # Check for shared special traits
        traits1 = set(genes1["special_traits"].keys())
        traits2 = set(genes2["special_traits"].keys())
        shared_traits = traits1.intersection(traits2)
        
        if shared_traits:
            shared["special_traits"] = list(shared_traits)
        
        # Check for common lineage
        if "parent_ids" in genes1["metadata"] and "parent_ids" in genes2["metadata"]:
            parents1 = set(genes1["metadata"]["parent_ids"])
            parents2 = set(genes2["metadata"]["parent_ids"])
            common_parents = parents1.intersection(parents2)
            
            if common_parents:
                shared["common_ancestry"] = list(common_parents)
        
        return shared    