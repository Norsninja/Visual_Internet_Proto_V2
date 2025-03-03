# cache_helpers.py
from db import db

cache = None
get_node_details_cached = None

def init_cache(cache_instance):
    """
    Called once from app.py, after we create the Flask Cache object.
    This sets up the memoized function dynamically.
    """
    global cache
    global get_node_details_cached
    
    cache = cache_instance
    
    # Define the memoized function here so the decorator sees a non-None cache
    @cache.memoize(timeout=300)
    def _get_node_details_cached(node_id):
        return db.fetch_node_details(node_id)

    # Expose it as a global
    get_node_details_cached = _get_node_details_cached

def bust_node_details_cache(node_id):
    # You can only call this after init_cache
    if get_node_details_cached:
        cache.delete_memoized(get_node_details_cached, node_id)
