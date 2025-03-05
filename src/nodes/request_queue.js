// src/nodes/request_queue.js - FIXED VERSION

/**
 * RequestQueue - A system to manage and throttle API requests
 * Prevents "thundering herd" of simultaneous requests
 */
export class RequestQueue {
  constructor(options = {}) {
    this.queue = [];
    this.isProcessing = false;
    this.cache = new Map();
    this.cacheExpiration = options.cacheExpiration || 5 * 60 * 1000; // 5 minutes default
    this.concurrentRequests = options.concurrentRequests || 2;
    this.requestDelay = options.requestDelay || 300; // ms between requests
    this.activeRequests = 0;
    this.retryLimit = options.retryLimit || 3;
    
    // Create a cache cleanup interval
    this.cacheCleanupInterval = setInterval(() => this.cleanupCache(), 60 * 1000);
    
    console.log("🚀 RequestQueue initialized with:", {
      concurrentRequests: this.concurrentRequests,
      requestDelay: this.requestDelay,
      retryLimit: this.retryLimit
    });
  }
  
  /**
   * Add a request to the queue
   * @param {string} url - The URL to request
   * @param {Object} options - Fetch options
   * @param {Function} callback - Callback for the response
   */
  enqueue(url, options = {}, callback) {
    console.log(`Enqueuing request for ${url}`, options);
    
    // Check cache first
    const cachedItem = this.cache.get(url);
    if (cachedItem && (Date.now() - cachedItem.timestamp) < this.cacheExpiration) {
      console.log(`Using cached data for ${url}`);
      if (callback) callback(cachedItem.data);
      return Promise.resolve(cachedItem.data);
    }
    
    // Create a promise to return
    return new Promise((resolve, reject) => {
      // Add to queue
      this.queue.push({
        url,
        options,
        callback,
        resolve,
        reject,
        retries: 0,
        priority: options.priority || 5, // 1-10, lower = higher priority
        addedAt: Date.now()
      });
      
      // Sort queue by priority and then by timestamp
      this.queue.sort((a, b) => 
        a.priority !== b.priority ? 
          a.priority - b.priority : 
          a.addedAt - b.addedAt
      );
      
      // Start processing if not already
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }
  
  /**
   * Process the next items in the queue
   */
  processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }
    
    this.isProcessing = true;
    
    // Process up to concurrentRequests
    while (this.queue.length > 0 && this.activeRequests < this.concurrentRequests) {
      const request = this.queue.shift();
      this.activeRequests++;
      
      this.makeRequest(request)
        .finally(() => {
          this.activeRequests--;
          // Continue processing after delay
          setTimeout(() => this.processQueue(), this.requestDelay);
        });
    }
  }
  
  /**
   * Make an actual API request
   * @param {Object} request - Request object from queue
   */
  async makeRequest(request) {
    try {
      console.log(`Processing request to ${request.url}`);
      const response = await fetch(request.url, request.options);
      
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache the result
      this.cache.set(request.url, {
        data,
        timestamp: Date.now()
      });
      
      // Call callback and resolve promise
      if (request.callback) request.callback(data);
      request.resolve(data);
      
      return data;
      
    } catch (error) {
      console.error(`Error fetching ${request.url}:`, error);
      
      // Retry logic
      if (request.retries < this.retryLimit) {
        console.log(`Retrying ${request.url} (${request.retries + 1}/${this.retryLimit})`);
        request.retries++;
        this.queue.unshift(request); // Add back to front of queue
      } else {
        if (request.callback) request.callback(null, error);
        request.reject(error);
      }
      
      return null;
    }
  }
  
  /**
   * Clean expired items from cache
   */
  cleanupCache() {
    const now = Date.now();
    for (const [url, item] of this.cache.entries()) {
      if (now - item.timestamp > this.cacheExpiration) {
        this.cache.delete(url);
      }
    }
  }
  
  /**
   * Clear queue and stop processing
   */
  clear() {
    this.queue = [];
    this.isProcessing = false;
    clearInterval(this.cacheCleanupInterval);
  }
}

// Immediately create and expose a global instance to ensure it's available
if (typeof window !== 'undefined' && !window.requestQueue) {
window.requestQueue = new RequestQueue();
console.log("✅ Global RequestQueue initialized and assigned to window.requestQueue");
}