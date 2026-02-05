#!/bin/bash
set -e

# Load env from project root if available
[ -f "../.env" ] && set -a && source "../.env" && set +a

BUCKET="${GCS_BUCKET:?Set GCS_BUCKET in .env}"

# Build the project
echo "Building..."
npm run build

# Gzip compressible assets
echo "Compressing assets..."
cd dist/assets
for f in *.js *.css *.wasm; do
  if [ -f "$f" ]; then
    gzip -9 -f "$f"
    mv "$f.gz" "$f"
  fi
done
cd ../..

# Upload gzipped assets with Content-Encoding header
echo "Uploading compressed assets..."
gsutil -h "Content-Encoding:gzip" -h "Cache-Control:public, max-age=31536000" \
  -m cp -r dist/assets/* gs://${BUCKET}/assets/

# Upload index.html (not gzipped, small file)
echo "Uploading index.html..."
gsutil -h "Cache-Control:public, max-age=300" \
  cp dist/index.html gs://${BUCKET}/

echo "Deploy complete!"
