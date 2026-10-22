EVERCLOSE episode stills
========================
Drop real stills here (16:9, ~1200x675; current files are 1200x675 jpg q82 + webp q80):
  ep1.jpg  ep2.jpg  ep3.jpg  ep4.jpg  ep5.jpg  ep6.jpg     (+ optional ep1.webp ... ep6.webp)
Then switch each one on in assets/js/config.js -> episodes[n].image, e.g.
  image: "assets/img/episodes/ep1"      (no extension; .webp is used if `webp: true`, else .jpg)
Until then (image: "") the card shows the black/gold placeholder. If a configured file is missing,
the card falls back to the placeholder automatically.
Locked episodes are darkened and blurred by CSS, so you can upload normal, un-darkened stills.

Optional per-episode focal point: episodes[n].pos = "50% 40%" (CSS object-position).
