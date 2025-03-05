#!/usr/bin/env python3
#You must start the 'neo4j desktop' program first, or suffer a ServiceUnavialable error
#If this is the first run of the DB with nothing stored uncomment out the line in db.py: self.init_constraints()  # Uncomment to run once if needed
# next open a new terminal and run: npm run dev
# go to the url
import threading
from flask import Flask
from flask_cors import CORS
import orchestrator
from traffic_monitor import start_packet_capture

from db import db
from flask_caching import Cache
from gene_evolution_job import GeneEvolutionJob

# Create gene evolution job - after initializing cache
gene_evolution_job = GeneEvolutionJob(db, interval=300)

app = Flask(__name__)
CORS(app)

# cache = Cache(app, config={
#     'CACHE_TYPE': 'RedisCache',
#     'CACHE_REDIS_HOST': 'localhost',
#     'CACHE_REDIS_PORT': 6379
# })
cache = Cache(app, config={
    'CACHE_TYPE': 'SimpleCache',  # Fast, in-memory caching
    'CACHE_DEFAULT_TIMEOUT': 300  # 5-minute cache lifetime
})
import cache_helpers
cache_helpers.init_cache(cache)
from routes import register_routes
register_routes(app)

if __name__ == '__main__':
    db.initialize_graph()  # Ensure gateway is initialized immediately
    threading.Thread(target=start_packet_capture, daemon=True).start()
    threading.Thread(target=orchestrator.schedule_full_scan, daemon=True).start()
    # Start the gene evolution job
    gene_evolution_job.start()
    app.run(host='0.0.0.0', port=5000)
