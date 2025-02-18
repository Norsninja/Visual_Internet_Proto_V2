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
                db.store_traceroute(target, hops)

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
            MATCH (n:NetworkNode|WebNode)
            OPTIONAL MATCH (n)-[r]->(m)
            RETURN n, r, m
            """
            with db.driver.session() as session:
                result = session.run(query)
                nodes = {}
                edges = []
                for record in result:
                    node = dict(record["n"])
                    nodes[node["id"]] = node
                    if record["r"]:
                        edges.append({
                            "source": record["r"].start_node["id"],
                            "target": record["r"].end_node["id"],
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
        """Retrieve network traffic data from Neo4j."""
        try:
            query = """
            MATCH (a)-[t:CONNECTED_TO]->(b)
            RETURN a.id AS source, b.id AS target, t.timestamp AS last_seen
            """
            with db.driver.session() as session:
                result = session.run(query)
                traffic_data = [
                    {"src": record["source"], "dst": record["target"], "last_seen": record["last_seen"]}
                    for record in result
                ]
            return jsonify(traffic_data)

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

        # Fetch metadata and hyperlinks
        metadata = fetch_website_metadata(ip, port)
        links_data = extract_hyperlinks(ip, port)

        if "error" in metadata or "error" in links_data:
            return jsonify({
                'error': 'Web scan failed',
                'metadata': metadata,
                'links': links_data
            }), 500

        # Ensure the NetworkNode (IP) exists in the database
        if not db.get_node_by_id(ip):
            db.upsert_network_node({
                "id": ip,
                "label": "Scanned Node",
                "type": "device",
                "mac_address": "Unknown",
                "role": "Scanned Device",
                "last_seen": time.time()
            })

        # Ensure the WebNode exists in the database before creating a relationship
        web_node = {
            "id": metadata["url"],
            "url": metadata["url"],
            "title": metadata.get("title", "Unknown"),
            "description": metadata.get("description", "Unknown"),
            "status_code": metadata["status_code"],
            "content_type": metadata["content_type"],
            "server": metadata["server"],
            "port": port,
            "color": "#FF69B4",
            "last_seen": time.time(),
            "parentId": ip,
            "type": "web" 
        }
        db.upsert_web_node(web_node)

        # Now safely create the HOSTS relationship
        if db.get_node_by_id(metadata["url"]):
            db.create_relationship(ip, metadata["url"], "HOSTS", {"port": port, "layer": "web"})

        # ✅ Ensure only one scan record is created
        scan_id = f"webscan-{ip}-{int(time.time())}"
        query_scan = """
        MERGE (s:Scan:WebScan {id: $scan_id})
        SET s.target = $ip, s.timestamp = $timestamp
        WITH s
        MATCH (n:NetworkNode {id: $ip})
        CREATE (s)-[:RESULTS_IN]->(n)
        """
        with db.driver.session() as session:
            session.run(query_scan, scan_id=scan_id, ip=ip, timestamp=time.time())

        # Process each hyperlink from the scan
        for link in links_data.get("links", []):
            link_url = link["url"]
            resolved_ip = link.get("resolved_ip")

            # Ensure the WebNode exists for the hyperlink
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
                "parentId": ip # metadata["url"]  
            })

            # ✅ Prevent missing relationships by delaying Neo4j commits
            time.sleep(0.05)

            # Now create the WEB_LINK relationship (ensuring both nodes exist)
            if db.get_node_by_id(ip) and db.get_node_by_id(link_url):
                db.create_relationship(ip, link_url, "WEB_LINK", {"type": link["type"], "layer": "web"})
            else:
                logging.warning(f"⚠️ Skipping WEB_LINK: One or both nodes missing -> {metadata['url']} ↔ {link_url}")

            # If the link is external and resolves to a valid IP, store as a network node
            if link.get("type") == "external" and resolved_ip:
                db.upsert_network_node({
                    "id": resolved_ip,
                    "label": "Discovered External",
                    "type": "external",
                    "mac_address": "Unknown",
                    "role": "External Node",
                    "last_seen": time.time()
                })

                # Ensure relationship is only created if both nodes exist
                if db.get_node_by_id(resolved_ip):
                    db.create_relationship(ip, resolved_ip, "DISCOVERED", {"source": "web_scan"})

        return jsonify({
            "status": "success",
            "metadata": metadata,
            "links": links_data.get("links", [])
        })

