# gene_evolution_job.py

import time
import random
import logging
import threading
from genes import NodeGeneticSystem
from db import db

class GeneEvolutionJob:
    """
    Background job that periodically checks for node relationships
    and triggers gene evolution between connected nodes.
    """
    
    def __init__(self, db_connection, interval=300):
        self.db = db_connection
        self.gene_system = NodeGeneticSystem(db_connection)
        self.interval = interval  # seconds between evolution cycles
        self._stop_event = threading.Event()
        self._thread = None
    
    def start(self):
        """Start the background evolution job"""
        if self._thread is not None and self._thread.is_alive():
            logging.warning("Gene evolution job is already running")
            return
        
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        logging.info("Gene evolution job started")
    
    def stop(self):
        """Stop the background evolution job"""
        if self._thread is None or not self._thread.is_alive():
            logging.warning("Gene evolution job is not running")
            return
        
        self._stop_event.set()
        self._thread.join(timeout=10)
        logging.info("Gene evolution job stopped")
    
    def _run(self):
        """Main execution loop"""
        while not self._stop_event.is_set():
            try:
                self._process_evolution_cycle()
            except Exception as e:
                logging.error(f"Error during gene evolution cycle: {str(e)}")
            
            # Sleep for the interval or until stopped
            self._stop_event.wait(self.interval)
    
    def _process_evolution_cycle(self):
        """Process a single evolution cycle"""
        logging.info("Starting gene evolution cycle")
        
        # Get a list of relationships in the network
        relationships = self._fetch_network_relationships()
        
        if not relationships:
            logging.info("No relationships found for gene evolution")
            return
        
        # Select a random subset of relationships to process
        # (to avoid overwhelming the system)
        sample_size = min(10, len(relationships))
        selected_relationships = random.sample(relationships, sample_size)
        
        evolution_count = 0
        for rel in selected_relationships:
            source_id = rel["source"]
            target_id = rel["target"]
            rel_type = rel["type"]
            
            # Calculate probability based on relationship type
            if rel_type == "CONNECTED_TO":
                probability = 0.8
            elif rel_type == "TRACEROUTE_HOP":
                probability = 0.4
            elif rel_type == "HOSTS":
                probability = 0.9
            elif rel_type == "BGP_PEER":
                probability = 0.7
            else:
                probability = 0.2
            
            # Only evolve with a certain probability
            if random.random() < probability:
                try:
                    success = self.gene_system.evolve_genes_from_interaction(
                        source_id, target_id, rel_type
                    )
                    
                    if success:
                        evolution_count += 1
                        logging.info(f"Gene evolution occurred between {source_id} and {target_id} ({rel_type})")
                except Exception as e:
                    logging.error(f"Error during evolution between {source_id} and {target_id}: {str(e)}")
        
        logging.info(f"Gene evolution cycle complete: {evolution_count} successful evolutions")
    
    def _fetch_network_relationships(self):
        """Fetch relevant relationships from the database"""
        query = """
        MATCH (a)-[r]->(b)
        WHERE type(r) IN ['CONNECTED_TO', 'HOSTS', 'TRACEROUTE_HOP', 'BGP_PEER', 'WEB_LINK']
        RETURN a.id AS source, b.id AS target, type(r) AS type, r.timestamp AS timestamp
        ORDER BY r.timestamp DESC
        LIMIT 100
        """
        
        try:
            with self.db.driver.session() as session:
                result = session.run(query)
                relationships = []
                
                for record in result:
                    relationships.append({
                        "source": record["source"],
                        "target": record["target"],
                        "type": record["type"],
                        "timestamp": record["timestamp"]
                    })
                
                return relationships
        except Exception as e:
            logging.error(f"Error fetching network relationships: {str(e)}")
            return []