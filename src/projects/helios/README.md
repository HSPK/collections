# HELIOS

A self-contained, lazy-loaded solar-system atlas and Earth observing instrument.
No runtime network assets, sensors, audio, or automatic camera movement. The
initial study is the computed local peak of the 8 April 2024 eclipse at Nazas,
Mexico (25.288 N, 104.015 W, 1,250 m). All playback starts paused.

## Workflows

- **Sky / totality:** arrive at Nazas's computed peak. Select C1/C2/Peak/C3/C4,
  scrub the contact interval, or step by a second/minute/hour/day. Move to Dallas,
  New York, or Sydney without changing UTC. A preset title never determines the
  instantaneous classification. The observation book includes independently
  searched Dallas total, Albuquerque annular, New York partial, and a Sydney
  same-instant nighttime contrast.
- **Moon:** select *Observe an evening Moon* for Cape Town on 17 April 2024 at
  18:00 UTC. Switch to London at the same instant. The illuminated hemisphere,
  local-up limb angle, and actual altitude follow the observer. New/first/full/
  last-quarter navigation searches a bounded 35-day interval.
- **Worlds:** select System, choose a body by its actual projected disk, label,
  or the numeric/select control, then Planet. Local orbit uses a floating origin
  at that body's physical heliocentric position. *Follow in system* follows its
  compressed display position instead. Every planet, the Sun, and Moon work.
  Earth alone provides a calibrated geodetic observing mode.
- **Keep:** version-1 JSON includes validated view state, UTC, site, physical
  readouts, conventions, and any available event contacts. Share links contain
  only versioned state. Imports ignore saved derived values and recompute them.
  Reset always uses a private copy of the initial computed Nazas observation.

On mobile, **System / Planet / Sky / Observe** are practical panes, not shrunken
desktop columns. Observe exposes the relevant current view's controls. The map
supports one pointer at a time and arrow-key movement; numeric coordinates are
always available. Canvas arrows orbit/pan; + / - zoom. Native dialogs provide
focus trapping, Escape, and focus return.

## Scientific conventions

The adapter uses the installed **astronomy-engine 2.1.19**, MIT, by Don Cross.
The actual `astronomy.d.ts` and `esm/astronomy.js` are the implementation reference.

| Quantity | Convention |
| --- | --- |
| Input time | Explicit UTC milliseconds, 1900-01-01 through 2100-12-31. No browser-local date interpretation. |
| UT / TT | Engine approximates UT1 as UTC; TT uses its default Espenak-Meeus Delta T. No live Earth-orientation or leap-second service. |
| System position | `HelioVector`: geometric, no aberration/light time, heliocentric EQJ/J2000, AU. |
| Display axes | `Rotation_EQJ_ECL` gives J2000 mean ecliptic. Three axes are `(ECL x, ECL z, -ECL y)`, a proper right-handed rotation. |
| Observer | `Observer(latitude, longitude, height)`: geodetic degrees north/east and meters above mean sea level. Engine rotating oblate-Earth observer position, not a spherical geocentric approximation. |
| Sky | `Equator(body,time,observer,false,true)` for topocentric EQJ vectors, and `Equator(...,true,true)` for EQD RA/Dec. `Horizon` takes **RA hours**, Dec degrees, and omitted refraction. |
| Sun light time | The engine's Sun `GeoVector` branch corrects light time and aberration. |
| Moon exception | Although the general Equator docs promise light-time correction, the installed `GeoVector(Moon)` source returns `GeoMoon` directly. HELIOS preserves and documents that engine convention instead of claiming additional correction. |
| Horizon frame | `Rotation_EQJ_HOR`: x=north, y=west, z=zenith. Azimuth increases north through east. Geometric horizon is the local tangent plane; no terrain, horizon dip, atmosphere, or optics inversion. |
| Distances / radii | Engine `KM_PER_AU = 149597870.69098932`. Sun radius 695700 km, Moon mean radius 1737.4 km. Angular radius is `asin(radius/distance)`. |
| Phase | Moon-to-Sun versus Moon-to-observer angle. Fraction `(1+cos(angle))/2`. Elongation is separately the observer's Sun/Moon separation. |
| Limb | Physical Moon-to-Sun vector projected onto horizon-up camera right/up; clockwise angle from local up. Degenerate zero projection is explicitly undefined. |
| Phase navigation | `SearchMoonPhase` finds geocentric ecliptic longitude differences, not topocentric 50% illumination roots. Searches begin one minute away, within +/-35 days. |
| Body frames | `RotationAxis` provides EQJ north pole, RA in hours, and prime-meridian spin W in degrees (IAU WGCCRE). Earth prime/east axes instead use `ObserverVector` at longitude 0/90 at the instant, so the map marker and local observer agree. |

### Eclipses and limits

