# Rate-Limit PoC

Concurrency test for the token-bucket rate limiter and circuit breaker scripts against a local Redis instance.

Supports two modes:

- **Burst** (default): fires `CONCURRENCY` requests per worker as fast as possible.
- **Sustained**: runs `CONCURRENCY` concurrent lanes per worker for `DURATION_SECS` seconds, exercising token refill over time.

## Prerequisites

- Docker
- Node.js 24+
- `npm install` from repo root

## Start Redis

```bash
docker run --rm -p 6379:6379 redis:7
```

## Run

```bash
npm run start -w tools/rate-limit-poc
```

## Configuration

All options are set via environment variables:

| Variable            | Default                  | Description                                                |
| ------------------- | ------------------------ | ---------------------------------------------------------- |
| `REDIS_URL`         | `redis://localhost:6379` | Redis connection URL                                       |
| `ENDPOINT`          | `test-endpoint`          | Endpoint name (Redis key prefix)                           |
| `WORKERS`           | `1`                      | Parallel workers (simulates separate Lambda instances)     |
| `CONCURRENCY`       | `3000`                   | Requests per worker (burst) / lanes per worker (sustained) |
| `CAPACITY`          | `100`                    | Token bucket capacity                                      |
| `REFILL_PER_SEC`    | `20`                     | Token refill rate                                          |
| `FAILURE_THRESHOLD` | `5`                      | Failures before circuit opens                              |
| `COOLDOWN_MS`       | `30000`                  | Circuit breaker cool-down                                  |
| `SUCCESS_RATE`      | `0.9`                    | Simulated HTTP success rate (0–1)                          |
| `MIN_DELAY_MS`      | `5`                      | Min simulated HTTP delay                                   |
| `MAX_DELAY_MS`      | `50`                     | Max simulated HTTP delay                                   |
| `DURATION_SECS`     | `0`                      | Sustained mode duration (0 = burst mode)                   |

## Examples

10 workers, 3000 requests each, default rate limiting:

```bash
WORKERS=10 npm run start -w tools/rate-limit-poc
```

No rate limiting (capacity covers all requests):

```bash
WORKERS=10 CAPACITY=30000 SUCCESS_RATE=1.0 npm run start -w tools/rate-limit-poc
```

Sustained mode — 3 workers, 10 concurrent lanes each, running for 2 minutes:

```bash
WORKERS=3 CONCURRENCY=10 DURATION_SECS=120 npm run start -w tools/rate-limit-poc
```
