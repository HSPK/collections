# MORROW

An original six-revolute-joint workcell for **pose solving, collision-aware motion
planning, and inspectable execution**. It is a local simulation, not an industrial
controller. There is no hardware API, networking, remote asset, audio, telemetry,
or external robot model.

## Start a complete task

Open `/projects/morrow/`. The initial study is **Transfer a coupon** and its source
pose is already solved. Choose **Plan motion**, then **Run motion**. At the goal,
choose **Grip coupon**. Select **Receiver**, plan again, run, and **Release at
receiver**. Completion depends on the actual released part's position and
orientation, not on a timer, button sequence, or target label.

On narrow screens, **Workcell / Inspector / Motion** are separate useful views.
The inspector has Pose, Joints and Program tabs at every size.

- **Inspection study:** an oblique position and orientation target.
- **Partition study:** both endpoints are clear but their direct joint sweep
  intersects a tall divider. The seeded planner searches for a detour.
- Source/receiver shortcuts select poses only. They do not move the robot,
  attach a part, relax collision checks, or install a trajectory.
- Scrubbing displays a certified state but leaves the live robot untouched.
  Gripping and releasing are disabled in inspection. Return to live before
  working with the actual state.
- Run and reverse follow the same certified joint-space edges. Step advances
  the actual state by 0.1 simulated seconds. All playback starts paused,
  including reduced-motion sessions.

## Frames and units

World coordinates are right-handed, **+Y up**, with X/Z in the table plane.
Internal position is metres, joint angle is radians, and time is seconds.
The displayed joint and intrinsic-XYZ Euler orientation fields use degrees.
Stored orientations are normalized quaternions `[x, y, z, w]`. The TCP points
along its local +X axis. Rotation errors are shortest world-frame SO(3)
logarithms of `q_target * inverse(q_current)`, invariant to quaternion sign.

For each joint:

```text
T_world_joint[i] = T_world_joint[i-1] * Translate(offset[i]) * Rotate(axis[i], q[i])
T_world_tool     = T_world_joint[5]   * Translate(0.14, 0, 0)
```

Offsets and axes are expressed in the **parent** and **local pre-rotation**
frames respectively. The joint's world axis is the parent orientation applied
to its local axis. There is no DH/Y-up conversion boundary.

| Joint | Parent translation, m | Local axis | Limits, degrees | Speed, degrees/s |
| --- | --- | --- | --- | --- |
| J1 Base | 0, .24, 0 | Y | -165 to 165 | 45 |
| J2 Shoulder | 0, .18, 0 | Z | -65 to 145 | 35 |
| J3 Elbow | .42, 0, 0 | Z | -150 to 145 | 45 |
| J4 Forearm roll | .36, 0, 0 | X | -175 to 175 | 70 |
| J5 Wrist pitch | .12, 0, 0 | Z | -105 to 105 | 60 |
| J6 Tool roll | .12, 0, 0 | X | -175 to 175 | 90 |

The renderer copies each exact post-joint FK position/quaternion to an
independent scene group. Link detail is built in that frame using fixed local
offsets. It never points a link at an independently computed endpoint.

## Solving, collisions, and bounds

**IK:** geometric spatial Jacobian, damped least squares, bounded step, projected
joint limits, and backtracking. Default budget is four deterministic starts of
160 iterations each (hard maximum six starts of 240). Angular rows/residuals
use a 0.35 m/rad weight. Convergence requires both <=1.5 mm position error and
<=0.012 rad orientation error (about 0.688 degrees). Residuals are always
measured against the unmodified requested pose. Failure is a budget result,
not an assertion of kinematic impossibility.

**Collision model:** six conservative link capsules, a fixed pedestal capsule,
axis-aligned obstacle boxes, and a spherical payload envelope. Capsule radii
are `.095, .067, .055, .046, .042, .039` m. Nonadjacent link pairs are checked,
as are distal links against the pedestal. Adjacent connected links intentionally
overlap and are exempt. The open gripper/loose coupon contact pair is exempt;
every other link/part pair is checked. Both loose and carried parts check
against the surface, pedestal and obstacles using the same sphere envelope and
12 mm margin. A loose part inside a fixture invalidates the world even when
the robot itself is clear.

