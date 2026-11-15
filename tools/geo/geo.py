"""World window: local east/north metres on a tangent plane around (LAT0, LON0). x = east, z = -north (south)."""
import math
LAT0, LON0 = 59.9753, 10.6800   # between Holmenkollbakken and Tryvannstårnet
SIZE = 4096.0                   # world edge in metres
_R = 6378137.0; _f = 1 / 298.257223563; _e2 = _f * (2 - _f)
_s = math.sin(math.radians(LAT0))
_M = _R * (1 - _e2) / (1 - _e2 * _s * _s) ** 1.5    # meridional radius
_Np = _R / math.sqrt(1 - _e2 * _s * _s)             # prime-vertical radius
MLAT = math.radians(1) * _M; MLON = math.radians(1) * _Np * math.cos(math.radians(LAT0))
def to_local(lat, lon): return (lon - LON0) * MLON, (lat - LAT0) * MLAT          # east, north
def to_latlon(e, n): return LAT0 + n / MLAT, LON0 + e / MLON
