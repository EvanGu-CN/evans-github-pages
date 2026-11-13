[out:json][timeout:180];
(
  way["barrier"~"wall|fence|hedge|retaining_wall"](34.08,118.72,34.175,118.85);
  node["barrier"~"gate|lift_gate|entrance|bollard"](34.08,118.72,34.175,118.85);
  node["entrance"](34.08,118.72,34.175,118.85);
  way["amenity"="parking"](34.08,118.72,34.175,118.85);
  way["highway"="pedestrian"]["area"="yes"](34.08,118.72,34.175,118.85);
  way["landuse"="grass"](34.08,118.72,34.175,118.85);
  way["natural"="scrub"](34.08,118.72,34.175,118.85);
  way["leisure"="garden"](34.08,118.72,34.175,118.85);
  way["landcover"~"grass|trees"](34.08,118.72,34.175,118.85);
);
out geom tags;
