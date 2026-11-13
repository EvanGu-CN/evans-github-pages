"""GCJ-02 inverse for reference POIs; source OSM geometry remains WGS84.

This is a numerical coordinate conversion, not surveyed location accuracy.
"""
import math


def wgs84_to_gcj02(lon, lat):
    if not (72.004 <= lon <= 137.8347 and .8293 <= lat <= 55.8271): return lon, lat
    x, y = lon - 105, lat - 35
    dlat = -100 + 2*x + 3*y + .2*y*y + .1*x*y + .2*math.sqrt(abs(x))
    dlon = 300 + x + 2*y + .1*x*x + .1*x*y + .1*math.sqrt(abs(x))
    dlat += (20*math.sin(6*x*math.pi) + 20*math.sin(2*x*math.pi))*2/3
    dlat += (20*math.sin(y*math.pi) + 40*math.sin(y/3*math.pi))*2/3
    dlat += (160*math.sin(y/12*math.pi) + 320*math.sin(y*math.pi/30))*2/3
    dlon += (20*math.sin(6*x*math.pi) + 20*math.sin(2*x*math.pi))*2/3
    dlon += (20*math.sin(x*math.pi) + 40*math.sin(x/3*math.pi))*2/3
    dlon += (150*math.sin(x/12*math.pi) + 300*math.sin(x/30*math.pi))*2/3
    rad = lat*math.pi/180
    magic = 1 - .00669342162296594323*math.sin(rad)**2
    dlat = dlat*180/((6378245*(1-.00669342162296594323))/(magic*math.sqrt(magic))*math.pi)
    dlon = dlon*180/(6378245/math.sqrt(magic)*math.cos(rad)*math.pi)
    return lon+dlon, lat+dlat


def gcj02_to_wgs84(lon, lat):
    x, y = lon, lat
    for _ in range(10):
        a, b = wgs84_to_gcj02(x, y)
        dx, dy = a-lon, b-lat
        x -= dx; y -= dy
        if max(abs(dx), abs(dy)) < 1e-10: break
    return x, y
