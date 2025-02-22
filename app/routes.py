import time
# import json
import re
# import sqlite3
import logging
from flask import jsonify, request
from db import db
# from db import get_node_by_id, fetch_full_graph, store_traceroute, get_cached_traceroute, update_node, store_traceroute
# from scanners import traffic_data, external_target
from network_scanner import grab_banner, check_cve, reverse_dns_lookup, get_ssl_info, scapy_port_scan, run_traceroute
from web_scanner import fetch_website_metadata, extract_hyperlinks
# from db import update_node, update_edge, get_node_by_id
import threading
import requests
from bgp_scanner import scan_asn 
from labeling import generate_node_label
from traffic_monitor import traffic_data  # Import the global traffic_data deque

def immediate_traceroute_update(new_target):
    hops = run_traceroute(target=new_target)
    logging.info(f"Immediate traceroute for {new_target} returned hops: {hops}")

    if hops:
        db.store_traceroute(new_target, hops)

def register_routes(app):
    @app.route('/banner_grab', methods=['GET'])
    def banner_grab():
        ip = request.args.get('ip')
        port = request.args.get('port', type=int)
        if not ip or not port:
            return jsonify({'error': 'Missing IP or Port parameter'}), 400
        return jsonify({'port': port, 'banner': grab_banner(ip, port)})
    
    @app.route('/cve_lookup', methods=['GET'])
    def cve_lookup():
        service = request.args.get('service')
        version = request.args.get('version')
        if not service or not version:
            return jsonify({'error': 'Missing service or version parameters'}), 400
        return jsonify({'cve_data': check_cve(service, version)})
    
    @app.route('/reverse_dns', methods=['GET'])
    def reverse_dns():
        ip = request.args.get('ip')
        if not ip:
            return jsonify({'error': 'Missing IP parameter'}), 400
        return jsonify({'hostname': reverse_dns_lookup(ip)})
    
    @app.route('/ssl_info', methods=['GET'])
    def ssl_info():
        ip = request.args.get('ip')
        port = request.args.get('port', type=int)
        if not ip or not port:
            return jsonify({'error': 'Missing IP or Port parameter'}), 400
        return jsonify({'ssl_data': get_ssl_info(ip, port)})
    
    @app.route('/remote_traceroute', methods=['GET'])
    def remote_traceroute():
        target = request.args.get("target")
        if not target:
            return jsonify({"error": "Missing target IP"}), 400

        try:
            REMOTE_SERVER = "https://visual-internet-prototype-remote.fly.dev/"
            response = requests.get(f"{REMOTE_SERVER}/traceroute", params={"target": target}, timeout=60)
            hops = response.json().get("hops", [])

            if hops:
                # Pass traceroute_mode="remote" here
                db.store_traceroute(target, hops, traceroute_mode="remote")

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
            AND NOT (n.id STARTS WITH 'bgpscan-' OR
                    n.id STARTS WITH 'portscan-' OR
                    n.id STARTS WITH 'sslscan-' OR
                    n.id STARTS WITH 'webscan-')
            OPTIONAL MATCH (n)-[r]->(m)
            RETURN n, r, m
            """
            with db.driver.session() as session:
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
                        source_id = start_node.get("id", start_node.id)
                        target_id = end_node.get("id", end_node.id)
                        # Force relationship node ids to be strings
                        source_id = str(source_id)
                        target_id = str(target_id)
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
        if not ip:
            return jsonify({'error': 'Missing IP parameter'}), 400

        try:
            open_ports = scapy_port_scan(ip)
            db.store_port_scan(ip, open_ports)

            return jsonify({'ports': open_ports, 'message': 'Scan complete. Results stored in Neo4j.'})

        except Exception as e:
            logging.error("Error scanning ports for %s: %s", ip, e)
            return jsonify({'error': str(e)}), 500
            
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

        asn_info = results['asn']  # e.g., {'asn': 15169, 'holder': 'GOOGLE'}
        peers = results.get('peers', [])
        prefixes = results.get('prefixes', [])

        # Upsert the ASN node (merging prefixes and peers)
        db.upsert_asn_node(asn_info, prefixes, peers)

        # For each prefix, upsert a NetworkNode and create an "ANNOUNCES" relationship
        for prefix in prefixes:
            network_node = {
                "id": prefix,
                "type": "prefix",  # using "prefix" type for these nodes
                "last_seen": time.time(),
                "color": "#0099FF"
            }
            network_node["label"] = generate_node_label(network_node)
            db.upsert_network_node(network_node)
            db.create_asn_network_relationship(f"AS{asn_info['asn']}", prefix, "ANNOUNCES", {"timestamp": time.time()})
        
        # For each peer, upsert that ASN node and create a "BGP_PEER" relationship
        for peer in peers:
            db.upsert_asn_node({'asn': peer, 'holder': "Unknown"})
            db.create_asn_network_relationship(f"AS{asn_info['asn']}", f"AS{peer}", "BGP_PEER", {"timestamp": time.time()})
        
        # Explicitly create a relationship between the ASN node and the target node
        ensure_asn_to_target_connection(asn_info['asn'], target, time.time())
        
        # Store the BGP scan as a separate scan node and link it to the network node
        db.store_bgp_scan(target, results)

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
        """
        Perform a web scan on a given network node.
        Extracts metadata, hyperlinks, and stores WebNode relationships.
        """
        ip = request.args.get('ip')
        port = request.args.get('port', type=int)
        if not ip or not port:
            return jsonify({'error': 'Missing IP or Port parameter'}), 400

        # Fetch metadata and hyperlinks.
        try:
            metadata = fetch_website_metadata(ip, port)
        except Exception as e:
            logging.error(f"Metadata fetch failed for {ip}:{port}: {e}")
            metadata = {}

        try:
            links_data = extract_hyperlinks(ip, port)
        except Exception as e:
            logging.error(f"Hyperlink extraction failed for {ip}:{port}: {e}")
            links_data = {}

        if "error" in metadata or "error" in links_data:
            logging.warning(f"Web scan error for {ip}:{port}: metadata={metadata}, links={links_data}")
            query_update_node = """
                MATCH (n:NetworkNode {id: $ip})
                SET n.webScan = false, n.web_scanned = true
            """
            with db.driver.session() as session:
                session.run(query_update_node, ip=ip)
            return jsonify({"status": "success", "metadata": {}, "links": []})

        # Ensure the network node for 'ip' exists.
        if not db.get_node_by_id(ip):
            node_data = {
                "id": ip,
                "type": "device",  # Assuming scanned IPs are treated as devices initially.
                "mac_address": "Unknown",
                "role": "Scanned Device",
                "last_seen": time.time()
            }
            node_data["label"] = generate_node_label(node_data)
            db.upsert_network_node(node_data)

        # Upsert the web node for the scanned website.
        scanned_web_node = {
            "id": metadata["url"],
            "type": "web",
            "url": metadata["url"],
            "title": metadata.get("title", "Unknown"),
            "description": metadata.get("description", "Unknown"),
            "status_code": metadata["status_code"],
            "content_type": metadata["content_type"],
            "server": metadata["server"],
            "port": port,
            "color": "#FF69B4",
            "last_seen": time.time(),
            "parentId": ip  # The website is a child of the scanned network node.
        }
        scanned_web_node["label"] = generate_node_label(scanned_web_node)
        db.upsert_web_node(scanned_web_node)

        # Create the HOSTS relationship from the network node to the scanned website.
        if db.get_node_by_id(metadata["url"]):
            db.create_relationship(ip, metadata["url"], "HOSTS", {"port": port, "layer": "web"})

        # Ensure only one scan record is created.
        db.store_scan("webscan", ip, {}, extra_labels=["WebScan"])

        # After storing the scan record, update the network node with scanned flags.
        query_update_node = """
            MATCH (n:NetworkNode {id: $ip})
            SET n.webScan = true, n.web_scanned = true
        """
        with db.driver.session() as session:
            session.run(query_update_node, ip=ip)

        # Process each hyperlink from the scan.
        for link in links_data.get("links", []):
            link_url = link["url"]
            resolved_ip = link.get("resolved_ip")

            # Upsert the hyperlink as a WebNode with its parent set to the scanned website.
            hyperlink_node = {
                "id": link_url,
                "url": link_url,
                "title": "Unknown",
                "status_code": None,
                "content_type": None,
                "server": None,
                "port": None,
                "color": "#FF69B4",
                "last_seen": time.time(),
                "parentId": metadata["url"]  # Link is now a child of the scanned website.
            }
            hyperlink_node["label"] = generate_node_label(hyperlink_node)
            db.upsert_web_node(hyperlink_node)

            # Delay slightly to prevent missing relationships.
            time.sleep(0.05)

            # Create the WEB_LINK relationship from the scanned website node to the hyperlink.
            if db.get_node_by_id(metadata["url"]) and db.get_node_by_id(link_url):
                db.create_relationship(metadata["url"], link_url, "WEB_LINK", {"type": link["type"], "layer": "web"})
            else:
                logging.warning(f"⚠️ Skipping WEB_LINK: One or both nodes missing -> {metadata['url']} ↔ {link_url}")

            # If the link is external and resolves to a valid IP, upsert a network node and create a DISCOVERED relationship.
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
                    # Create relationship from the scanned website node to the external network node.
                    db.create_relationship(metadata["url"], resolved_ip, "DISCOVERED", {"source": "web_scan"})

        return jsonify({
            "status": "success",
            "metadata": metadata,
            "links": links_data.get("links", [])
        })
