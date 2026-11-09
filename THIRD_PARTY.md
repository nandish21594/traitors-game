# Third-party notices

`public/vendor/qrcode.mjs`: qrcode-generator 2.0.4 by Kazuhiko Arase, MIT. Retrieved from the upstream `master/js/dist/qrcode.mjs` on 2026-11-06. SHA-256: `ea91d7118a5395289170da848b7c6758b996163bfbccf312591ab65a4911b7c0`. The accompanying license is in `public/vendor/QRCODE-LICENSE.txt`.

Upstream: https://github.com/kazuhikoarase/qrcode-generator

`public/vendor/pdfjs/`: Mozilla PDF.js (`pdfjs-dist`) 5.6.205, Apache-2.0, copied from the bundled runtime distribution. Its license is at `public/vendor/pdfjs/LICENSE.txt`; font, CMap, ICC and WASM subdirectories retain their distributed license files. It renders uploaded PDFs locally in a canvas; no CDN is used. Upstream: https://github.com/mozilla/pdf.js

The gameplay reference https://github.com/trevornogues/traitors-game was inspected for architecture and license status. No code or assets from that project were reused. Interface fonts are operating-system fonts; PDF.js retains its distributed font assets and licenses. Runtime server functionality uses Node.js standard libraries only.
