[out:json][timeout:120];
(
  way["railway"~"rail|light_rail|subway|tram|narrow_gauge"](34.09,118.72,34.175,118.85);
  node["railway"="station"](34.09,118.72,34.175,118.85);
);
out geom tags;