Instantaneous classification is independent of event searches: robust
`atan2(|cross|,dot)` angular separation, circular containment and intersection
area, then none/partial/annular/total. Disk obscuration is **not brightness**.
Visibility is separate: above, intersects the horizon, or fully below. The
shader ray-clips the full sky against the opaque horizon; a tracked nighttime
Sun is not moved above ground.
The visibility flag maximizes altitude over the intersection of the two
spherical caps, not merely over either disk: overlapping portions can remain
invisible even when both upper limbs individually rise above the horizon.

`SearchLocalSolarEclipse` supplies local contacts and peak. Its internal loop
has no date bound, so browser calls run in a dedicated terminable worker with a
12-second deadline. Current searches accept a result only on the selected UTC
day; the new-Moon guard avoids needless searches on unrelated days. A returned
future eclipse is discarded, never displayed as today's event. *Next local
eclipse* is an explicit separate action, limited to five years and the UI date
range. It starts with a one-day lookback and advances candidates until their
local peak reaches the next UTC day: the engine searches by geocentric new Moon,
which can fall on a different date from the observer's eclipse. This prevents
repeated or skipped events around midnight.
The library skips fully nighttime eclipses, so a missing current timeline
does not erase instantaneous below-ground geometry. More precisely, its search
accepts an event when the refracted Sun-center altitude is positive at C1 or C4.
This is not terrain or full-limb visibility; HELIOS keeps its own instantaneous
unrefracted disk-intersection visibility separate.

The library's local shadow/contact model uses the mean Moon radius (1737.4 km).
Its own `SolarEclipseObscuration` instead uses the polar radius (1736 km) and a
non-total cap. That value is labeled `engineObscuration` in exports and is **not**
used to classify or draw the live disks. Shadow-cone contact roots versus angular
disk tangencies can differ by seconds. Every displayed contact altitude is
recomputed geometrically: library `EclipseEvent.altitude` includes normal
refraction, which HELIOS deliberately does not use.

The generic contact root search defaults to **one-second numerical tolerance**;
that is not a claim of one-second physical accuracy. The library also includes a
14-meter umbra-sign bias in its total/annular event-kind helper. HELIOS does not
copy that bias into live angular-disk classification. Astronomy Engine advertises
roughly +/-1 arcminute positional accuracy, not navigation-grade precision.
USNO uses a 696,000 km solar radius and different Delta T conventions, so reference
peak times are compared within one minute, not forced to second-exact equality.

### Independent height-zero reference fixtures

These research fixtures all use **0 m elevation**, not the actual elevations of
the UI's city presets. In particular, NASA's greatest-eclipse point near Nazas is
not the initial Nazas-town observer. No preset title or reference time overrides
the ephemeris.

| Site (latitude, east-positive longitude) | UTC date | Engine peak, rounded | USNO peak UT1 | Type |
| --- | --- | --- | --- | --- |
| NASA greatest point (25.2866667, -104.1383333) | 2024-04-08 | 18:17:19 | 18:17:14.7 | Total |
| Dallas (32.7767, -96.7970) | 2024-04-08 | 18:42:37 | 18:42:32.9 | Total |
| Albuquerque (35.0844, -106.6504) | 2023-10-14 | 16:36:54 | 16:36:54.2 | Annular |
| San Francisco (37.76, -122.44) | 2024-04-08 | 18:13:19 | 18:13:12.5 | Partial, about 34% |

At Dallas's height-zero peak, topocentric Sun/Moon separation is about 0.00697
degrees versus 0.42670 degrees geocentrically: removing parallax destroys
totality. Tokyo (35.6762, 139.6503, 0 m) has no selected-day event returned, and its
Sun is about 19 degrees below the horizon at Dallas's peak.

Albuquerque's height-zero annular peak obscuration is about **89.5998%** with the
library's polar-radius convention versus **89.7444%** with HELIOS's mean-radius
disks. Both are retained as distinct conventions, not reconciled by resizing
the Moon. Tests check these fixtures' mean-disk contact residuals below **0.23
arcsecond**; this is an internal geometry-consistency check, not claimed sky
accuracy.

No observatory-grade accuracy, measured topography, weather, corona photometry,
Baily's beads, lunar-eclipse shading, or universally accurate alien-surface
ephemerides are claimed. Giant planets are mean-radius cloud-top/reference
spheres, not solid ground.

## Rendering and resource ownership

- `math.ts`, `time.ts`: finite vector/disk math and strict UTC parsing.
- `data.ts`, `atlas.ts`: body/site/study data and original schematic geography.
- `astronomy.ts`: thin typed engine adapter; testable in Node without a DOM.
- `eclipse.ts`, `eclipse.worker.ts`, `search.ts`: current/next searches, typed
  worker boundary, cancellation/deadline, and bounded 24-entry cache.
- `state.ts`, `interchange.ts`: validated versioned state, cloned reset/history,
  initiation-order ownership tokens, and coherent observation export.
- `render.ts`, `shaders.ts`: cached ephemeris traces, shared sphere geometry,
  original procedural artwork, body-frame lighting, sky ray/sphere intersections.
