#!/bin/bash
set -e

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
  -m cp -r dist/assets/* gs://cityjobs-data/assets/

# Upload index.html (not gzipped, small file)
echo "Uploading index.html..."
gsutil -h "Cache-Control:public, max-age=300" \
  cp dist/index.html gs://cityjobs-data/

echo "Deploy complete!"
