import time
import re
import logging
from flask import jsonify, request
from db import db
from network_scanner import grab_banner, check_cve, reverse_dns_lookup, get_ssl_info, scapy_port_scan, run_traceroute
from web_scanner import fetch_website_metadata, extract_hyperlinks
import threading
import requests
from bgp_scanner import scan_asn 
from labeling import generate_node_label
from traffic_monitor import traffic_data
from cache_helpers import get_node_details_cached, bust_node_details_cache
import json
from genes import NodeGeneticSystem

# Initialize gene system with db connection
gene_system = NodeGeneticSystem(db)

def immediate_traceroute_update(new_target):
    hops = run_traceroute(target=new_target)
    logging.info(f"Immediate traceroute for {new_target} returned hops: {hops}")

    if hops:
        db.store_traceroute(new_target, hops)

def register_routes(app):
    @app.route('/banner_grab', methods=['GET'])
    def banner_grab():
        # node_id, ip, and port all come from the query string
        ip = request.args.get('ip')
        port = request.args.get('port', type=int)

        if not ip or not port:
            return jsonify({'error': 'Missing ip or port query param'}), 400

        banner = grab_banner(ip, port)

        # Store the results in Neo4j
        db.store_port_scan_advanced_result(ip, port, "bannerGrab", banner)

        # Bust cache for that node_id
        bust_node_details_cache(ip)

        return jsonify({'port': port, 'banner': banner})


    @app.route('/reverse_dns', methods=['GET'])
    def reverse_dns():
        ip = request.args.get('ip')
        port = request.args.get('port', type=int, default=None)  # optional

        if not ip:
            return jsonify({'error': 'Missing ip query param'}), 400

        hostname = reverse_dns_lookup(ip)

        db.store_port_scan_advanced_result(ip, port, "reverseDNS", hostname)


        bust_node_details_cache(ip)

        return jsonify({'hostname': hostname})


    @app.route('/ssl_info', methods=['GET'])
    def ssl_info():
        ip = request.args.get('ip')
        port = request.args.get('port', type=int)

        if not ip or not port:
            return jsonify({'error': 'Missing ip or port query param'}), 400

        ssl_data = get_ssl_info(ip, port)

        if isinstance(ssl_data, str):
            # It's an error string
            db.store_port_scan_advanced_result(ip, port, "sslInfo", {'error': ssl_data})
            bust_node_details_cache(ip)
            return jsonify({'error': ssl_data}), 500

        # Convert to serializable dictionary
        try:
            serializable_ssl_data = {
                "issuer": str(ssl_data.get("issuer", "Unknown")),
                "notBefore": str(ssl_data.get("notBefore", "")),
                "notAfter": str(ssl_data.get("notAfter", "")),
                "serialNumber": str(ssl_data.get("serialNumber", "")),
                "version": ssl_data.get("version", ""),
                "subjectAltName": str(ssl_data.get("subjectAltName", []))
            }
            db.store_port_scan_advanced_result(ip, port, "sslInfo", serializable_ssl_data)
            if ip:
                bust_node_details_cache(ip)
            return jsonify({'ssl_data': serializable_ssl_data})
        except Exception as e:
            error_msg = f"Error processing SSL data: {str(e)}"
            logging.error(error_msg)
            db.store_port_scan_advanced_result(ip, port, "sslInfo", {'error': error_msg})
            if ip:
                bust_node_details_cache(ip)
            return jsonify({'error': error_msg}), 500


    @app.route('/cve_lookup', methods=['GET'])
    def cve_lookup():
        service = request.args.get('service')
        version = request.args.get('version')
        ip = request.args.get('ip')
        port = request.args.get('port', type=int)

        if not service or not version:
            return jsonify({'error': 'Missing service or version query param'}), 400

        cve_data = check_cve(service, version)

        # If we have an ip+port, store in Neo4j
        if ip and port:
            db.store_port_scan_advanced_result(ip, port, "cveLookup", cve_data)


        bust_node_details_cache(ip)

        return jsonify({'cve_data': cve_data})


    @app.route('/remote_traceroute', methods=['GET'])
    def remote_traceroute():
        target = request.args.get("target")

        if not target:
            return jsonify({"error": "Missing target query param"}), 400

        try:
            REMOTE_SERVER = "https://visual-internet-prototype-remote.fly.dev/"
            response = requests.get(f"{REMOTE_SERVER}/traceroute", params={"target": target}, timeout=60)
            hops = response.json().get("hops", [])

            if hops:
                db.store_traceroute(target, hops, traceroute_mode="remote")
                bust_node_details_cache(target)

            return jsonify({"target": target, "hops": hops, "cached": False})
        except Exception as e:
            logging.error(f"Error contacting remote traceroute server: {e}")
            return jsonify({"error": "Failed to retrieve remote traceroute"}), 500

    
    @app.route('/full_graph', methods=['GET'])
    def full_graph():
        """Retrieve all nodes and relationships in Neo4j."""
        try:
            return jsonify(db.fetch_full_graph())

        except Exception as e:
            logging.error(f"Error fetching full graph: {e}")
            return jsonify({"error": "Failed to retrieve graph"}), 500
            
    @app.route('/network', methods=['GET'])
    def get_network():
        try:
            query = """
            MATCH (n) 
            WHERE (n:NetworkNode OR n:WebNode OR n:ASNNode)
            AND NOT n:Scan
            AND NOT n:AdvancedResult
            AND NOT n.id STARTS WITH 'advanced_portscan-'
            OPTIONAL MATCH (n)-[r]->(m)
            WHERE NOT m:Scan AND NOT m:AdvancedResult
            AND NOT m.id STARTS WITH 'advanced_portscan-'
            RETURN n, r, m
            """
            with db.driver.session() as session:
                result = session.run(query)
                nodes = {}
                edges = []
                for record in result:
                    node_obj = record["n"]
                    node = dict(node_obj)
                    node["fully_scanned"] = node.get("fully_scanned", False)  #  Ensure `fully_scanned` is included
                    node_id = node.get("id")
                    if not node_id:
                        node_id = node_obj.id  # fallback to internal id
                    node["id"] = str(node_id)  # Ensure ID is a string
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

            return jsonify({"nodes": list(nodes.values()), "edges": edges})
        
        except Exception as e:
            logging.error(f"Error fetching network data: {e}")
            return jsonify({"error": "Failed to retrieve network data"}), 500
        
    @app.route('/scan_ports', methods=['GET'])
    def scan_ports():
        ip = request.args.get('ip')
        deep_scan = request.args.get('deep_scan', 'false').lower() == 'true'

        if not ip:
            return jsonify({"error": "No IP address provided"}), 400

        try:
            start_port = 20
            end_port = 1024

            # Include additional service-specific ports if deep scan is requested
            extended_ports = None
            if deep_scan:
                from port_mappings import INTERESTING_PORTS
                extended_ports = INTERESTING_PORTS

            # Run the scan
            open_ports = scapy_port_scan(ip, start_port, end_port, extended_ports=extended_ports)

            # Store scan in Neo4j
            scan_data = {
                "type": "portscan",
                "timestamp": time.time(),
                "ports": open_ports,
                "deep_scan": deep_scan
            }
            db.store_scan("portscan", ip, scan_data, extra_labels=["PortScan"])

            # Bust the cache so node details refresh
            bust_node_details_cache(ip)

            return jsonify({
                "status": "success", 
                "ports": open_ports, 
                "deep_scan": deep_scan
            })

        except Exception as e:
            logging.error(f"Error scanning ports for {ip}: {str(e)}")
            return jsonify({"error": str(e)}), 500



    @app.route('/get_scan_data', methods=['GET'])
    def get_scan_data():
        target_ip = request.args.get("target_ip")
        if not target_ip:
            return jsonify({"error": "Missing target IP"}), 400

        query = """
        MATCH (s:Scan)-[:RESULTS_IN]->(n:NetworkNode {id: $target_ip})
        RETURN s
        """
        with db.driver.session() as session:
            result = session.run(query, target_ip=target_ip)
            scans = [dict(record["s"]) for record in result]

        return jsonify({"target_ip": target_ip, "scans": scans})
            
    @app.route('/get_adv_results', methods=['GET'])
    def get_adv_results():
        target_ip = request.args.get('target_ip')
        if not target_ip:
            return jsonify({'error': 'Missing target_ip parameter'}), 400

        # Query to find all AdvancedResult nodes linked to the most recent PortScan for target_ip
        query = """
        MATCH (s:Scan {type: 'portscan', target: $target_ip})-[:HAS_ADVANCED_RESULT]->(a:AdvancedResult)
        RETURN a
        """
        with db.driver.session() as session:
            result = session.run(query, target_ip=target_ip)
            advanced_results = [dict(record['a']) for record in result]

        return jsonify({
            'target_ip': target_ip,
            'advanced_results': advanced_results
        })
            
    @app.route('/relationship_counts', methods=['GET'])
    def relationship_counts():
        target_ip = request.args.get("target_ip")
        if not target_ip:
            return jsonify({"error": "Missing target_ip parameter"}), 400

        query = """
        MATCH (n:NetworkNode {id: $target_ip})
        OPTIONAL MATCH (n)-[r]-(m)
        WHERE type(r) IN ['CONNECTED_TO', 'TRACEROUTE_HOP']
        RETURN 
        sum(CASE WHEN type(r) = 'CONNECTED_TO' THEN 1 ELSE 0 END) AS connected_to_count,
        sum(CASE WHEN type(r) = 'TRACEROUTE_HOP' THEN 1 ELSE 0 END) AS traceroute_hop_count
        """
        with db.driver.session() as session:
            result = session.run(query, target_ip=target_ip)
            record = result.single()
            connected_to_count = record["connected_to_count"] if record else 0
            traceroute_hop_count = record["traceroute_hop_count"] if record else 0

        return jsonify({
            "target_ip": target_ip,
            "connected_to_count": connected_to_count,
            "traceroute_hop_count": traceroute_hop_count
        })

            
    @app.route('/traffic', methods=['GET'])
    def get_traffic():
        try:
            # 1. Retrieve stored traffic from Neo4j (including protocol & size)
            query = """
            MATCH (src)-[t:TRAFFIC]->(dst)
            RETURN src.id AS source, dst.id AS target, t.proto AS protocol, t.size AS packet_size, t.timestamp AS last_seen
            """
            with db.driver.session() as session:
                result = session.run(query)
                stored_traffic = [
                    {
                        "src": record["source"],
                        "dst": record["target"],
                        "proto": record["protocol"],
                        "size": record["packet_size"],
                        "last_seen": record["last_seen"]
                    }
                    for record in result
                ]

            # 2. Retrieve recent in-memory traffic
            recent_traffic = list(traffic_data)

            # 3. Merge stored and real-time traffic
            traffic_dict = {}

            # Add stored traffic
            for entry in stored_traffic:
                key = (entry["src"], entry["dst"])
                traffic_dict[key] = {
                    "src": entry["src"],
                    "dst": entry["dst"],
                    "proto": entry["proto"],
                    "size": entry["size"],
                    "last_seen": entry["last_seen"]
                }

            # Add real-time traffic (overwrite if more recent)
            for entry in recent_traffic:
                key = (entry["src"], entry["dst"])
                if key in traffic_dict:
                    traffic_dict[key]["last_seen"] = max(traffic_dict[key]["last_seen"], entry["timestamp"])
                else:
                    traffic_dict[key] = {
                        "src": entry["src"],
                        "dst": entry["dst"],
                        "proto": entry["proto"],
                        "size": entry["size"],
                        "last_seen": entry["timestamp"]
                    }

            # 4. Prepare response
            response = {
                "traffic": list(traffic_dict.values())
            }

            # 5. Log the output for verification
            logging.info(f"Traffic data returned: {len(response['traffic'])} entries")

            return jsonify(response)

        except Exception as e:
            logging.error(f"Error retrieving traffic data: {e}")
            return jsonify({"error": "Failed to retrieve traffic data"}), 500



    
    @app.route('/set_external_target', methods=['POST'])
    def set_external_target():
        """
        Set a new external target and update the configuration node in Neo4j.
        Also triggers an immediate traceroute update.
        """
        data = request.get_json()
        new_target = data.get("target")
        if new_target and re.match(r"^(?:\d{1,3}\.){3}\d{1,3}$", new_target):
            logging.info(f"External target updated to: {new_target}")
            db.set_config_value("external_target", new_target)
            threading.Thread(target=immediate_traceroute_update, args=(new_target,), daemon=True).start()
            return jsonify({"status": "success", "target": new_target}), 200
        else:
            return jsonify({"status": "error", "message": "Invalid IP address provided"}), 400


    
    @app.route('/traffic_rate', methods=['GET'])
    def get_traffic_rate():
        """Retrieve network traffic data from Neo4j and calculate traffic rate."""
        try:
            query = """
            MATCH (a)-[t:CONNECTED_TO]->(b)
            RETURN t.timestamp AS last_seen
            """
            with db.driver.session() as session:
                result = session.run(query)
                timestamps = [record["last_seen"] for record in result]
            if not timestamps:
                return jsonify({"average_rate": 0})
            oldest = min(timestamps)
            newest = max(timestamps)
            time_span = max(newest - oldest, 1)  # Avoid division by zero
            average_rate = len(timestamps) / time_span
            return jsonify({"average_rate": average_rate})
        except Exception as e:
            logging.error(f"Error calculating traffic rate: {e}")
            return jsonify({"error": "Failed to retrieve traffic rate"}), 500

    def ensure_asn_to_target_connection(asn, target, timestamp):
        """
        Create a relationship between the ASN node (identified by f"AS{asn}")
        and the target node (target IP) using the 'HOSTS' relationship.
        """
        asn_node_id = f"AS{asn}"
        db.create_asn_network_relationship(asn_node_id, target, "HOSTS", {"timestamp": timestamp})

    @app.route('/bgp_scan', methods=['GET'])
    def bgp_scan():
        """
        Accepts a target (IP or ASN), performs a BGP scan,
        and stores/updates ASN and network data in Neo4j.
        """
        target = request.args.get('target')
        if not target:
            return jsonify({'error': 'Missing target parameter'}), 400
        

        # Perform the BGP scan from bgp_scanner.py
        results = scan_asn(target)
        if 'error' in results:
            return jsonify(results), 404

        asn_info = results['asn']
        peers = results.get('peers', [])
        prefixes = results.get('prefixes', [])

        # ✅ Upsert ASN node
        db.upsert_asn_node(asn_info, prefixes, peers)

        # ✅ Process prefixes efficiently
        prefix_nodes = []
        prefix_relationships = []
        now = time.time()

        for prefix in prefixes:
            prefix_nodes.append({
                "id": prefix,
                "type": "prefix",
                "last_seen": now,
                "color": "#0099FF",
                "label": generate_node_label({"id": prefix, "type": "prefix"})
            })
            prefix_relationships.append(
                (f"AS{asn_info['asn']}", prefix, "ANNOUNCES", {"timestamp": now})
            )

        for node in prefix_nodes:
            db.upsert_network_node(node)

        for asn_id, prefix, rel_type, props in prefix_relationships:
            db.create_asn_network_relationship(asn_id, prefix, rel_type, props)

        # ✅ Process ASN peer relationships
        peer_relationships = []
        for peer in peers:
            db.upsert_asn_node({'asn': peer, 'holder': "Unknown"})
            peer_relationships.append(
                (f"AS{asn_info['asn']}", f"AS{peer}", "BGP_PEER", {"timestamp": now})
            )

        for asn_id, peer_id, rel_type, props in peer_relationships:
            db.create_asn_network_relationship(asn_id, peer_id, rel_type, props)

        # ✅ Explicitly create the ASN-to-target relationship
        ensure_asn_to_target_connection(asn_info['asn'], target, now)

        # ✅ Store the BGP scan (only if it does not exist)
        db.store_bgp_scan(target, results)

        # Finally, bust the node details cache if we have a node_id
        bust_node_details_cache(target)

        return jsonify({
            "status": "success",
            "data": {
                "asn": asn_info,
                "prefixes": prefixes,
                "peers": peers
            }
        })

    @app.route('/web_scan', methods=['GET'])
    def web_scan():
        ip = request.args.get('ip')                # e.g. ?ip=192.168.0.11
        port = request.args.get('port', type=int)  # e.g. ?port=80
        hostname = request.args.get('hostname', ip)  # defaults to ip if hostname not provided

        if not ip or not port:
            return jsonify({'error': 'Missing IP or Port parameter'}), 400

        try:
            # Use hostname for actual HTTP requests
            metadata = fetch_website_metadata(hostname, port)
            links_data = extract_hyperlinks(hostname, port)
            # Store the original IP in the metadata for DB ops
            metadata["original_ip"] = ip
        except Exception as e:
            logging.error(f"Web scan failed for {hostname}:{port} (original IP: {ip}): {e}")
            metadata, links_data = {"error": str(e), "original_ip": ip}, {}

        scan_status = "success"
        if "error" in metadata or "error" in links_data:
            scan_status = "error"
            logging.warning(f"Web scan error for {hostname}:{port} (original IP: {ip}): "
                            f"metadata={metadata}, links={links_data}")

        # Store scan results in Neo4j (even if there's an error)
        scan_properties = {
            "url": metadata.get("url", f"http://{hostname}:{port}"),
            "hostname": hostname if hostname != ip else None,
            "status_code": metadata.get("status_code"),
            "content_type": metadata.get("content_type"),
            "server": metadata.get("server"),
            "title": metadata.get("title", "Unknown"),
            "description": metadata.get("description", "Unknown"),
            "error": metadata.get("error")
        }
        db.store_scan("webscan", ip, scan_properties, extra_labels=["WebScan"])

        # If you want to mark this node as web_scanned, do so
        query_update_node = """
            MATCH (n:NetworkNode {id: $ip})
            SET n.web_scanned = true, n.fully_scanned = true
        """
        with db.driver.session() as session:
            session.run(query_update_node, ip=ip)

        # BUST THE CACHE if you have a node_id (and if it’s relevant)
        bust_node_details_cache(ip)

        if scan_status == "error":
            return jsonify({"status": "error", "metadata": metadata, "links": []})

        # Else proceed with normal processing
        # 1) Upsert the device node
        node_data = db.get_node_by_id(ip) or {
            "id": ip,
            "type": "device",
            "mac_address": "Unknown",
            "role": "Scanned Device",
            "last_seen": time.time(),
            "label": generate_node_label({"id": ip, "type": "device"})
        }
        db.upsert_network_node(node_data)

        # 2) Create or update the WebNode
        web_node_id = metadata["url"]
        web_node = {
            "id": web_node_id,
            "type": "web",
            "url": metadata["url"],
            "hostname": hostname if hostname != ip else None,
            "title": metadata.get("title", "Unknown"),
            "description": metadata.get("description", "Unknown"),
            "status_code": metadata.get("status_code"),
            "content_type": metadata.get("content_type"),
            "server": metadata.get("server"),
            "port": port,
            "color": "#FF69B4",
            "last_seen": time.time(),
            "parentId": ip
        }
        db.upsert_web_node(web_node)

        # 3) Create relationship from IP node to the WebNode
        if db.get_node_by_id(web_node_id):
            db.create_relationship(ip, web_node_id, "HOSTS", {"port": port, "layer": "web"})

        # 4) Process discovered links
        for link in links_data.get("links", []):
            link_url = link["url"]
            resolved_ip = link.get("resolved_ip")

            db.upsert_web_node({
                "id": link_url,
                "url": link_url,
                "title": "Unknown",
                "status_code": None,
                "content_type": None,
                "server": None,
                "port": None,
                "color": "#FF69B4",
                "last_seen": time.time(),
                "parentId": metadata["url"]
            })

            time.sleep(0.05)  # short delay if desired
            if db.get_node_by_id(metadata["url"]) and db.get_node_by_id(link_url):
                db.create_relationship(metadata["url"], link_url, "WEB_LINK", {"type": link["type"], "layer": "web"})

            if link.get("type") == "external" and resolved_ip:
                db.upsert_network_node({
                    "id": resolved_ip,
                    "label": "Discovered External",
                    "type": "external",
                    "mac_address": "Unknown",
                    "role": "External Node",
                    "last_seen": time.time()
                })
                if db.get_node_by_id(resolved_ip):
                    db.create_relationship(metadata["url"], resolved_ip, "DISCOVERED", {"source": "web_scan"})

        return jsonify({"status": "success", "metadata": metadata, "links": links_data.get("links", [])})

