# NYC Jobs Explorer

Browse and search NYC government job postings with client-side filtering powered by [DuckDB WASM](https://duckdb.org/docs/api/wasm/overview.html).

Data sourced from [NYC Open Data](https://data.cityofnewyork.us/City-Government/NYC-Jobs/kpav-sd4t). A GCP Cloud Function fetches daily snapshots, processes them with DuckDB into Parquet files, and stores them in Cloud Storage. The web UI loads the Parquet directly in the browser for fast, serverless querying.

**This project is not affiliated with or endorsed by the City of New York.**

## Setup

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with your GCP project, bucket name, etc.

# Python backend
uv sync
source .venv/bin/activate

# Web frontend
cd web && npm install
npm run dev       # Dev server at http://localhost:5173
npm run deploy    # Build + deploy to GCS
```

See `CLAUDE.md` for full development and deployment instructions.

## License

[AGPL-3.0](LICENSE)