- `index.ts`, `ui.ts`, `style.css`: lifecycle, controls, layout, and accessible
  native dialogs. `mount` waits for meaningful initial event/geometry.

System radial display is `12 log(1+2 distanceAU)`; radii are independently
enlarged. The Moon's Earth-relative offset is expanded by 1050 display units/AU.
These never enter physical distances, altitude, phase, eclipse, or angular-radius
calculations. Lighting always comes from physical vectors, never the displaced
display Sun. Orbit traces are sampled ephemerides over one approximate orbital
period, cached by month; they are traces, not a circular Keplerian substitute.

Earth texture and map share the same original continent polygons and longitude/
latitude convention. Their outlines, lunar albedo, cloud bands, stars, ambient
fill, ring art, and the restrained totality corona are illustrative artwork.
Sky optics preserve true angles with rectilinear projection, but their color,
attenuation, and slight lunar fill are not an exposure model. Corona is enabled
only for actual geometric totality with the entire Sun above the horizon.

Resting views render on demand. Playback recomputes a shared observation snapshot
at a bounded cadence; hidden pages pause and never accumulate wall-clock time.
If a next-event search interrupts pending current-date contacts, an intervening
edit invalidates that future jump and restores the current observation's contact
search. Canceled work cannot leave the timeline permanently marked as solving.
DPR is capped at 1.5, sphere geometry at 64 x 40. Teardown cancels animation and
searches, terminates workers, disconnects resize observers, aborts listeners,
disposes every tracked GPU resource/texture, closes ownership epochs, and removes
the canvas. Worker URLs use `new URL(..., import.meta.url)`, including deployment
under `/collections/projects/helios/`.

## Sources

- [Astronomy Engine official repository](https://github.com/cosinekitty/astronomy)
  and the installed 2.1.19 typed/ESM sources. The collection distributes the
  [full MIT notice](../../../public/third-party/astronomy-engine-LICENSE.txt);
  the field-notes dialog links to it with the shared base-aware `siteUrl` helper.
- [NASA: 8 April 2024 eclipse path](https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2024Apr08Tpath.html)
- [NASA: 14 October 2023 annular path](https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2023Oct14Apath.html)
- [Astronomy Engine 2.1.19 advertised accuracy](https://github.com/cosinekitty/astronomy/blob/v2.1.19/README.md#L77-L95)
- [Versioned local-eclipse implementation](https://github.com/cosinekitty/astronomy/blob/v2.1.19/source/js/astronomy.ts#L9049-L9268)
- [Versioned Moon light-time/aberration exception](https://github.com/cosinekitty/astronomy/blob/v2.1.19/source/js/astronomy.ts#L4339-L4356)
- [Versioned obscuration radius conventions](https://github.com/cosinekitty/astronomy/blob/v2.1.19/source/js/astronomy.ts#L8455-L8509)
- [Versioned umbra-sign convention](https://github.com/cosinekitty/astronomy/blob/v2.1.19/source/js/astronomy.ts#L8667-L8690)
- [USNO height-zero Dallas circumstances](https://aa.usno.navy.mil/api/eclipses/solar/date?date=2024-04-08&coords=32.7767,-96.7970&height=0)
- [USNO eclipse convention notes](https://aa.usno.navy.mil/data/Eclipse2024#notes)
- [IAU WGCCRE 2015 rotational elements](https://astropedia.astrogeology.usgs.gov/download/Docs/WGCCRE/WGCCRE2015reprint.pdf)
- [Espenak-Meeus Delta T polynomials](https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html)

## Owned checks and extension points

Run only `tests/projects/helios*.spec.ts` against the existing shared development
server. The deterministic models cover frames, planets, UTC, parallax, phases,
disk overlap, contacts and event dates, below-horizon behavior, state ownership,
export integrity, and reset isolation. Browser workflows cover rendered totality,
changed observer/time, Moon light, every planetary viewpoint, JSON/share restore,
mobile panes, and lifecycle. Screenshots are kept as test artifacts.

Useful selectors: `.project-helios[data-ready=true]`, `[data-h-host] canvas`,
`[data-h-view=system|planet|sky]`, `#h-body`, `[data-h-camera=orbit|ride]`,
`#h-site`, `#h-latitude`, `#h-longitude`, `#h-elevation`, `#h-utc`,
`[data-h-action=set-time]`, `[data-h-track=Sun|Moon|horizon]`, `#h-fov`,
`[data-h-contact=Peak]`, `#h-event-scrub`, `[data-h-study=nazas|dallas|annular|partial|night]`,
`[data-h-action=moon-study]`, `[data-h-action=keep]`, `#h-record`, `#h-file`.

Extensions should keep Earth observations and display transforms separate. If
adding a new apparent body, verify its light-time/aberration and frame conventions.
Do not infer surface observers from the mean-radius orbital meshes.
