# MikeConverterTools

Browser-only converter for MIKE modelling inputs. Never upload user files or
introduce external analytics. GitHub Pages serves the built static site.

Use TypeScript for one shared conversion core, called by a Web Worker. Keep
the UI responsive and support cancellation by terminating the worker.
Use established libraries for DXF parsing and spatial indexing.

Preserve these rules: three-degree zones 25-45, default 37; zone prefixing is
not reprojection; reject different existing zone prefixes; filter Z strictly
below the threshold; layer TXT order is highest priority first; polygon
boundary points count as inside; uncovered points receive the last valid
layer value; any open polyline in a target layer aborts area assignment.

Write meaningful tests before behaviour changes. Run npm run check and
npm run test:browser. Check desktop/mobile layouts and actual downloads.
Do not commit project CAD/terrain data, secrets, node_modules or dist.

