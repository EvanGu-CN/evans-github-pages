[out:json][timeout:180];
(
  way["leisure"](34.08,118.72,34.175,118.85);
  relation["leisure"](34.08,118.72,34.175,118.85);
  way["landuse"](34.08,118.72,34.175,118.85);
  relation["landuse"](34.08,118.72,34.175,118.85);
  way["natural"~"wood|scrub|grassland|heath|beach"](34.08,118.72,34.175,118.85);
);
out geom tags;