#New Node details route with cache busting:
    @app.route('/node_details', methods=['GET'])
    def node_details():
        node_id = request.args.get('node_id')
        if not node_id:
            return jsonify({"error": "Missing node_id"}), 400
        db.mark_node_as_found(node_id)
        node_data = get_node_details_cached(node_id)
        if not node_data:
            return jsonify({"error": f"No node found with id {node_id}"}), 404

        return jsonify(node_data)
    

    # New system for node genes    
    # routes.py - add this new endpoint


    @app.route('/node_genes', methods=['GET'])
    def get_node_genes():
        """
        Retrieve genetic traits for a network node.
        These genes determine the node's CA behavior and visual properties.
        """
        node_id = request.args.get('node_id')
        if not node_id:
            return jsonify({"error": "Missing node_id parameter"}), 400
        
        try:
            # Get or generate genes for this node
            genes = gene_system.get_node_genes(node_id)
            
            # Check if forcing evolution was requested
            evolve_with = request.args.get('evolve_with')
            interaction_type = request.args.get('interaction_type', 'CONNECTED_TO')
            
            if evolve_with:
                # Trigger gene evolution with the specified node
                success = gene_system.evolve_genes_from_interaction(
                    node_id, evolve_with, interaction_type
                )
                
                if success:
                    # Fetch updated genes after evolution
                    genes = gene_system.get_node_genes(node_id)
                    
                    return jsonify({
                        "node_id": node_id,
                        "genes": genes,
                        "evolution": {
                            "partner": evolve_with,
                            "interaction_type": interaction_type,
                            "success": True
                        }
                    })
                else:
                    return jsonify({
                        "node_id": node_id,
                        "genes": genes,
                        "evolution": {
                            "partner": evolve_with,
                            "interaction_type": interaction_type,
                            "success": False,
                            "message": "Evolution failed or was too weak to produce changes"
                        }
                    })
            
            # Standard response without evolution
            return jsonify({
                "node_id": node_id,
                "genes": genes
            })
        
        except Exception as e:
            logging.error(f"Error processing node genes for {node_id}: {str(e)}")
            return jsonify({
                "error": f"Failed to process node genes: {str(e)}"
            }), 500

    @app.route('/node_genes/evolve', methods=['POST'])
    def trigger_gene_evolution():
        """
        Explicitly trigger gene evolution between two nodes.
        This endpoint can be used to force gene sharing between any two nodes.
        """
        data = request.get_json()
        
        source_id = data.get('source_id')
        target_id = data.get('target_id')
        interaction_type = data.get('interaction_type', 'CONNECTED_TO')
        
        if not source_id or not target_id:
            return jsonify({"error": "Missing source_id or target_id"}), 400
        
        try:
            # Trigger gene evolution
            success = gene_system.evolve_genes_from_interaction(
                source_id, target_id, interaction_type
            )
            
            if success:
                # Fetch updated genes for both nodes
                source_genes = gene_system.get_node_genes(source_id)
                target_genes = gene_system.get_node_genes(target_id)
                
                return jsonify({
                    "success": True,
                    "source": {
                        "id": source_id,
                        "genes": source_genes
                    },
                    "target": {
                        "id": target_id,
                        "genes": target_genes
                    },
                    "interaction_type": interaction_type
                })
            else:
                return jsonify({
                    "success": False,
                    "message": "Evolution failed or was too weak to produce changes",
                    "source_id": source_id,
                    "target_id": target_id,
                    "interaction_type": interaction_type
                })
        
        except Exception as e:
            logging.error(f"Error during gene evolution: {str(e)}")
            return jsonify({
                "success": False,
                "error": f"Failed to evolve genes: {str(e)}"
            }), 500

    @app.route('/node_genes/related', methods=['GET'])
    def get_genetically_related_nodes():
        """
        Find nodes that share genetic heritage with the specified node.
        This can be used to visualize gene propagation throughout the network.
        """
        node_id = request.args.get('node_id')
        if not node_id:
            return jsonify({"error": "Missing node_id parameter"}), 400
        
        try:
            # Get genes for this node
            genes = gene_system.get_node_genes(node_id)
            
            if not genes:
                return jsonify({
                    "node_id": node_id,
                    "related_nodes": [],
                    "message": "No genes found for this node"
                })
            
            # Extract parent IDs from metadata
            parent_ids = genes["metadata"].get("parent_ids", [])
            
            # Query Neo4j for nodes with a genetic relationship
            query = """
            MATCH (n {id: $node_id})
            OPTIONAL MATCH (n)-[r]->(related)
            WHERE r.type IN ['CONNECTED_TO', 'HOSTS', 'TRACEROUTE_HOP', 'BGP_PEER']
            
            WITH related
            WHERE related.genes IS NOT NULL
            
            RETURN related.id AS related_id, 
                related.genes AS genes,
                related.type AS node_type
            """
            
            related_nodes = []
            with db.driver.session() as session:
                result = session.run(query, node_id=node_id)
                
                for record in result:
                    related_id = record["related_id"]
                    related_genes = json.loads(record["genes"])
                    
                    # Calculate genetic similarity
                    similarity = gene_system.calculate_genetic_similarity(genes, related_genes)
                    
                    related_nodes.append({
                        "id": related_id,
                        "type": record["node_type"],
                        "genetic_similarity": similarity,
                        "is_parent": related_id in parent_ids,
                        "shared_traits": gene_system.identify_shared_traits(genes, related_genes)
                    })
            
            # Sort by genetic similarity
            related_nodes.sort(key=lambda x: x["genetic_similarity"], reverse=True)
            
            return jsonify({
                "node_id": node_id,
                "generation": genes["metadata"].get("generation", 1),
                "related_nodes": related_nodes
            })
        
        except Exception as e:
            logging.error(f"Error finding related nodes for {node_id}: {str(e)}")
            return jsonify({
                "error": f"Failed to find genetically related nodes: {str(e)}"
            }), 500
        
