#!/usr/bin/env python3
#You must start the 'neo4j desktop' program first, or suffer a ServiceUnavialable error
#If this is the first run of the DB with nothing stored uncomment out the line in db.py: self.init_constraints()  # Uncomment to run once if needed
# next open a new terminal and run: npm run dev
# go to the url
import threading
from flask import Flask
from flask_cors import CORS
from db import run_scheduled_tasks
from scanners import start_packet_capture
from routes import register_routes
from db import db

app = Flask(__name__)
CORS(app)

register_routes(app)

if __name__ == '__main__':
    db.initialize_graph()  # Ensure gateway is initialized immediately
    threading.Thread(target=start_packet_capture, daemon=True).start()
    threading.Thread(target=run_scheduled_tasks, daemon=True).start()

    app.run(host='0.0.0.0', port=5000)