The material geometry lies inside these conservative envelopes. The source
and receiver are static fixtures, not a rigid-body physics simulation. The
coupon's bounding sphere is 46 mm radius. Gripping requires <=25 mm and <=0.2
rad alignment; its nonzero local grasp transform is preserved exactly.
Releasing is permitted only within a 120 x 90 x 120 mm receiver-local envelope and
0.2 rad orientation tolerance, with positive static clearance above the margin.
Placement completion requires that same clearance; simply being inside the
receiver region is insufficient. There is no remote grasp or release teleport.
The positional tolerance rotates with the receiver frame drawn in the workcell,
rather than using a separate axis-aligned box in world coordinates.

All reported clearance is **excess above a 12 mm margin**. It is the capsule/
box model's separation, not a mesh-distance or industrial safety claim.
Segment/box distance is minimized exactly over its piecewise quadratics;
segment/segment distance handles parallel and degenerate segments.

**Swept edge certification:** interpolate limited joints without angle wrapping.
For an interval with joint changes `dq`, `sum(R_i * abs(dq_i))` bounds the
maximum decrease in any clearance from its midpoint: it is twice the
single-body half-interval displacement and therefore also covers self-collision.
`R = [1.6, 1.4, .98, .62, .5, .3]` m conservatively covers all downstream points
including the maximal permitted grasp offset and payload radius. Certify an
interval only if midpoint clearance exceeds this bound; otherwise subdivide.
The hard limits are depth 12 and 2,048 midpoint samples per edge. An unresolved
interval is rejected, never silently accepted. Returned edge clearance is a
sampled diagnostic; the certificate, rather than that sampled minimum, covers
the complete continuous edge. Loose-part/static-geometry clearance is checked
once before subdivision: an invalid stationary pair rejects the whole edge,
but a valid stationary pair is not charged the moving-body displacement bound.
It still contributes to the returned clearance diagnostic. Robot/loose-part
separation and every carried-payload pair remain moving-body checks.

**Planning:** deterministic seeded, bidirectional RRT-connect in bounded joint
space. A direct edge is tried first with the same swept certificate. Each
segment has <=900 outer iterations, <=1,800 nodes, <=6,000 edge attempts and
0.28-rad Euclidean extensions. Connection growth is bounded to 32 extensions
per iteration. Up to 28 deterministic shortcuts are independently certified.
Failure installs no path and explicitly does not prove impossibility.
The queue is limited to six waypoints plus the final target, and the combined
installed path is limited to 1,800 states. No unsafe straight-line fallback.

**Timing:** per-edge cubic smoothstep, with zero velocity at nodes. Duration
is at least `1.5 * max(abs(dq_i) / speed_i)` (minimum 0.12 s), so peak joint
speed respects each limit in either direction. Acceleration, jerk, torque,
contact dynamics and hardware suitability are not certified. The rendered
orange TCP line is a bounded visual sample of FK along that same trajectory;
it is not the planner's collision geometry.

## Modules and extension points

| Module | Responsibility |
| --- | --- |
| `arm.ts` | Typed joints/poses, transforms, FK, spatial Jacobian, quaternion errors, DLS IK, cancellable generator consumer |
| `collision.ts` | Primitive geometry, attachments, configuration clearance, conservative swept-edge certificates |
| `planner.ts` | Bounded seeded RRT-connect, certified shortcutting, speed-limited timing and sampling |
| `state.ts` | Three presets, fixtures, pick/place semantics, bounded history, generation tokens, versioned files |
| `renderer.ts` | Exact-frame scene graph, local geometry, camera, plane/axis targeting, labels, resource ownership |
| `ui.ts` | Accessible markup and real joint/timing trace |
| `index.ts` | State ownership, edit invalidation, async solve/plan lifecycle, playback and file actions |
| `style.css` | Scoped graphite/porcelain atelier and narrow-screen panes |

