const Redis = require('ioredis');

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  db: process.env.REDIS_DB || 0,
  
  // Connection options
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  autoResubscribe: true,
  autoResendUnfulfilledCommands: true,
  
  // TLS configuration for production
  ...(process.env.NODE_ENV === 'production' && {
    tls: {},
    connectTimeout: 10000,
    commandTimeout: 5000
  })
};

// Create Redis client instance
const redisClient = process.env.REDIS_URL 
  ? new Redis(process.env.REDIS_URL, redisConfig)
  : new Redis(redisConfig);

// Redis event handlers
redisClient.on('connect', () => {
  console.log('✅ Redis client connected');
});

redisClient.on('ready', () => {
  console.log('✅ Redis client ready');
});

redisClient.on('error', (error) => {
  console.error('❌ Redis client error:', error);
});

redisClient.on('close', () => {
  console.log('⚠️ Redis client connection closed');
});

redisClient.on('reconnecting', () => {
  console.log('🔄 Redis client reconnecting...');
});

// Redis utility functions
const redisUtils = {
  // Set key with expiry
  set: async (key, value, expirySeconds = null) => {
    try {
      if (expirySeconds) {
        return await redisClient.setex(key, expirySeconds, JSON.stringify(value));
      } else {
        return await redisClient.set(key, JSON.stringify(value));
      }
    } catch (error) {
      console.error('Redis set error:', error);
      throw error;
    }
  },

  // Get key
  get: async (key) => {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      throw error;
    }
  },

  // Delete key
  del: async (key) => {
    try {
      return await redisClient.del(key);
    } catch (error) {
      console.error('Redis delete error:', error);
      throw error;
    }
  },

  // Check if key exists
  exists: async (key) => {
    try {
      return await redisClient.exists(key);
    } catch (error) {
      console.error('Redis exists error:', error);
      throw error;
    }
  },

  // Set key with expiry in milliseconds
  setWithMilliseconds: async (key, value, expiryMs) => {
    try {
      return await redisClient.psetex(key, expiryMs, JSON.stringify(value));
    } catch (error) {
      console.error('Redis set with milliseconds error:', error);
      throw error;
    }
  },

  // Get time to live for key
  ttl: async (key) => {
    try {
      return await redisClient.ttl(key);
    } catch (error) {
      console.error('Redis TTL error:', error);
      throw error;
    }
  },

  // Increment key
  incr: async (key) => {
    try {
      return await redisClient.incr(key);
    } catch (error) {
      console.error('Redis increment error:', error);
      throw error;
    }
  },

  // Decrement key
  decr: async (key) => {
    try {
      return await redisClient.decr(key);
    } catch (error) {
      console.error('Redis decrement error:', error);
      throw error;
    }
  },

  // Add to set
  sadd: async (key, ...members) => {
    try {
      return await redisClient.sadd(key, ...members);
    } catch (error) {
      console.error('Redis set add error:', error);
      throw error;
    }
  },

  // Get set members
  smembers: async (key) => {
    try {
      return await redisClient.smembers(key);
    } catch (error) {
      console.error('Redis set members error:', error);
      throw error;
    }
  },

  // Remove from set
  srem: async (key, ...members) => {
    try {
      return await redisClient.srem(key, ...members);
    } catch (error) {
      console.error('Redis set remove error:', error);
      throw error;
    }
  },

  // Check if member exists in set
  sismember: async (key, member) => {
    try {
      return await redisClient.sismember(key, member);
    } catch (error) {
      console.error('Redis set is member error:', error);
      throw error;
    }
  },

  // Add to sorted set
  zadd: async (key, score, member) => {
    try {
      return await redisClient.zadd(key, score, member);
    } catch (error) {
      console.error('Redis sorted set add error:', error);
      throw error;
    }
  },

  // Get range from sorted set
  zrange: async (key, start, stop, withScores = false) => {
    try {
      const args = [key, start, stop];
      if (withScores) args.push('WITHSCORES');
      return await redisClient.zrange(...args);
    } catch (error) {
      console.error('Redis sorted set range error:', error);
      throw error;
    }
  },

  // Get reverse range from sorted set
  zrevrange: async (key, start, stop, withScores = false) => {
    try {
      const args = [key, start, stop];
      if (withScores) args.push('WITHSCORES');
      return await redisClient.zrevrange(...args);
    } catch (error) {
      console.error('Redis sorted set reverse range error:', error);
      throw error;
    }
  },

  // Add to list
  lpush: async (key, ...values) => {
    try {
      const stringValues = values.map(val => JSON.stringify(val));
      return await redisClient.lpush(key, ...stringValues);
    } catch (error) {
      console.error('Redis list push error:', error);
      throw error;
    }
  },

  // Get from list
  lrange: async (key, start, stop) => {
    try {
      const data = await redisClient.lrange(key, start, stop);
      return data.map(item => JSON.parse(item));
    } catch (error) {
      console.error('Redis list range error:', error);
      throw error;
    }
  },

  // Set hash field
  hset: async (key, field, value) => {
    try {
      return await redisClient.hset(key, field, JSON.stringify(value));
    } catch (error) {
      console.error('Redis hash set error:', error);
      throw error;
    }
  },

  // Get hash field
  hget: async (key, field) => {
    try {
      const data = await redisClient.hget(key, field);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Redis hash get error:', error);
      throw error;
    }
  },

  // Get all hash fields
  hgetall: async (key) => {
    try {
      const data = await redisClient.hgetall(key);
      const result = {};
      for (const [field, value] of Object.entries(data)) {
        result[field] = JSON.parse(value);
      }
      return result;
    } catch (error) {
      console.error('Redis hash get all error:', error);
      throw error;
    }
  },

  // Delete hash field
  hdel: async (key, ...fields) => {
    try {
      return await redisClient.hdel(key, ...fields);
    } catch (error) {
      console.error('Redis hash delete error:', error);
      throw error;
    }
  },

  // Publish to channel
  publish: async (channel, message) => {
    try {
      return await redisClient.publish(channel, JSON.stringify(message));
    } catch (error) {
      console.error('Redis publish error:', error);
      throw error;
    }
  },

  // Pattern matching for keys
  keys: async (pattern) => {
    try {
      return await redisClient.keys(pattern);
    } catch (error) {
      console.error('Redis keys error:', error);
      throw error;
    }
  },

  // Flush database (use with caution)
  flushdb: async () => {
    try {
      return await redisClient.flushdb();
    } catch (error) {
      console.error('Redis flushdb error:', error);
      throw error;
    }
  },

  // Get Redis info
  info: async () => {
    try {
      return await redisClient.info();
    } catch (error) {
      console.error('Redis info error:', error);
      throw error;
    }
  },

  // Health check
  healthCheck: async () => {
    try {
      await redisClient.ping();
      return { status: 'healthy', message: 'Redis is responding' };
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }
};

