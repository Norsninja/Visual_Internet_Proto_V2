#!/usr/bin/env python3
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
