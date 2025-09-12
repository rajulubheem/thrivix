"""
SearchGateway: centralized search provider with cache, simple rate limits, and backoff
Phase 1: in-memory cache + basic global/session limits. Can swap to Redis later.
"""
from __future__ import annotations
import os
import time
import threading
from typing import Dict, Any, Tuple, Optional
import requests
import hashlib
import json
try:
    import redis
except Exception:  # redis is optional; fallback to memory
    redis = None


class _SearchGateway:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
        self._global_calls: int = 0
        self._last_429_ts: float = 0.0
        self._redis: Optional["redis.Redis"] = None
        self._init_redis()

    def _init_redis(self):
        url = os.getenv("REDIS_URL")
        if url and redis is not None:
            try:
                self._redis = redis.Redis.from_url(url, decode_responses=True)
                # simple ping to validate
                self._redis.ping()
            except Exception:
                self._redis = None

    # Config
    @property
    def cache_ttl(self) -> int:
        return int(os.getenv("SEARCH_CACHE_TTL_SECONDS", "300"))

    @property
    def max_calls_per_minute(self) -> int:
        return int(os.getenv("SEARCH_MAX_CALLS_PER_MINUTE", "600"))

    @property
    def backoff_seconds(self) -> int:
        return int(os.getenv("TAVILY_BACKOFF_SECONDS", "20"))

    def _hash_key(self, provider: str, query: str) -> str:
        h = hashlib.sha256(f"{provider}|{query}".encode()).hexdigest()
        return h

    def _check_rate_limit(self) -> bool:
        # Basic global backoff if we recently saw a 429
        now = time.time()
        if self._redis is not None:
            try:
                ts = self._redis.get("search:last_429_ts")
                if ts is not None:
                    last = float(ts)
                    if (now - last) < self.backoff_seconds:
                        return False
            except Exception:
                pass
        else:
            if self._last_429_ts and (now - self._last_429_ts) < self.backoff_seconds:
                return False
        return True

    def search(self, query: str) -> Dict[str, Any]:
        provider = "tavily"
        key = self._hash_key(provider, query)
        now = time.time()
        with self._lock:
            # Cache hit (redis preferred)
            if self._redis is not None:
                try:
                    cached = self._redis.get(f"search:cache:{key}")
                    if cached:
                        return json.loads(cached)
                except Exception:
                    pass
            else:
                if key in self._cache:
                    ts, data = self._cache[key]
                    if now - ts < self.cache_ttl:
                        return data

            # Global backoff
            if not self._check_rate_limit():
                wait_left = self.backoff_seconds
                if self._redis is None and self._last_429_ts:
                    wait_left = int(self.backoff_seconds - (now - self._last_429_ts))
                return {
                    "answer": None,
                    "results": [],
                    "error": f"rate_limited_wait_{max(wait_left,0)}"
                }

        # Call Tavily
        api_key = os.getenv("TAVILY_API_KEY")
        if not api_key:
            return {"answer": None, "results": [], "error": "missing_api_key"}

        try:
            resp = requests.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": api_key,
                    "query": query,
                    "search_depth": "basic",
                    "max_results": 5,
                    "include_answer": True,
                    "include_raw_content": False,
                "include_images": True,
                },
                headers={"Content-Type": "application/json"},
                timeout=30,
            )
            if resp.status_code == 429:
                with self._lock:
                    self._last_429_ts = time.time()
                    if self._redis is not None:
                        try:
                            self._redis.setex("search:last_429_ts", self.backoff_seconds, str(self._last_429_ts))
                        except Exception:
                            pass
                return {"answer": None, "results": [], "error": "rate_limited"}
            if resp.status_code != 200:
                return {"answer": None, "results": [], "error": f"http_{resp.status_code}"}
            data = resp.json()
            # Normalize
            out = {
                "answer": data.get("answer"),
                "results": data.get("results", []),
                "error": None,
            }
            with self._lock:
                if self._redis is not None:
                    try:
                        self._redis.setex(f"search:cache:{key}", self.cache_ttl, json.dumps(out))
                    except Exception:
                        pass
                else:
                    self._cache[key] = (time.time(), out)
            return out
        except requests.exceptions.Timeout:
            return {"answer": None, "results": [], "error": "timeout"}
        except Exception as e:
            return {"answer": None, "results": [], "error": f"exception:{e}"}


search_gateway = _SearchGateway()