// Redis pub/sub for real-time features
const createPubSub = () => {
  const publisher = redisClient.duplicate();
  const subscriber = redisClient.duplicate();

  subscriber.on('message', (channel, message) => {
    console.log(`📢 Redis Pub/Sub: Received message on channel ${channel}`);
  });

  subscriber.on('error', (error) => {
    console.error('❌ Redis subscriber error:', error);
  });

  publisher.on('error', (error) => {
    console.error('❌ Redis publisher error:', error);
  });

  return {
    publisher,
    subscriber,
    
    subscribe: async (channel, callback) => {
      await subscriber.subscribe(channel);
      subscriber.on('message', (ch, msg) => {
        if (ch === channel) {
          callback(JSON.parse(msg));
        }
      });
    },
    
    unsubscribe: async (channel) => {
      await subscriber.unsubscribe(channel);
    },
    
    publish: async (channel, message) => {
      await publisher.publish(channel, JSON.stringify(message));
    }
  };
};

// Cache management utilities
const cacheManager = {
  // Cache with automatic invalidation
  cache: async (key, data, ttlSeconds = 3600) => {
    await redisUtils.set(key, data, ttlSeconds);
  },

  // Get cached data
  get: async (key) => {
    return await redisUtils.get(key);
  },

  // Invalidate cache by pattern
  invalidate: async (pattern) => {
    const keys = await redisUtils.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
    return keys.length;
  },

  // Cache user-specific data
  cacheUserData: async (userId, key, data, ttlSeconds = 1800) => {
    const cacheKey = `user:${userId}:${key}`;
    await redisUtils.set(cacheKey, data, ttlSeconds);
  },

  // Get user-specific cached data
  getUserData: async (userId, key) => {
    const cacheKey = `user:${userId}:${key}`;
    return await redisUtils.get(cacheKey);
  },

  // Invalidate user cache
  invalidateUserCache: async (userId, pattern = '*') => {
    const cacheKey = `user:${userId}:${pattern}`;
    return await cacheManager.invalidate(cacheKey);
  }
};

// Graceful shutdown
const shutdownRedis = async () => {
  try {
    await redisClient.quit();
    console.log('✅ Redis client disconnected gracefully');
  } catch (error) {
    console.error('Error shutting down Redis:', error);
  }
};

process.on('SIGINT', shutdownRedis);
process.on('SIGTERM', shutdownRedis);

module.exports = {
  redisClient,
  redisUtils,
  createPubSub,
  cacheManager,
  shutdownRedis
};