To add a robot: change joint definitions, renderer details and capsule radii
together; derive new conservative displacement radii before allowing execution.
Keep fixtures/Jacobian/swept regression coverage. To add a preset: add a known
clear start and a target **pose**, then obstacles to `PRESETS`; do not add
pre-recorded animation or a scripted motion bypass. To add a collision
primitive: implement a conservative signed separation compatible with the
same displacement certificate. If a payload envelope grows, recompute the
sweep bounds as well as grasp/import limits.

## Lifecycle, history, and files

IK/planning generators yield between bounded work units. The async consumer
returns to the event loop in <=8 iterations or roughly 10 ms batches, with
one individually bounded edge certificate as the planner's atomic unit.
Generation tokens and abort signals reject obsolete work. Pose/joint/seed/
waypoint/payload/study/import/history edits cancel pending work, stop playback,
and discard existing certificates. UI import completions use the same
generation gate.

Mount awaits the initial IK result before reporting ready. Idle rendering is
on demand; camera motion has no autoplay or damping loop. Abort destroys both
animation loops, OrbitControls, the resize observer, all geometry/materials,
the shadow target, and the WebGL context. No worker URL or external asset path
exists, so there is no root-relative worker/asset dependency under a
`/collections/` deployment.

History stores at most 24 deep-copied edit snapshots. Files are explicit local
downloads/uploads, not hidden persistence. `morrow-project` version 1 imports
are limited to 32 KB, six bounded joints, six queued poses, finite bounded
positions, unit quaternions, known preset IDs, and a bounded grasp transform.
Imports validate the current robot state and loose-part static clearance, never
relocate invalid parts or relax the margin, and never trust a saved trajectory.
`morrow-inspection-program` exports include timed joint nodes, their tool
frames, interpolation semantics and scene state, with an explicit
**SIMULATION ONLY / not commands for physical hardware** warning.

## Automation surface

- `.project-morrow[data-ready="true"]` and `[data-morrow-canvas][data-ready="true"]`
- `[data-project-preview]`: actual workcell, not a cover or alternate rendering
- `[data-morrow-preset]`: `transfer`, `inspection`, `detour`
- `[data-morrow-mode]`: `camera`, `xz`, `xy`, `yz`, `x`, `y`, `z`
- `[data-morrow-pose="x|y|z|rx|ry|rz"]`, `[data-morrow-joint="0"..."5"]`
- `[data-morrow-solve]`, `[data-morrow-plan]`, `[data-morrow-run]`,
  `[data-morrow-step]`, `[data-morrow-reverse]`, `[data-morrow-scrub]`,
  `[data-morrow-live]`, `[data-morrow-grip]`, `[data-morrow-release]`
- `[data-morrow-view="cell|inspector|motion"]`: narrow-screen views
- `[data-morrow-tab="pose|joints|program"]`: inspector tabs
- `[data-morrow-status]`, `[data-morrow-plan-state]`,
  `[data-morrow-motion-state]`, `[data-morrow-clearance]`
- Root `data-executing`, `data-inspection`, `data-task-complete` reflect actual
  execution/inspection/placement state.

The scoped existing Playwright runner covers numerical fixtures, finite
difference Jacobians, quaternion limits, IK failures, collision envelopes,
payload offsets, deterministic safe planning, every retained trajectory edge,
speed limits, bounded imports/history, cancellation, real desktop pick/place,
mobile input/resize/single-pointer ownership, and repeated mount/abort disposal.

```sh
SITE_URL=http://127.0.0.1:4173 npx playwright test tests/projects/morrow.spec.ts
```

Only software-WebGL browser cases use a 90-second budget. Pure cases retain the
host's ordinary budget. Screenshots are produced by the desktop/mobile cases;
traces remain enabled. No shared configuration, helper, dependency, other
project, or auto-order generator needs modification.
